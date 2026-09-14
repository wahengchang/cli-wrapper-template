/**
 * The normalized help model.
 *
 * Help and documentation share this model, so JS/CLI mapping, usage strings
 * and examples are derived once from the schema rather than written twice.
 * Rendering lives in `renderers/`; this module produces data only.
 */

import { buildArgs, formatCommandLine } from '../core/argument-builder.ts';
import type { CommandRegistry, NormalizedCommand, NormalizedGroup, NormalizedParam } from '../core/schema.ts';
import type { ParamValue } from '../core/types.ts';

/** Structured help for a single parameter. */
export interface ParamHelp {
  name: string;
  type: string;
  /** CLI flag, or `null` for positionals. */
  flag: string | null;
  positional: boolean;
  required: boolean;
  default: ParamValue | undefined;
  /** Whether the wrapper sends the default when the parameter is omitted. */
  applyDefault: boolean;
  description: string | undefined;
  values: readonly string[] | undefined;
  aliases: readonly string[];
  deprecated: string | null;
  notes: string | undefined;
  /** CLI fragment, for example `--name <name>` or `[<path>]`. */
  usage: string;
}

/** An example rendered in both representations. */
export interface ExampleHelp {
  title: string;
  description: string | undefined;
  /** JavaScript call. */
  js: string;
  /** Equivalent CLI invocation. */
  cli: string;
}

/** Structured help for one command. */
export interface CommandHelp {
  kind: 'command';
  path: string;
  binary: string;
  description: string | undefined;
  deprecated: string | null;
  notes: string | undefined;
  /** CLI usage line, for example `git log [--max-count <max-count>] [<revision>]`. */
  cliUsage: string;
  /** JS usage line, for example `cli.log({ maxCount?: number })`. */
  jsUsage: string;
  params: ParamHelp[];
  examples: ExampleHelp[];
  output: { parse: 'json' | 'lines' | 'custom'; type: string | undefined; description: string | undefined } | undefined;
  related: readonly string[];
  /** Children, when the command is also a group (for example `git remote`). */
  subcommands: HelpEntry[];
}

/** An entry in a group or root listing. */
export interface HelpEntry {
  path: string;
  kind: 'group' | 'command';
  description: string | undefined;
}

/** Structured help for a group of commands. */
export interface GroupHelp {
  kind: 'group';
  path: string;
  binary: string;
  description: string | undefined;
  entries: HelpEntry[];
}

/** Structured help for the whole CLI. */
export interface RootHelp {
  kind: 'root';
  path: '';
  binary: string;
  description: string | undefined;
  entries: HelpEntry[];
  /** Every invokable command path. */
  commands: string[];
}

export type HelpModel = RootHelp | GroupHelp | CommandHelp;

function jsType(param: NormalizedParam): string {
  if (param.values && param.values.length > 0) {
    const union = param.values.map((value) => `'${value}'`).join(' | ');
    return param.type === 'string[]' ? `(${union})[]` : union;
  }
  return param.type;
}

function placeholder(param: NormalizedParam): string {
  if (param.values && param.values.length > 0) return `<${param.values.join('|')}>`;
  return `<${param.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}>`;
}

function paramUsage(param: NormalizedParam): string {
  let core: string;
  if (param.positional) {
    core = param.array ? `${placeholder(param)}...` : placeholder(param);
  } else if (param.type === 'boolean') {
    core = param.flag as string;
  } else {
    const value = param.assign ? `=${placeholder(param)}` : ` ${placeholder(param)}`;
    core = `${param.flag as string}${value}`;
    if (param.array) core += '...';
  }
  return param.required ? core : `[${core}]`;
}

/** Format a JS value the way it would be written in source. */
export function formatJsValue(value: unknown): string {
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(formatJsValue).join(', ')}]`;
  return String(value);
}

/** Render a JS call such as `cli.project.create({ name: 'demo' })`. */
export function formatJsCall(path: string, params: Record<string, unknown> | undefined, root = 'cli'): string {
  const entries = Object.entries(params ?? {});
  if (entries.length === 0) return `await ${root}.${path}()`;
  const body = entries.map(([key, value]) => `  ${key}: ${formatJsValue(value)},`).join('\n');
  return `await ${root}.${path}({\n${body}\n})`;
}

function toParamHelp(param: NormalizedParam): ParamHelp {
  return {
    name: param.name,
    type: jsType(param),
    flag: param.flag,
    positional: param.positional,
    required: param.required,
    default: param.default,
    applyDefault: param.applyDefault,
    description: param.description,
    values: param.values,
    aliases: param.aliases,
    deprecated: param.deprecated,
    notes: param.notes,
    usage: paramUsage(param),
  };
}

function outputHelp(command: NormalizedCommand): CommandHelp['output'] {
  const output = command.output;
  if (!output?.parse) return undefined;
  const parse = typeof output.parse === 'function' ? 'custom' : output.parse;
  return { parse, type: output.type, description: output.description };
}

/** Build the structured help model for one command. */
export function buildCommandHelp(registry: CommandRegistry, command: NormalizedCommand, root = 'cli'): CommandHelp {
  const params = command.params.map(toParamHelp);
  const cliWords = [registry.binary, ...registry.globalArgs, ...command.argv].join(' ');
  const usageParts = [...command.flags, ...command.positionals].map((param) => paramUsage(param));

  const signature = command.params
    .map((param) => `${param.name}${param.required ? '' : '?'}: ${jsType(param)}`)
    .join(', ');

  return {
    kind: 'command',
    path: command.path,
    binary: registry.binary,
    description: command.description,
    deprecated: command.deprecated,
    notes: command.notes,
    cliUsage: [cliWords, ...usageParts].join(' '),
    jsUsage: `${root}.${command.path}(${signature === '' ? '' : `{ ${signature} }`})`,
    params,
    examples: command.examples.map((example) => ({
      title: example.title,
      description: example.description,
      js: formatJsCall(command.path, example.params, root),
      cli: formatCommandLine(
        registry.binary,
        buildArgs(command, example.params ?? {}, { globalArgs: registry.globalArgs }),
      ),
    })),
    output: outputHelp(command),
    related: command.related,
    subcommands: entriesOf(registry, registry.groups.get(command.path)?.children ?? []),
  };
}

function entriesOf(registry: CommandRegistry, childPaths: readonly string[]): HelpEntry[] {
  return childPaths.map((path) => {
    const group = registry.groups.get(path);
    if (group) return { path, kind: 'group' as const, description: group.description };
    const command = registry.commands.get(path);
    return { path, kind: 'command' as const, description: command?.description };
  });
}

/** Build the structured help model for a group. */
export function buildGroupHelp(registry: CommandRegistry, group: NormalizedGroup): GroupHelp {
  return {
    kind: 'group',
    path: group.path,
    binary: registry.binary,
    description: group.description,
    entries: entriesOf(registry, group.children),
  };
}

/** Build the structured help model for the CLI as a whole. */
export function buildRootHelp(registry: CommandRegistry): RootHelp {
  return {
    kind: 'root',
    path: '',
    binary: registry.binary,
    description: registry.description,
    entries: entriesOf(
      registry,
      registry.tree.children.map((child) => child.path),
    ),
    commands: registry.paths,
  };
}
