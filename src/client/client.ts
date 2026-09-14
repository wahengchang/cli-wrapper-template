/**
 * The public client factory.
 *
 * `createCLI` is the only entry point a wrapper author needs: it normalizes the
 * schema once, then builds a nested object API whose leaves are callable
 * commands. All CLI-specific knowledge stays in the schema.
 */

import { buildArgs, formatCommandLine } from '../core/argument-builder.ts';
import {
  CLIExitError,
  CLIOutputParseError,
  CLITimeoutError,
  CLIUnknownCommandError,
  summarize,
} from '../core/errors.ts';
import { normalizeSchema } from '../core/schema.ts';
import type { CommandRegistry, NormalizedCommand } from '../core/schema.ts';
import { spawnExecutor } from '../core/runner.ts';
import type {
  CLIResult,
  CLISchema,
  Executor,
  ParamValue,
  RawResult,
  ResolvedRunOptions,
  RunOptions,
} from '../core/types.ts';
import { validateParams } from '../core/validate.ts';
import { closest } from '../core/validate.ts';
import {
  renderCommandTree,
  renderJson,
  renderMarkdown,
  renderText,
  resolveHelp,
  resolveParamHelp,
  searchCommands,
} from '../help/index.ts';
import type { HelpFormat, HelpModel } from '../help/index.ts';
import type { CLIClient, ClientApi, ClientDefaults, ClientHooks } from './types.ts';

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/** Options accepted by {@link createCLI}. */
export interface CreateCLIOptions<S extends CLISchema> extends ClientDefaults {
  /** The CLI definition. */
  schema: S;
  /** Override the executable from the schema, for example an absolute path. */
  binary?: string;
  /** Replace process execution. The seam used by tests, dry runs and sandboxes. */
  executor?: Executor;
  /** Observability hooks. */
  hooks?: ClientHooks;
  /** Root object name used in generated help and examples. Defaults to `cli`. */
  rootName?: string;
}

function resolveEnv(defaults: ClientDefaults, options: RunOptions): NodeJS.ProcessEnv | undefined {
  const mode = options.envMode ?? defaults.envMode ?? 'merge';
  const overrides = { ...defaults.env, ...options.env };

  if (mode === 'replace') {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) env[key] = value;
    }
    return env;
  }

  if (Object.keys(overrides).length === 0) return undefined;

  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function resolveRunOptions(defaults: ClientDefaults, options: RunOptions): ResolvedRunOptions {
  return {
    cwd: options.cwd ?? defaults.cwd,
    env: resolveEnv(defaults, options),
    timeout: options.timeout ?? defaults.timeout ?? 0,
    killSignal: options.killSignal ?? defaults.killSignal ?? 'SIGTERM',
    stdin: options.stdin,
    signal: options.signal,
    maxBuffer: options.maxBuffer ?? defaults.maxBuffer ?? DEFAULT_MAX_BUFFER,
  };
}

function parseOutput(command: NormalizedCommand, raw: RawResult, context: { binary: string; argv: string[] }): unknown {
  const parse = command.output?.parse;
  if (!parse || raw.exitCode !== 0) return undefined;

  try {
    if (parse === 'json') return JSON.parse(raw.stdout);
    if (parse === 'lines') {
      return raw.stdout
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line !== '');
    }
    return parse(raw.stdout, raw);
  } catch (error) {
    throw new CLIOutputParseError(
      `Failed to parse output of ${command.path}: ${error instanceof Error ? error.message : String(error)}`,
      {
        command: command.path,
        binary: context.binary,
        argv: context.argv,
        exitCode: raw.exitCode,
        stdout: raw.stdout,
        stderr: raw.stderr,
      },
      { cause: error },
    );
  }
}

/**
 * Create a typed client from a CLI schema.
 *
 * @example
 * ```ts
 * const git = createCLI({ schema: gitSchema, cwd: '/repo' });
 * const result = await git.log({ maxCount: 5 });
 * ```
 */
export function createCLI<const S extends CLISchema>(options: CreateCLIOptions<S>): CLIClient<S> {
  const registry = normalizeSchema(options.schema);
  return buildClient<S>(registry, options, {
    cwd: options.cwd,
    env: options.env,
    envMode: options.envMode,
    timeout: options.timeout,
    killSignal: options.killSignal,
    maxBuffer: options.maxBuffer,
    throwOnNonZero: options.throwOnNonZero,
    globalArgs: options.globalArgs,
  });
}

