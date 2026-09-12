/**
 * Error model.
 *
 * Every failure mode the draft calls out gets its own class, and every error
 * preserves the context needed to debug it (command, argv, exit code, output).
 * CLI failures are never hidden behind a generic exception.
 */

/** Context attached to every error raised by a wrapper. */
export interface CLIErrorContext {
  /** JS command path, for example `project.create`. */
  command?: string;
  /** Executable that was (to be) run. */
  binary?: string;
  /** Full argument vector. */
  argv?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  signal?: NodeJS.Signals | null;
  /** Working directory of the child process. */
  cwd?: string;
}

/** Machine-readable discriminator, useful for `switch` in consumer code. */
export type CLIErrorCode =
  | 'SCHEMA_INVALID'
  | 'VALIDATION_FAILED'
  | 'BINARY_NOT_FOUND'
  | 'SPAWN_FAILED'
  | 'TIMEOUT'
  | 'NON_ZERO_EXIT'
  | 'OUTPUT_PARSE_FAILED'
  | 'UNKNOWN_COMMAND';

/** Base class for every error thrown by a wrapper. */
export class CLIError extends Error {
  readonly code: CLIErrorCode;
  readonly command: string | undefined;
  readonly binary: string | undefined;
  readonly argv: string[] | undefined;
  readonly exitCode: number | undefined;
  readonly stdout: string | undefined;
  readonly stderr: string | undefined;
  readonly signal: NodeJS.Signals | null | undefined;
  readonly cwd: string | undefined;

  constructor(code: CLIErrorCode, message: string, context: CLIErrorContext = {}, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.command = context.command;
    this.binary = context.binary;
    this.argv = context.argv;
    this.exitCode = context.exitCode;
    this.stdout = context.stdout;
    this.stderr = context.stderr;
    this.signal = context.signal;
    this.cwd = context.cwd;
  }

  /** Plain object form, handy for logging and tests. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      command: this.command,
      binary: this.binary,
      argv: this.argv,
      exitCode: this.exitCode,
      stdout: this.stdout,
      stderr: this.stderr,
      signal: this.signal,
      cwd: this.cwd,
    };
  }
}

/** The schema itself is malformed. Raised when the client is created. */
export class CLISchemaError extends CLIError {
  /** Individual problems found in the schema. */
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super('SCHEMA_INVALID', message);
    this.issues = issues;
  }
}

/** The caller passed parameters the schema rejects. No process was started. */
export class CLIValidationError extends CLIError {
  /** One entry per invalid or missing parameter. */
  readonly issues: string[];

  constructor(message: string, issues: string[], context: CLIErrorContext = {}) {
    super('VALIDATION_FAILED', message, context);
    this.issues = issues;
  }
}

/** A command path was requested that the schema does not define. */
export class CLIUnknownCommandError extends CLIError {
  /** Closest known command paths, for "did you mean" output. */
  readonly suggestions: string[];

  constructor(message: string, suggestions: string[] = []) {
    super('UNKNOWN_COMMAND', message);
    this.suggestions = suggestions;
  }
}

/** The binary does not exist or is not executable. */
export class CLIBinaryNotFoundError extends CLIError {
  constructor(message: string, context: CLIErrorContext = {}, options?: { cause?: unknown }) {
    super('BINARY_NOT_FOUND', message, context, options);
  }
}

/** The process could not be started, or failed for a reason other than its exit code. */
export class CLISpawnError extends CLIError {
  constructor(message: string, context: CLIErrorContext = {}, options?: { cause?: unknown }) {
    super('SPAWN_FAILED', message, context, options);
  }
}

/** The process exceeded its timeout and was killed. */
export class CLITimeoutError extends CLIError {
  /** Timeout that was exceeded, in milliseconds. */
  readonly timeout: number;

  constructor(message: string, timeout: number, context: CLIErrorContext = {}) {
    super('TIMEOUT', message, context);
    this.timeout = timeout;
  }
}

/** The CLI ran and exited with a non-zero status. */
export class CLIExitError extends CLIError {
  constructor(message: string, context: CLIErrorContext = {}) {
    super('NON_ZERO_EXIT', message, context);
  }
}

/** stdout could not be parsed by the command's output parser. */
export class CLIOutputParseError extends CLIError {
  constructor(message: string, context: CLIErrorContext = {}, options?: { cause?: unknown }) {
    super('OUTPUT_PARSE_FAILED', message, context, options);
  }
}

/** Truncate long CLI output so error messages stay readable. */
export function summarize(text: string, limit = 500): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}… (${trimmed.length - limit} more characters)`;
}
