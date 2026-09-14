/**
 * Public entry point.
 *
 * Layering (dependencies only ever point right to left):
 *
 *   core  <-  help  <-  client
 *   core  <-  help  <-  docs
 *
 * `core` knows nothing about help, docs or any particular CLI.
 */

export { createCLI } from './client/client.ts';
export type { CreateCLIOptions } from './client/client.ts';
export type {
  CallArgs,
  CLIClient,
  ClientApi,
  ClientDefaults,
  ClientHooks,
  ClientNode,
  CommandApi,
  CommandFn,
  DataOf,
  ParamsOf,
  ParamValueType,
} from './client/types.ts';

export { defineCommand, defineParams, defineSchema } from './core/define.ts';

export type {
  CLIResult,
  CLISchema,
  CommandSpec,
  Executor,
  ExampleSpec,
  OutputSpec,
  ParamKind,
  ParamSpec,
  ParamValue,
  RawResult,
  ResolvedRunOptions,
  RunOptions,
} from './core/types.ts';

export { buildArgs, formatCommandLine, quoteArgument } from './core/argument-builder.ts';
export type { BuildArgsOptions } from './core/argument-builder.ts';
export { normalizeSchema } from './core/schema.ts';
export type {
  CommandRegistry,
  NormalizedCommand,
  NormalizedGroup,
  NormalizedParam,
  RegistryNode,
} from './core/schema.ts';
export { spawnExecutor } from './core/runner.ts';
export { validateParams } from './core/validate.ts';
export { camelToKebab, defaultFlag, kebabToCamel } from './core/naming.ts';

export {
  CLIBinaryNotFoundError,
  CLIError,
  CLIExitError,
  CLIOutputParseError,
  CLISchemaError,
  CLISpawnError,
  CLITimeoutError,
  CLIUnknownCommandError,
  CLIValidationError,
} from './core/errors.ts';
export type { CLIErrorCode, CLIErrorContext } from './core/errors.ts';

export type { HelpFormat, HelpModel, CommandHelp, GroupHelp, RootHelp, ParamHelp } from './help/index.ts';
