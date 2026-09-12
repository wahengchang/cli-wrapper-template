/**
 * Type-level projection from schema to public API.
 *
 * These conditional types are what makes `createCLI` return a fully typed
 * client without a code generation step: required parameters stay required,
 * enums narrow to unions, and output parsers determine `result.data`.
 */

import type { NormalizedCommand } from '../core/schema.ts';
import type { CLIResult, CLISchema, CommandSpec, ParamSpec, RunOptions } from '../core/types.ts';
import type { CommandHelp, HelpFormat, HelpModel, ParamHelp, SearchOptions, SearchResult } from '../help/index.ts';
import type { CommandRegistry } from '../core/schema.ts';

/** JS type of one parameter. */
export type ParamValueType<P extends ParamSpec> = P extends { values: readonly (infer V extends string)[] }
  ? P['type'] extends 'string[]'
    ? V[]
    : V
  : P['type'] extends 'string'
    ? string
    : P['type'] extends 'number'
      ? number
      : P['type'] extends 'boolean'
        ? boolean
        : P['type'] extends 'string[]'
          ? string[]
          : P['type'] extends 'number[]'
            ? number[]
            : never;

type RequiredParamKeys<P extends Record<string, ParamSpec>> = {
  [K in keyof P]-?: P[K] extends { required: true } ? K : never;
}[keyof P];

/** Parameter object accepted by one command. */
export type ParamsOf<C extends CommandSpec> = C['params'] extends Record<string, ParamSpec>
  ? { [K in RequiredParamKeys<C['params']>]: ParamValueType<C['params'][K]> } & {
      [K in Exclude<keyof C['params'], RequiredParamKeys<C['params']>>]?: ParamValueType<C['params'][K]>;
    }
  : Record<string, never>;

/** Type of `result.data` for one command. */
export type DataOf<C extends CommandSpec> = C extends { output: { parse: infer P } }
  ? P extends (...args: never[]) => infer R
    ? Awaited<R>
    : P extends 'json'
      ? unknown
      : P extends 'lines'
        ? string[]
        : undefined
  : undefined;

type HasRequiredParams<C extends CommandSpec> = C['params'] extends Record<string, ParamSpec>
  ? [RequiredParamKeys<C['params']>] extends [never]
    ? false
    : true
  : false;

/** Call signature arguments: the parameter object is optional when nothing is required. */
export type CallArgs<C extends CommandSpec> = HasRequiredParams<C> extends true
  ? [params: ParamsOf<C>, options?: RunOptions]
  : [params?: ParamsOf<C>, options?: RunOptions];

/** Introspection attached to every command function. */
export interface CommandApi<C extends CommandSpec> {
  /** JS command path, for example `project.create`. */
  readonly path: string;
  /** Normalized schema for this command. */
  readonly schema: NormalizedCommand;
  /** Formatted help for this command. */
  help(format?: HelpFormat): string;
  /** Structured help for this command. */
  getHelp(): CommandHelp;
  /** Argument vector this call would produce, without running anything. */
  toArgv(...args: CallArgs<C>): string[];
  /** Copy-pasteable CLI line this call would produce. */
  toCommandLine(...args: CallArgs<C>): string;
}

/** A callable command node. */
export type CommandFn<C extends CommandSpec> = ((...args: CallArgs<C>) => Promise<CLIResult<DataOf<C>>>) &
  CommandApi<C>;

/** A node of the public API: a namespace, a command, or a callable namespace. */
export type ClientNode<C extends CommandSpec> = C extends { commands: infer M extends Record<string, CommandSpec> }
  ? (C extends { invokable: true } ? CommandFn<C> : unknown) & { [K in keyof M]: ClientNode<M[K]> }
  : CommandFn<C>;

/** Client-level execution defaults. */
export interface ClientDefaults {
  cwd?: string;
  env?: Record<string, string | undefined>;
  envMode?: 'merge' | 'replace';
  timeout?: number;
  killSignal?: NodeJS.Signals;
  maxBuffer?: number;
  throwOnNonZero?: boolean;
  /** Extra arguments inserted before the command words, in addition to the schema's. */
  globalArgs?: readonly string[];
}

/** Observability hooks. They cannot alter the call; use them for logging and metrics. */
export interface ClientHooks {
  beforeRun?: (event: { command: string; binary: string; argv: string[] }) => void | Promise<void>;
  afterRun?: (event: { command: string; result: CLIResult<unknown> }) => void | Promise<void>;
  onError?: (event: { command: string; binary: string; argv: string[]; error: unknown }) => void | Promise<void>;
}

/** Meta API, always available as `cli.$` and aliased on the root where names are free. */
export interface ClientApi<S extends CLISchema> {
  /** Executable being wrapped. */
  readonly binary: string;
  /** Normalized registry shared by runtime, help and docs. */
  readonly registry: CommandRegistry;
  /** Every invokable command path. */
  commands(): string[];
  hasCommand(path: string): boolean;
  getCommand(path: string): NormalizedCommand | undefined;
  /** Formatted help. Omit the path for root help. */
  help(path?: string, format?: HelpFormat): string;
  /** Structured help. Omit the path for root help. */
  getHelp(path?: string): HelpModel;
  /** Help for a single parameter. */
  getParamHelp(commandPath: string, paramName: string): ParamHelp;
  /** Command discovery by substring. */
  searchHelp(query: string, options?: SearchOptions): SearchResult[];
  /** The command tree as an ASCII tree. */
  tree(): string;
  /** Argument vector a call would produce. */
  toArgv(path: string, params?: Record<string, unknown>, options?: RunOptions): string[];
  /** CLI line a call would produce. */
  toCommandLine(path: string, params?: Record<string, unknown>, options?: RunOptions): string;
  /** Invoke a command by path. */
  run(path: string, params?: Record<string, unknown>, options?: RunOptions): Promise<CLIResult<unknown>>;
  /** Run the wrapped CLI's own `--help`, separate from wrapper help. */
  nativeHelp(path?: string, options?: RunOptions & { flag?: string }): Promise<CLIResult<undefined>>;
  /** A client with different execution defaults, sharing this registry. */
  with(defaults: ClientDefaults): CLIClient<S>;
}

/**
 * The public client.
 *
 * Command names always win over meta methods: the meta API is reachable at
 * `cli.$`, and aliased at the root only for names the schema does not use.
 */
export type CLIClient<S extends CLISchema> = { [K in keyof S['commands']]: ClientNode<S['commands'][K]> } & {
  $: ClientApi<S>;
} & Omit<ClientApi<S>, Extract<keyof S['commands'], string>>;