function buildClient<S extends CLISchema>(
  registry: CommandRegistry,
  options: CreateCLIOptions<S>,
  defaults: ClientDefaults,
): CLIClient<S> {
  const binary = options.binary ?? registry.binary;
  const executor = options.executor ?? spawnExecutor;
  const hooks = options.hooks ?? {};
  const rootName = options.rootName ?? 'cli';
  const globalArgs = [...registry.globalArgs, ...(defaults.globalArgs ?? [])];

  const requireCommand = (path: string): NormalizedCommand => {
    const command = registry.commands.get(path);
    if (command) return command;
    const suggestion = closest(path, registry.paths);
    throw new CLIUnknownCommandError(
      `Unknown command: ${path}` + (suggestion !== null ? `\n\nDid you mean:\n\n  ${suggestion}` : ''),
      suggestion !== null ? [suggestion] : [],
    );
  };

  const toArgv = (path: string, params?: Record<string, unknown>, runOptions: RunOptions = {}): string[] => {
    const command = requireCommand(path);
    const values: Record<string, ParamValue> = validateParams(command, params);
    return buildArgs(command, values, { globalArgs, extraArgs: runOptions.extraArgs });
  };

  const run = async (
    path: string,
    params?: Record<string, unknown>,
    runOptions: RunOptions = {},
  ): Promise<CLIResult<unknown>> => {
    const command = requireCommand(path);
    const argv = toArgv(path, params, runOptions);
    const resolved = resolveRunOptions(defaults, runOptions);

    await hooks.beforeRun?.({ command: command.path, binary, argv });

    let raw: RawResult;
    try {
      raw = await executor(binary, argv, resolved);
    } catch (error) {
      await hooks.onError?.({ command: command.path, binary, argv, error });
      throw error;
    }

    const context = {
      command: command.path,
      binary,
      argv,
      exitCode: raw.exitCode,
      stdout: raw.stdout,
      stderr: raw.stderr,
      signal: raw.signal,
      cwd: resolved.cwd,
    };

    if (raw.timedOut) {
      const error = new CLITimeoutError(
        `${binary} ${command.argv.join(' ')} timed out after ${resolved.timeout}ms.`,
        resolved.timeout,
        context,
      );
      await hooks.onError?.({ command: command.path, binary, argv, error });
      throw error;
    }

    const throwOnNonZero = runOptions.throwOnNonZero ?? defaults.throwOnNonZero ?? true;
    if (raw.exitCode !== 0 && throwOnNonZero) {
      const detail = summarize(raw.stderr || raw.stdout);
      const error = new CLIExitError(
        `${binary} ${command.argv.join(' ')} exited with code ${raw.exitCode}.` + (detail ? `\n\n${detail}` : ''),
        context,
      );
      await hooks.onError?.({ command: command.path, binary, argv, error });
      throw error;
    }

    const result: CLIResult<unknown> = {
      ...raw,
      binary,
      command: command.path,
      argv,
      data: parseOutput(command, raw, { binary, argv }),
    };

    await hooks.afterRun?.({ command: command.path, result });
    return result;
  };

  const formatHelp = (model: HelpModel, format: HelpFormat): string => {
    if (format === 'markdown') return renderMarkdown(model);
    if (format === 'json') return renderJson(model);
    return renderText(model);
  };

  const api: ClientApi<S> = {
    binary,
    registry,
    commands: () => [...registry.paths],
    hasCommand: (path) => registry.commands.has(path),
    getCommand: (path) => registry.commands.get(path),
    help: (path, format = 'text') => formatHelp(resolveHelp(registry, path, rootName), format),
    getHelp: (path) => resolveHelp(registry, path, rootName),
    getParamHelp: (commandPath, paramName) => resolveParamHelp(registry, commandPath, paramName),
    searchHelp: (query, searchOptions) => searchCommands(registry, query, searchOptions),
    tree: () => renderCommandTree(registry),
    toArgv,
    toCommandLine: (path, params, runOptions) => formatCommandLine(binary, toArgv(path, params, runOptions)),
    run,
    nativeHelp: async (path, nativeOptions = {}) => {
      const { flag = '--help', ...runOptions } = nativeOptions;
      const command = path === undefined ? undefined : registry.commands.get(path) ?? registry.groups.get(path);
      const words = command ? command.argv : (path ?? '').trim().split(/\s+/).filter(Boolean);
      const argv = [...globalArgs, ...words, flag];
      const resolved = resolveRunOptions(defaults, runOptions);
      const raw = await executor(binary, argv, resolved);
      return { ...raw, binary, command: path ?? '', argv, data: undefined };
    },
    with: (overrides) => buildClient<S>(registry, options, { ...defaults, ...overrides }),
  };

  return assembleNodes<S>(registry, api, rootName, run, toArgv, binary, formatHelp);
}

function assembleNodes<S extends CLISchema>(
  registry: CommandRegistry,
  api: ClientApi<S>,
  rootName: string,
  run: (path: string, params?: Record<string, unknown>, options?: RunOptions) => Promise<CLIResult<unknown>>,
  toArgv: (path: string, params?: Record<string, unknown>, options?: RunOptions) => string[],
  binary: string,
  formatHelp: (model: HelpModel, format: HelpFormat) => string,
): CLIClient<S> {
  const makeCommand = (command: NormalizedCommand): ((...args: unknown[]) => Promise<CLIResult<unknown>>) => {
    const invoke = (params?: Record<string, unknown>, options?: RunOptions): Promise<CLIResult<unknown>> =>
      run(command.path, params, options);

    return Object.assign(invoke as (...args: unknown[]) => Promise<CLIResult<unknown>>, {
      path: command.path,
      schema: command,
      help: (format: HelpFormat = 'text') => formatHelp(resolveHelp(registry, command.path, rootName), format),
      getHelp: () => resolveHelp(registry, command.path, rootName),
      toArgv: (params?: Record<string, unknown>, options?: RunOptions) => toArgv(command.path, params, options),
      toCommandLine: (params?: Record<string, unknown>, options?: RunOptions) =>
        formatCommandLine(binary, toArgv(command.path, params, options)),
    });
  };

  const build = (path: string): unknown => {
    const group = registry.groups.get(path);
    if (!group) return makeCommand(registry.commands.get(path) as NormalizedCommand);

    const children: Record<string, unknown> = {};
    for (const childPath of group.children) {
      const key = childPath.slice(path.length + 1);
      children[key] = build(childPath);
    }

    if (group.invokable) {
      const command = registry.commands.get(path);
      if (command) return Object.assign(makeCommand(command), children);
    }
    return children;
  };

  const root: Record<string, unknown> = {};
  for (const node of registry.tree.children) {
    root[node.key] = build(node.path);
  }

  root['$'] = api;
  for (const [key, value] of Object.entries(api)) {
    if (!(key in root)) root[key] = value;
  }

  return root as CLIClient<S>;
}
