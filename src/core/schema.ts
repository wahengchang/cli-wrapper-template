/**
 * Schema normalization.
 *
 * The authored schema is convenient to write; the normalized registry is
 * convenient to consume. Runtime, validation, help and documentation all read
 * this one registry, so there is exactly one normalization step in the system.
 */

import { CLISchemaError } from './errors.ts';
import { camelToKebab, defaultCommandWord, defaultFlag } from './naming.ts';
import type { CLISchema, CommandSpec, ExampleSpec, OutputSpec, ParamKind, ParamSpec, ParamValue } from './types.ts';

const PARAM_KINDS = new Set<string>(['string', 'number', 'boolean', 'string[]', 'number[]']);

/** A parameter with every default resolved. */
export interface NormalizedParam {
  /** JS property name. */
  name: string;
  type: ParamKind;
  /** `null` for positional arguments. */
  flag: string | null;
  positional: boolean;
  /** Order among positionals, or `null` for flags. */
  positionalIndex: number | null;
  required: boolean;
  default: ParamValue | undefined;
  applyDefault: boolean;
  description: string | undefined;
  values: readonly string[] | undefined;
  assign: boolean;
  delimiter: string | undefined;
  falseFlag: string | undefined;
  aliases: readonly string[];
  /** Deprecation reason, or `null` when not deprecated. */
  deprecated: string | null;
  notes: string | undefined;
  /** True for `string[]` / `number[]`. */
  array: boolean;
  /** Permit positional values that start with `-`. */
  allowDashValue: boolean;
}

/** A command with every default resolved. */
export interface NormalizedCommand {
  /** JS path, for example `project.create`. */
  path: string;
  /** JS path segments. */
  segments: string[];
  /** CLI words for this command, for example `['project', 'create']`. */
  argv: string[];
  description: string | undefined;
  /** All parameters in declaration order. */
  params: NormalizedParam[];
  /** Flag parameters only. */
  flags: NormalizedParam[];
  /** Positional parameters, in emission order. */
  positionals: NormalizedParam[];
  examples: readonly ExampleSpec[];
  output: OutputSpec | undefined;
  deprecated: string | null;
  notes: string | undefined;
  related: readonly string[];
  /** Word emitted before the first positional argument, for example `--`. */
  positionalSeparator: string | undefined;
  /** Path of the enclosing group, or `null` at the root. */
  parent: string | null;
}

/** A namespace in the command tree. */
export interface NormalizedGroup {
  path: string;
  segments: string[];
  argv: string[];
  description: string | undefined;
  /** Paths of direct children, groups and commands alike. */
  children: string[];
  parent: string | null;
  /** True when the group itself can be invoked. */
  invokable: boolean;
}

/** Tree node used for rendering command trees. */
export interface RegistryNode {
  kind: 'group' | 'command';
  path: string;
  /** Last JS path segment. */
  key: string;
  description: string | undefined;
  children: RegistryNode[];
}

/** Everything downstream layers need, derived once from the authored schema. */
export interface CommandRegistry {
  binary: string;
  description: string | undefined;
  globalArgs: string[];
  /** Invokable commands, keyed by JS path. */
  commands: Map<string, NormalizedCommand>;
  /** Groups, keyed by JS path. */
  groups: Map<string, NormalizedGroup>;
  /** Sorted command paths. */
  paths: string[];
  /** Root of the command tree. */
  tree: RegistryNode;
}

function deprecationOf(value: boolean | string | undefined): string | null {
  if (value === undefined || value === false) return null;
  return value === true ? 'Deprecated.' : value;
}

function commandWords(key: string, spec: CommandSpec): string[] {
  if (spec.command === undefined) return [defaultCommandWord(key)];
  if (typeof spec.command === 'string') return spec.command === '' ? [] : [spec.command];
  return [...spec.command];
}

