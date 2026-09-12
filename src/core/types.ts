/**
 * Public type contracts for the CLI wrapper template.
 *
 * These types are the single source of truth: the runtime, the validation
 * layer, the help system and the documentation generator all read the same
 * schema. Nothing here is specific to a particular CLI.
 */

/** Supported parameter types. */
export type ParamKind = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]';

/** A value a parameter can hold. */
export type ParamValue = string | number | boolean | readonly string[] | readonly number[];

/**
 * Declarative description of a single parameter.
 *
 * A parameter is either a flag (`--name value`) or a positional argument.
 * By default the CLI flag is derived from the JS key: `projectId` -> `--project-id`.
 */
export interface ParamSpec {
  /** Value type. Drives argv generation, validation and the generated TS types. */
  type: ParamKind;

  /**
   * Explicit CLI flag, including leading dashes (`--project-id`, `-C`).
   * Defaults to `--` + kebab-case of the JS key. Ignored when `positional` is set.
   */
  flag?: string;

  /** Emit as a positional argument instead of a flag. Ordered by declaration order. */
  positional?: boolean;

  /** Reject the call when the caller omits this parameter. */
  required?: boolean;

  /**
   * The default the *underlying CLI* applies when the flag is omitted.
   * Documentation only: it is shown in help and docs but never sent to the CLI,
   * so the wrapper does not change CLI semantics. See `applyDefault`.
   */
  default?: ParamValue;

  /**
   * Send `default` when the caller omits the parameter.
   * Opt-in, because it makes the wrapper behave differently from the bare CLI.
   */
  applyDefault?: boolean;

  /** Human readable description, surfaced in help and docs. */
  description?: string;

  /** Allowed values. Validated at runtime and narrowed in the generated types. */
  values?: readonly string[];

  /** Emit `--flag=value` instead of `--flag value`. */
  assign?: boolean;

  /**
   * For array types: join values with this delimiter and emit the flag once.
   * By default the flag is repeated per value.
   */
  delimiter?: string;

  /**
   * For boolean types: flag emitted when the value is `false`
   * (for example `--no-verify`). Without it, `false` emits nothing.
   */
  falseFlag?: string;

  /** Alternative CLI spellings. Documentation only. */
  aliases?: readonly string[];

  /** Mark as deprecated; the string form is shown as the reason. */
  deprecated?: boolean | string;

  /** Extra usage notes for help and docs. */
  notes?: string;

  /**
   * Allow a positional value to start with `-`.
   *
   * Positional values that look like flags are rejected by default, because a
   * caller-supplied value would otherwise be able to inject an unintended
   * option into the command line. Opt in when the CLI genuinely accepts such
   * values (for example a negative number).
   */
  allowDashValue?: boolean;
}

/** How to turn stdout into `result.data`. */
export interface OutputSpec {
  /**
   * `'json'` parses stdout as JSON, `'lines'` splits non-empty lines,
   * or supply a function. The function's return type becomes `result.data`'s type.
   */
  parse?: 'json' | 'lines' | ((stdout: string, result: RawResult) => unknown);

  /** Name of the TypeScript type of `result.data`, for documentation. */
  type?: string;

  /** Description of the output, for documentation. */
  description?: string;
}

/** A reusable example, rendered as both a JS call and its CLI equivalent. */
export interface ExampleSpec {
  title: string;
  description?: string;
  params?: Record<string, ParamValue>;
}

/** Declarative description of one command or one group of commands. */
export interface CommandSpec {
  /**
   * CLI word(s) for this node. Defaults to kebab-case of the JS key.
   * Use `[]` for a pure namespace that adds no CLI word.
   */
  command?: string | readonly string[];

  /** Short description, surfaced in help and docs. */
  description?: string;

  /** Parameters accepted by this command. */
  params?: Record<string, ParamSpec>;

  /** Nested subcommands. A node with `commands` is a group. */
  commands?: Record<string, CommandSpec>;

  /** Make a group callable itself (for example `git stash` with `git stash push`). */
  invokable?: boolean;

  /** Examples used by help and docs. */
  examples?: readonly ExampleSpec[];

  /** Structured output handling. */
  output?: OutputSpec;

  /** Mark as deprecated; the string form is shown as the reason. */
  deprecated?: boolean | string;

  /** Extra usage notes for help and docs. */
  notes?: string;

  /** Related command paths, for example `['project.list']`. */
  related?: readonly string[];

  /**
   * Word emitted before the first positional argument, typically `--`.
   * Used by CLIs that separate options from paths, such as `git log -- <path>`.
   */
  positionalSeparator?: string;
}

/** A complete CLI definition: one binary plus its command tree. */
export interface CLISchema {
  /** Executable name or absolute path, for example `git`. */
  binary: string;

  /** Description of the tool, shown at the top of help and docs. */
  description?: string;

  /** Arguments always inserted before the command words, for example `['--no-pager']`. */
  globalArgs?: readonly string[];

  /** The command tree. Keys are the JS property names. */
  commands: Record<string, CommandSpec>;
}

/** Per-call execution options. */
export interface RunOptions {
  /** Working directory for the child process. */
  cwd?: string;

  /** Environment variables. Merged over `process.env` unless `envMode` is `'replace'`. */
  env?: Record<string, string | undefined>;

  /** `'merge'` (default) extends `process.env`; `'replace'` passes only `env`. */
  envMode?: 'merge' | 'replace';

  /** Milliseconds before the process is killed. `0` disables the timeout. */
  timeout?: number;

  /** Signal used when the timeout expires. Defaults to `SIGTERM`. */
  killSignal?: NodeJS.Signals;

  /** Data written to the child's stdin. */
  stdin?: string | Uint8Array;

  /** Abort the child process externally. */
  signal?: AbortSignal;

  /** Throw `CLIExitError` on a non-zero exit code. Defaults to `true`. */
  throwOnNonZero?: boolean;

  /** Maximum bytes captured per stream. Defaults to 10 MiB. */
  maxBuffer?: number;

  /** Extra raw arguments appended after generated argv. Escape hatch for unmodelled flags. */
  extraArgs?: readonly string[];
}

/** What the process runner returns, before schema-driven parsing. */
export interface RawResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
}

/**
 * The result of a command invocation.
 *
 * Raw CLI output is always preserved; `data` is added only when the command
 * schema declares an output parser.
 */
export interface CLIResult<T = undefined> extends RawResult {
  /** Binary that was executed. */
  binary: string;

  /** JS command path, for example `project.create`. */
  command: string;

  /** Full argument vector passed to the binary. */
  argv: string[];

  /** Parsed structured output, when the command declares an output parser. */
  data: T;
}

/**
 * The single extension point for process execution.
 *
 * The default implementation spawns a child process; tests and dry-run modes
 * supply their own without touching any other layer.
 */
export type Executor = (
  binary: string,
  argv: string[],
  options: ResolvedRunOptions,
) => Promise<RawResult>;

/** Run options after client-level defaults have been applied. */
export interface ResolvedRunOptions {
  cwd: string | undefined;
  env: NodeJS.ProcessEnv | undefined;
  timeout: number;
  killSignal: NodeJS.Signals;
  stdin: string | Uint8Array | undefined;
  signal: AbortSignal | undefined;
  maxBuffer: number;
}
