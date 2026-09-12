/**
 * Lightweight command discovery.
 *
 * Substring matching over paths, descriptions and parameter names. No index,
 * no dependency: the command tree of a CLI wrapper is small by nature.
 */

import type { CommandRegistry } from '../core/schema.ts';

/** One search hit. */
export interface SearchResult {
  path: string;
  kind: 'group' | 'command';
  description: string | undefined;
  /** Why the entry matched. */
  matched: 'path' | 'description' | 'param';
  /** Higher is better. */
  score: number;
}

export interface SearchOptions {
  /** Also match command descriptions. Defaults to `true`. */
  descriptions?: boolean;
  /** Also match parameter names and descriptions. Defaults to `true`. */
  params?: boolean;
  /** Maximum number of results. Defaults to `20`. */
  limit?: number;
}

/** Search commands and groups by substring. */
export function searchCommands(
  registry: CommandRegistry,
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const includeDescriptions = options.descriptions !== false;
  const includeParams = options.params !== false;
  const results: SearchResult[] = [];

  for (const [path, group] of registry.groups) {
    const lower = path.toLowerCase();
    if (lower.includes(needle)) {
      // An exact group name ranks above partial matches on its own children.
      results.push({ path, kind: 'group', description: group.description, matched: 'path', score: lower === needle ? 110 : 80 });
    } else if (includeDescriptions && group.description?.toLowerCase().includes(needle)) {
      results.push({ path, kind: 'group', description: group.description, matched: 'description', score: 40 });
    }
  }

  for (const [path, command] of registry.commands) {
    const lower = path.toLowerCase();
    if (lower === needle) {
      results.push({ path, kind: 'command', description: command.description, matched: 'path', score: 120 });
      continue;
    }
    if (lower.includes(needle)) {
      const segment = command.segments.at(-1)?.toLowerCase() ?? '';
      results.push({
        path,
        kind: 'command',
        description: command.description,
        matched: 'path',
        score: segment.startsWith(needle) ? 100 : 90,
      });
      continue;
    }
    if (includeDescriptions && command.description?.toLowerCase().includes(needle)) {
      results.push({ path, kind: 'command', description: command.description, matched: 'description', score: 50 });
      continue;
    }
    if (
      includeParams &&
      command.params.some(
        (param) =>
          param.name.toLowerCase().includes(needle) ||
          param.flag?.toLowerCase().includes(needle) === true ||
          param.description?.toLowerCase().includes(needle) === true,
      )
    ) {
      results.push({ path, kind: 'command', description: command.description, matched: 'param', score: 30 });
    }
  }

  // An invokable group appears as both a group and a command; keep the best hit.
  const best = new Map<string, SearchResult>();
  for (const result of results) {
    const existing = best.get(result.path);
    if (!existing || result.score > existing.score) best.set(result.path, result);
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, options.limit ?? 20);
}
