/**
 * Schema quality checks.
 *
 * `normalizeSchema` rejects schemas that cannot work; this module reports
 * schemas that work but are incomplete — a missing description, an example
 * that no longer matches its parameters, a dangling `related` entry.
 *
 * Examples are checked with the same `validateParams` the runtime uses, so
 * there is no second validation model.
 */

import { CLIValidationError } from './errors.ts';
import type { CommandRegistry } from './schema.ts';
import { validateParams } from './validate.ts';

/** A single finding. */
export interface LintIssue {
  severity: 'error' | 'warning';
  /** Rule name, for example `missing-description`. */
  rule: string;
  /** Command, group or parameter the finding refers to. */
  target: string;
  message: string;
}

export interface LintOptions {
  /** Treat warnings as errors. Defaults to `false`. */
  strict?: boolean;
  /** Rule names to ignore. */
  ignore?: readonly string[];
}

export interface LintReport {
  issues: LintIssue[];
  errors: LintIssue[];
  warnings: LintIssue[];
  /** True when no error-severity issue was found. */
  ok: boolean;
}

/** Check a normalized registry for documentation and consistency problems. */
export function lintSchema(registry: CommandRegistry, options: LintOptions = {}): LintReport {
  const ignore = new Set(options.ignore ?? []);
  const issues: LintIssue[] = [];

  const add = (severity: LintIssue['severity'], rule: string, target: string, message: string): void => {
    if (ignore.has(rule)) return;
    issues.push({ severity: options.strict && severity === 'warning' ? 'error' : severity, rule, target, message });
  };

  for (const [path, group] of registry.groups) {
    if (!group.description) {
      add('warning', 'missing-description', path, `Command group "${path}" has no description.`);
    }
  }

  // Two JS paths that produce indistinguishable invocations are almost always a
  // mistake. Sharing command words is fine when the arguments differ, as with
  // `git config <key>` versus `git config --list`.
  const bySignature = new Map<string, string[]>();

  for (const [path, command] of registry.commands) {
    if (!command.description) {
      add('warning', 'missing-description', path, `Command "${path}" has no description.`);
    }
    if (command.deprecated === 'Deprecated.') {
      add('warning', 'deprecated-without-reason', path, `Command "${path}" is deprecated without a reason.`);
    }

    const signature = [
      command.argv.join(' '),
      command.flags.map((param) => param.flag).sort().join(','),
      `positionals:${command.positionals.length}`,
    ].join('|');
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), path]);

    for (const param of command.params) {
      const target = `${path}.${param.name}`;
      if (!param.description) {
        add('warning', 'missing-description', target, `Parameter "${target}" has no description.`);
      }
      if (param.deprecated === 'Deprecated.') {
        add('warning', 'deprecated-without-reason', target, `Parameter "${target}" is deprecated without a reason.`);
      }
    }

    for (const related of command.related) {
      if (!registry.commands.has(related) && !registry.groups.has(related)) {
        add('error', 'unknown-related-command', path, `Command "${path}" references unknown command "${related}".`);
      }
    }

    for (const [index, example] of command.examples.entries()) {
      const target = `${path}.examples[${index}]`;
      if (!example.title) {
        add('warning', 'missing-example-title', target, `Example ${index} of "${path}" has no title.`);
      }
      try {
        validateParams(command, example.params ?? {});
      } catch (error) {
        const detail = error instanceof CLIValidationError ? error.issues.join('; ') : String(error);
        add('error', 'invalid-example', target, `Example "${example.title}" of "${path}" is invalid: ${detail}`);
      }
    }
  }

  for (const [signature, paths] of bySignature) {
    if (paths.length > 1) {
      const argv = signature.split('|')[0] ?? '';
      add(
        'warning',
        'duplicate-cli-mapping',
        paths.join(', '),
        `Commands ${paths.join(', ')} produce the same invocation "${registry.binary} ${argv}" ` +
          'with the same parameters.',
      );
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  return {
    issues,
    errors,
    warnings: issues.filter((issue) => issue.severity === 'warning'),
    ok: errors.length === 0,
  };
}

/** Render a lint report as human-readable text. */
export function formatLintReport(report: LintReport): string {
  if (report.issues.length === 0) return 'Schema check passed: no issues found.';
  const lines = report.issues.map(
    (issue) => `  ${issue.severity === 'error' ? 'error' : 'warn '}  ${issue.rule}  ${issue.target}\n         ${issue.message}`,
  );
  return [
    `Schema check found ${report.errors.length} error(s) and ${report.warnings.length} warning(s):`,
    ...lines,
  ].join('\n');
}