function normalizeParams(commandPath: string, params: Record<string, ParamSpec> | undefined, issues: string[]): NormalizedParam[] {
  if (!params) return [];
  const result: NormalizedParam[] = [];
  const seenFlags = new Map<string, string>();
  let positionalCount = 0;

  for (const [name, spec] of Object.entries(params)) {
    const where = `${commandPath}.${name}`;

    if (!PARAM_KINDS.has(spec.type)) {
      issues.push(`${where}: unknown parameter type "${String(spec.type)}"`);
      continue;
    }

    const array = spec.type === 'string[]' || spec.type === 'number[]';
    const positional = spec.positional === true;

    if (positional && spec.flag !== undefined) {
      issues.push(`${where}: a positional parameter cannot also declare a flag`);
    }
    if (positional && spec.type === 'boolean') {
      issues.push(`${where}: boolean parameters cannot be positional`);
    }
    if (spec.values && spec.type !== 'string' && spec.type !== 'string[]') {
      issues.push(`${where}: "values" is only supported for string parameters`);
    }
    if (spec.applyDefault && spec.default === undefined) {
      issues.push(`${where}: "applyDefault" requires a "default" value`);
    }
    if (spec.applyDefault && spec.required) {
      issues.push(`${where}: a required parameter cannot have an applied default`);
    }
    if (spec.falseFlag !== undefined && spec.type !== 'boolean') {
      issues.push(`${where}: "falseFlag" is only supported for boolean parameters`);
    }
    if (spec.delimiter !== undefined && !array) {
      issues.push(`${where}: "delimiter" is only supported for array parameters`);
    }

    const flag = positional ? null : (spec.flag ?? defaultFlag(name));
    if (flag !== null) {
      if (!flag.startsWith('-')) {
        issues.push(`${where}: flag "${flag}" must start with "-"`);
      }
      const previous = seenFlags.get(flag);
      if (previous !== undefined) {
        issues.push(`${where}: flag "${flag}" is already used by "${previous}"`);
      } else {
        seenFlags.set(flag, name);
      }
    }

    result.push({
      name,
      type: spec.type,
      flag,
      positional,
      positionalIndex: positional ? positionalCount++ : null,
      required: spec.required === true,
      default: spec.default,
      applyDefault: spec.applyDefault === true,
      description: spec.description,
      values: spec.values,
      assign: spec.assign === true,
      delimiter: spec.delimiter,
      falseFlag: spec.falseFlag,
      aliases: spec.aliases ?? [],
      deprecated: deprecationOf(spec.deprecated),
      notes: spec.notes,
      array,
      allowDashValue: spec.allowDashValue === true,
    });
  }

  // A required positional after an optional one would silently shift argv.
  let seenOptionalPositional: string | null = null;
  for (const param of result) {
    if (!param.positional) continue;
    if (param.required && seenOptionalPositional !== null) {
      issues.push(
        `${commandPath}.${param.name}: required positional cannot follow optional positional "${seenOptionalPositional}"`,
      );
    }
    if (!param.required) seenOptionalPositional = param.name;
  }

  // Only the last positional may be variadic; otherwise argv boundaries are ambiguous.
  const positionals = result.filter((param) => param.positional);
  for (const param of positionals.slice(0, -1)) {
    if (param.array) {
      issues.push(`${commandPath}.${param.name}: only the last positional parameter may be an array`);
    }
  }

  return result;
}

function isGroup(spec: CommandSpec): boolean {
  return spec.commands !== undefined && Object.keys(spec.commands).length > 0;
}

/**
 * Turn an authored schema into the registry every other layer consumes.
 *
 * @throws {CLISchemaError} when the schema is structurally invalid.
 */
export function normalizeSchema(schema: CLISchema): CommandRegistry {
  const issues: string[] = [];
  const commands = new Map<string, NormalizedCommand>();
  const groups = new Map<string, NormalizedGroup>();

  if (typeof schema.binary !== 'string' || schema.binary.trim() === '') {
    issues.push('schema.binary must be a non-empty string');
  }
  if (!schema.commands || Object.keys(schema.commands).length === 0) {
    issues.push('schema.commands must define at least one command');
  }

  const walk = (
    key: string,
    spec: CommandSpec,
    parentSegments: string[],
    parentArgv: string[],
    parentPath: string | null,
  ): RegistryNode => {
    const segments = [...parentSegments, key];
    const path = segments.join('.');
    const argv = [...parentArgv, ...commandWords(key, spec)];

    if (!/^[A-Za-z_$][\w$]*$/.test(key)) {
      issues.push(`${path}: "${key}" is not a valid JavaScript identifier`);
    }

    if (isGroup(spec)) {
      const children: RegistryNode[] = [];
      const group: NormalizedGroup = {
        path,
        segments,
        argv,
        description: spec.description,
        children: [],
        parent: parentPath,
        invokable: spec.invokable === true,
      };
      groups.set(path, group);

      for (const [childKey, childSpec] of Object.entries(spec.commands ?? {})) {
        children.push(walk(childKey, childSpec, segments, argv, path));
      }
      group.children = children.map((child) => child.path);

      if (spec.invokable === true) {
        commands.set(path, buildCommand(path, segments, argv, spec, parentPath, issues));
      }

      return { kind: 'group', path, key, description: spec.description, children };
    }

    commands.set(path, buildCommand(path, segments, argv, spec, parentPath, issues));
    return { kind: 'command', path, key, description: spec.description, children: [] };
  };

  const rootChildren: RegistryNode[] = [];
  for (const [key, spec] of Object.entries(schema.commands ?? {})) {
    rootChildren.push(walk(key, spec, [], [], null));
  }

  if (issues.length > 0) {
    throw new CLISchemaError(
      `Invalid CLI schema for "${schema.binary}":\n  - ${issues.join('\n  - ')}`,
      issues,
    );
  }

  return {
    binary: schema.binary,
    description: schema.description,
    globalArgs: [...(schema.globalArgs ?? [])],
    commands,
    groups,
    paths: [...commands.keys()].sort(),
    tree: {
      kind: 'group',
      path: '',
      key: camelToKebab(schema.binary),
      description: schema.description,
      children: rootChildren,
    },
  };
}

function buildCommand(
  path: string,
  segments: string[],
  argv: string[],
  spec: CommandSpec,
  parent: string | null,
  issues: string[],
): NormalizedCommand {
  const params = normalizeParams(path, spec.params, issues);
  return {
    path,
    segments,
    argv,
    description: spec.description,
    params,
    flags: params.filter((param) => !param.positional),
    positionals: params.filter((param) => param.positional),
    examples: spec.examples ?? [],
    output: spec.output,
    deprecated: deprecationOf(spec.deprecated),
    notes: spec.notes,
    related: spec.related ?? [],
    positionalSeparator: spec.positionalSeparator,
    parent,
  };
}
