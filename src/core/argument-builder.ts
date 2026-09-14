/**
 * The one generic argument builder.
 *
 * Every layer that needs an argv — the runtime, help, docs, tests — calls this
 * function. No command-specific code ever assembles arguments by hand.
 */

import type { NormalizedCommand, NormalizedParam } from './schema.ts';
import type { ParamValue } from './types.ts';

export interface BuildArgsOptions {
  /** Arguments inserted before the command words, for example `['--no-pager']`. */
  globalArgs?: readonly string[];
  /** Raw arguments appended after everything else. */
  extraArgs?: readonly string[];
}

function flagWithValue(param: NormalizedParam, value: string): string[] {
  const flag = param.flag as string;
  return param.assign ? [`${flag}=${value}`] : [flag, value];
}

function emitFlag(param: NormalizedParam, value: ParamValue): string[] {
  if (param.type === 'boolean') {
    if (value === true) return [param.flag as string];
    if (value === false && param.falseFlag !== undefined) return [param.falseFlag];
    return [];
  }

  if (param.array) {
    const items = (value as readonly (string | number)[]).map(String);
    if (items.length === 0) return [];
    if (param.delimiter !== undefined) return flagWithValue(param, items.join(param.delimiter));
    return items.flatMap((item) => flagWithValue(param, item));
  }

  return flagWithValue(param, String(value));
}

function emitPositional(param: NormalizedParam, value: ParamValue): string[] {
  if (param.array) return (value as readonly (string | number)[]).map(String);
  return [String(value)];
}

/**
 * Turn validated parameter values into a complete argument vector.
 *
 * Order is: global arguments, command words, flags in declaration order,
 * optional positional separator, positionals in declaration order, extra args.
 */
export function buildArgs(
  command: NormalizedCommand,
  values: Record<string, ParamValue> = {},
  options: BuildArgsOptions = {},
): string[] {
  const argv: string[] = [...(options.globalArgs ?? []), ...command.argv];

  for (const param of command.flags) {
    const value = values[param.name];
    if (value === undefined || value === null) continue;
    argv.push(...emitFlag(param, value));
  }

  const positionals: string[] = [];
  for (const param of command.positionals) {
    const value = values[param.name];
    if (value === undefined || value === null) continue;
    positionals.push(...emitPositional(param, value));
  }

  if (positionals.length > 0) {
    if (command.positionalSeparator !== undefined) argv.push(command.positionalSeparator);
    argv.push(...positionals);
  }

  argv.push(...(options.extraArgs ?? []));
  return argv;
}

const SAFE_ARGUMENT = /^[\w@%+=:,./-]+$/;

/** Quote one argument for display purposes only. Execution never goes through a shell. */
export function quoteArgument(value: string): string {
  if (value === '') return "''";
  return SAFE_ARGUMENT.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Render a copy-pasteable command line, for help and documentation output. */
export function formatCommandLine(binary: string, argv: readonly string[]): string {
  return [binary, ...argv].map(quoteArgument).join(' ');
}
