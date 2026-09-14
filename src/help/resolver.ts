/**
 * Help resolution: turn a path like `project.create` into a help model.
 *
 * Accepts dotted JS paths and CLI-style paths (`project create`) so that a
 * command copied from a terminal resolves too.
 */

import { CLIUnknownCommandError } from '../core/errors.ts';
import type { CommandRegistry } from '../core/schema.ts';
import { closest } from '../core/validate.ts';
import { buildCommandHelp, buildGroupHelp, buildRootHelp } from './model.ts';
import type { CommandHelp, HelpModel, ParamHelp } from './model.ts';

/** Normalize `project create` and `project/create` to `project.create`. */
export function normalizePath(path: string): string {
  return path.trim().replace(/[\s/]+/g, '.').replace(/^\.+|\.+$/g, '');
}

function suggestionsFor(registry: CommandRegistry, path: string): string[] {
  const candidates = [...registry.paths, ...registry.groups.keys()];
  const best = closest(path, candidates);
  if (best !== null) return [best];
  const prefix = path.split('.')[0] ?? '';
  return candidates.filter((candidate) => candidate.startsWith(prefix)).slice(0, 5);
}

/** Resolve a help path to a root, group or command help model. */
export function resolveHelp(registry: CommandRegistry, path?: string, root = 'cli'): HelpModel {
  const normalized = path === undefined ? '' : normalizePath(path);
  if (normalized === '') return buildRootHelp(registry);

  const command = registry.commands.get(normalized);
  if (command) return buildCommandHelp(registry, command, root);

  const group = registry.groups.get(normalized);
  if (group) return buildGroupHelp(registry, group);

  const suggestions = suggestionsFor(registry, normalized);
  throw new CLIUnknownCommandError(
    `Unknown command: ${normalized}` +
      (suggestions.length > 0 ? `\n\nDid you mean:\n\n${suggestions.map((s) => `  ${s}`).join('\n')}` : ''),
    suggestions,
  );
}

/** Resolve help for a single parameter of a command. */
export function resolveParamHelp(registry: CommandRegistry, commandPath: string, paramName: string): ParamHelp {
  const help = resolveHelp(registry, commandPath) as CommandHelp;
  if (help.kind !== 'command') {
    throw new CLIUnknownCommandError(`"${normalizePath(commandPath)}" is a command group and has no parameters.`);
  }

  const param = help.params.find((candidate) => candidate.name === paramName);
  if (param) return param;

  const suggestion = closest(
    paramName,
    help.params.map((candidate) => candidate.name),
  );
  throw new CLIUnknownCommandError(
    `Unknown parameter "${paramName}" on ${help.path}` + (suggestion ? `. Did you mean "${suggestion}"?` : '.'),
    suggestion ? [suggestion] : [],
  );
}

/**
 * Split a trailing parameter name off a help path.
 *
 * `project.create.name` resolves to the `name` parameter when `project.create`
 * is a command; otherwise the whole path is treated as a command path.
 */
export function resolveHelpOrParam(
  registry: CommandRegistry,
  path: string,
  root = 'cli',
): HelpModel | ParamHelp {
  const normalized = normalizePath(path);
  if (registry.commands.has(normalized) || registry.groups.has(normalized)) {
    return resolveHelp(registry, normalized, root);
  }

  const lastDot = normalized.lastIndexOf('.');
  if (lastDot > 0) {
    const commandPath = normalized.slice(0, lastDot);
    const paramName = normalized.slice(lastDot + 1);
    if (registry.commands.has(commandPath)) return resolveParamHelp(registry, commandPath, paramName);
  }

  return resolveHelp(registry, normalized, root);
}
