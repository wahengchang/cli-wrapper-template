/**
 * Runtime parameter validation.
 *
 * Validation is derived from the same normalized schema the argument builder
 * uses, so a call that validates is a call that can be turned into argv.
 */

import { CLIValidationError } from './errors.ts';
import type { NormalizedCommand, NormalizedParam } from './schema.ts';
import type { ParamValue } from './types.ts';

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkValue(param: NormalizedParam, value: unknown, issues: string[]): void {
  const label = `"${param.name}"`;

  switch (param.type) {
    case 'string': {
      if (typeof value !== 'string') {
        issues.push(`${label} must be a string, received ${typeName(value)}`);
        return;
      }
      break;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(`${label} must be a finite number, received ${typeName(value)}`);
        return;
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        issues.push(`${label} must be a boolean, received ${typeName(value)}`);
      }
      return;
    }
    case 'string[]':
    case 'number[]': {
      if (!Array.isArray(value)) {
        issues.push(`${label} must be an array, received ${typeName(value)}`);
        return;
      }
      const element = param.type === 'string[]' ? 'string' : 'number';
      for (const [index, item] of value.entries()) {
        if (element === 'string' && typeof item !== 'string') {
          issues.push(`${label}[${index}] must be a string, received ${typeName(item)}`);
        }
        if (element === 'number' && (typeof item !== 'number' || !Number.isFinite(item))) {
          issues.push(`${label}[${index}] must be a finite number, received ${typeName(item)}`);
        }
      }
      break;
    }
  }

  if (param.values) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && !param.values.includes(candidate)) {
        issues.push(`${label} must be one of: ${param.values.join(', ')} (received "${candidate}")`);
      }
    }
  }

  if (param.positional && !param.allowDashValue) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.startsWith('-')) {
        issues.push(
          `${label} must not start with "-" (received "${candidate}"); ` +
            'a positional value that looks like a flag is rejected to prevent argument injection. ' +
            'Set allowDashValue: true on the parameter if the CLI expects such values.',
        );
      }
    }
  }
}

/**
 * Validate caller input against a command schema and resolve applied defaults.
 *
 * @returns the values to hand to the argument builder.
 * @throws {CLIValidationError} listing every problem found.
 */
export function validateParams(
  command: NormalizedCommand,
  input: Record<string, unknown> = {},
): Record<string, ParamValue> {
  const issues: string[] = [];
  const known = new Map(command.params.map((param) => [param.name, param]));
  const resolved: Record<string, ParamValue> = {};

  for (const key of Object.keys(input)) {
    if (!known.has(key)) {
      const suggestion = closest(key, [...known.keys()]);
      issues.push(
        `unknown parameter "${key}"${suggestion ? `, did you mean "${suggestion}"?` : ''}`,
      );
    }
  }

  for (const param of command.params) {
    const value = input[param.name];

    if (value === undefined || value === null) {
      if (param.required) {
        issues.push(`missing required parameter "${param.name}"`);
      } else if (param.applyDefault && param.default !== undefined) {
        resolved[param.name] = param.default;
      }
      continue;
    }

    checkValue(param, value, issues);
    resolved[param.name] = value as ParamValue;
  }

  if (issues.length > 0) {
    throw new CLIValidationError(
      `Invalid parameters for ${command.path}:\n  - ${issues.join('\n  - ')}\n\n` +
        `See: cli.help('${command.path}')`,
      issues,
      { command: command.path },
    );
  }

  return resolved;
}

/** Levenshtein distance, used for "did you mean" hints. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);

  for (let row = 1; row < rows; row += 1) {
    const current = [row, ...Array.from<number>({ length: cols - 1 }).fill(0)];
    for (let col = 1; col < cols; col += 1) {
      const substitution = (previous[col - 1] ?? 0) + (a[row - 1] === b[col - 1] ? 0 : 1);
      const insertion = (current[col - 1] ?? 0) + 1;
      const deletion = (previous[col] ?? 0) + 1;
      current[col] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[cols - 1] ?? 0;
}

/** Closest candidate within a small edit distance, or `null`. */
export function closest(value: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = editDistance(value.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const threshold = Math.max(2, Math.floor(value.length / 3));
  return best !== null && bestScore <= threshold ? best : null;
}
