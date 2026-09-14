/**
 * Markdown renderer for the help model.
 *
 * Used by `cli.formatHelp(path, 'markdown')` and by the documentation
 * generator, so help text and generated docs cannot drift apart.
 */

import type { CommandRegistry, RegistryNode } from '../../core/schema.ts';
import type { CommandHelp, GroupHelp, HelpModel, ParamHelp, RootHelp } from '../model.ts';

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function code(value: string): string {
  return `\`${value}\``;
}

function defaultCell(param: ParamHelp): string {
  if (param.default === undefined) return '-';
  const rendered = code(JSON.stringify(param.default));
  return param.applyDefault ? `${rendered} (sent)` : rendered;
}

function descriptionCell(param: ParamHelp): string {
  const parts: string[] = [];
  if (param.deprecated !== null) parts.push(`**Deprecated.** ${param.deprecated}`);
  if (param.description) parts.push(param.description);
  if (param.values && param.values.length > 0) {
    parts.push(`One of: ${param.values.map((value) => code(value)).join(', ')}.`);
  }
  if (param.aliases.length > 0) parts.push(`Aliases: ${param.aliases.map((alias) => code(alias)).join(', ')}.`);
  if (param.notes) parts.push(param.notes);
  return parts.length > 0 ? escapeCell(parts.join(' ')) : '-';
}

/** Render the parameter table for a command. */
export function renderParamTable(params: readonly ParamHelp[]): string {
  if (params.length === 0) return '_No parameters._';

  const header = '| Parameter | CLI | Type | Required | Default | Description |';
  const divider = '|---|---|---|---|---|---|';
  const rows = params.map((param) =>
    [
      code(param.name),
      param.flag === null ? '_positional_' : code(param.flag),
      // Enum unions contain `|`, which would otherwise split the table row.
      escapeCell(code(param.type)),
      param.required ? 'Yes' : 'No',
      defaultCell(param),
      descriptionCell(param),
    ].join(' | '),
  );

  return [header, divider, ...rows.map((row) => `| ${row} |`)].join('\n');
}

/** Render one command as a Markdown section. */
export function renderCommandMarkdown(help: CommandHelp, level = 2): string {
  const heading = '#'.repeat(level);
  const sections: string[] = [`${heading} ${help.path}`];

  if (help.deprecated !== null) sections.push(`> **Deprecated.** ${help.deprecated}`);
  if (help.description) sections.push(help.description);

  sections.push(`${heading}# JavaScript\n\n\`\`\`ts\n${help.jsUsage}\n\`\`\``);
  sections.push(`${heading}# CLI\n\n\`\`\`bash\n${help.cliUsage}\n\`\`\``);
  sections.push(`${heading}# Parameters\n\n${renderParamTable(help.params)}`);

  if (help.output) {
    const details = [`Parsed as ${code(help.output.parse)}.`];
    if (help.output.type) details.push(`\`result.data\` is ${code(help.output.type)}.`);
    if (help.output.description) details.push(help.output.description);
    sections.push(`${heading}# Output\n\n${details.join(' ')}`);
  }

  if (help.examples.length > 0) {
    const examples = help.examples
      .map((example) => {
        const parts = [`**${example.title}**`];
        if (example.description) parts.push(example.description);
        parts.push(`\`\`\`ts\n${example.js}\n\`\`\``);
        parts.push(`\`\`\`bash\n${example.cli}\n\`\`\``);
        return parts.join('\n\n');
      })
      .join('\n\n');
    sections.push(`${heading}# Examples\n\n${examples}`);
  }

  if (help.subcommands.length > 0) {
    const items = help.subcommands
      .map((entry) => `- ${code(entry.path)}${entry.description ? ` — ${entry.description}` : ''}`)
      .join('\n');
    sections.push(`${heading}# Subcommands\n\n${items}`);
  }

  if (help.notes) sections.push(`${heading}# Notes\n\n${help.notes}`);
  if (help.related.length > 0) {
    sections.push(`${heading}# Related\n\n${help.related.map((path) => `- ${code(path)}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/** Render a group listing as Markdown. */
export function renderGroupMarkdown(help: GroupHelp, level = 2): string {
  const heading = '#'.repeat(level);
  const sections = [`${heading} ${help.path}`];
  if (help.description) sections.push(help.description);
  sections.push(
    help.entries.length > 0
      ? help.entries.map((entry) => `- ${code(entry.path)}${entry.description ? ` — ${entry.description}` : ''}`).join('\n')
      : '_No commands._',
  );
  return sections.join('\n\n');
}

/** Render the root listing as Markdown. */
export function renderRootMarkdown(help: RootHelp, level = 1): string {
  const heading = '#'.repeat(level);
  const sections = [`${heading} ${help.binary}`];
  if (help.description) sections.push(help.description);
  sections.push(
    help.entries.map((entry) => `- ${code(entry.path)}${entry.description ? ` — ${entry.description}` : ''}`).join('\n'),
  );
  return sections.join('\n\n');
}

/** Render any help model as Markdown. */
export function renderMarkdown(model: HelpModel, level = 2): string {
  switch (model.kind) {
    case 'command':
      return renderCommandMarkdown(model, level);
    case 'group':
      return renderGroupMarkdown(model, level);
    case 'root':
      return renderRootMarkdown(model, level);
  }
}

/** Render the command tree as an ASCII tree, mirroring the public JS API. */
export function renderCommandTree(registry: CommandRegistry): string {
  const lines: string[] = [registry.binary];

  const walk = (nodes: readonly RegistryNode[], prefix: string): void => {
    nodes.forEach((node, index) => {
      const last = index === nodes.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${node.key}`);
      if (node.children.length > 0) walk(node.children, `${prefix}${last ? '    ' : '│   '}`);
    });
  };

  walk(registry.tree.children, '');
  return lines.join('\n');
}
