/**
 * Terminal renderer for the help model.
 */

import type { CommandHelp, GroupHelp, HelpEntry, HelpModel, ParamHelp, RootHelp } from '../model.ts';

function padColumns(rows: readonly (readonly [string, string])[], indent = '  '): string[] {
  const width = rows.reduce((max, [left]) => Math.max(max, left.length), 0);
  return rows.map(([left, right]) =>
    right === '' ? `${indent}${left}` : `${indent}${left.padEnd(width)}  ${right}`,
  );
}

function entryRows(entries: readonly HelpEntry[]): readonly (readonly [string, string])[] {
  return entries.map((entry) => [entry.path, entry.description ?? ''] as const);
}

/** Render a parameter block. */
export function renderParamText(param: ParamHelp): string {
  const lines: string[] = [param.name];
  const facts = [param.type, param.required ? 'required' : 'optional'];
  if (param.positional) facts.push('positional');
  lines.push(`  ${facts.join('  ')}`);

  if (param.default !== undefined) {
    lines.push(`  default: ${JSON.stringify(param.default)}${param.applyDefault ? '' : ' (applied by the CLI)'}`);
  }
  if (param.values && param.values.length > 0) lines.push(`  values: ${param.values.join(', ')}`);
  if (param.flag !== null) lines.push(`  CLI: ${param.flag}`);
  else lines.push('  CLI: positional');
  if (param.aliases.length > 0) lines.push(`  aliases: ${param.aliases.join(', ')}`);
  if (param.deprecated !== null) lines.push(`  DEPRECATED: ${param.deprecated}`);
  if (param.description) lines.push(`  ${param.description}`);
  if (param.notes) lines.push(`  ${param.notes}`);

  return lines.join('\n');
}

function renderCommand(help: CommandHelp): string {
  const sections: string[] = [help.path];

  if (help.description) sections.push(help.description);
  if (help.deprecated !== null) sections.push(`DEPRECATED: ${help.deprecated}`);
  sections.push(`Usage:\n\n  ${help.jsUsage}`);
  sections.push(`CLI:\n\n  ${help.cliUsage}`);

  if (help.params.length > 0) {
    sections.push(`Parameters:\n\n${help.params.map((param) => renderParamText(param)).join('\n\n')}`);
  } else {
    sections.push('Parameters:\n\n  (none)');
  }

  if (help.output) {
    const details = [`parsed as ${help.output.parse}`];
    if (help.output.type) details.push(`type: ${help.output.type}`);
    sections.push(`Output:\n\n  ${details.join('  ')}${help.output.description ? `\n  ${help.output.description}` : ''}`);
  }

  if (help.examples.length > 0) {
    const examples = help.examples
      .map((example) => {
        const body = [`${example.title}`];
        if (example.description) body.push(`  ${example.description}`);
        body.push(example.js.split('\n').map((line) => `  ${line}`).join('\n'));
        body.push(`  # ${example.cli}`);
        return body.join('\n');
      })
      .join('\n\n');
    sections.push(`Examples:\n\n${examples}`);
  }

  if (help.subcommands.length > 0) {
    sections.push(`Subcommands:\n\n${padColumns(entryRows(help.subcommands)).join('\n')}`);
  }

  if (help.notes) sections.push(`Notes:\n\n  ${help.notes}`);
  if (help.related.length > 0) sections.push(`Related:\n\n${help.related.map((path) => `  ${path}`).join('\n')}`);

  return sections.join('\n\n');
}

function renderGroup(help: GroupHelp): string {
  const sections = [help.path];
  if (help.description) sections.push(help.description);
  sections.push(
    help.entries.length > 0
      ? `Commands:\n\n${padColumns(entryRows(help.entries)).join('\n')}`
      : 'Commands:\n\n  (none)',
  );
  return sections.join('\n\n');
}

function renderRoot(help: RootHelp): string {
  const sections = [help.binary];
  if (help.description) sections.push(help.description);
  sections.push(`Commands:\n\n${padColumns(entryRows(help.entries)).join('\n')}`);
  sections.push("Run cli.help('<command>') for details.");
  return sections.join('\n\n');
}

/** Render any help model as plain text. */
export function renderText(model: HelpModel): string {
  switch (model.kind) {
    case 'command':
      return renderCommand(model);
    case 'group':
      return renderGroup(model);
    case 'root':
      return renderRoot(model);
  }
}
