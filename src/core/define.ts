/**
 * Identity helpers that preserve literal types.
 *
 * Wrapping a schema in `defineSchema` keeps `required: true` and enum values as
 * literal types, which is what gives the generated client precise parameter
 * types without a code generation step.
 */

import type { CLISchema, CommandSpec, ParamSpec } from './types.ts';

/** Define a CLI schema, preserving literal types. */
export function defineSchema<const S extends CLISchema>(schema: S): S {
  return schema;
}

/** Define one command or group, preserving literal types. */
export function defineCommand<const C extends CommandSpec>(command: C): C {
  return command;
}

/** Define a reusable parameter set, preserving literal types. */
export function defineParams<const P extends Record<string, ParamSpec>>(params: P): P {
  return params;
}
