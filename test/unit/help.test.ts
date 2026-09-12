import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchema } from '../../src/core/schema.ts';
import { CLIUnknownCommandError } from '../../src/core/errors.ts';
import { resolveHelp, resolveHelpOrParam, resolveParamHelp, searchCommands } from '../../src/help/index.ts';
import { renderJson, renderMarkdown, renderText } from '../../src/help/index.ts';
import type { CommandHelp, GroupHelp, RootHelp } from '../../src/help/index.ts';
import { fooSchema } from '../fixtures/foo.ts';

const registry = normalizeSchema(fooSchema);

test('root help lists top-level entries and every command', () => {
  const help = resolveHelp(registry) as RootHelp;
  assert.equal(help.kind, 'root');
  assert.deepEqual(help.entries.map((entry) => entry.path), ['auth', 'project', 'deploy']);
  assert.ok(help.commands.includes('project.create'));
});

test('group help lists its children with descriptions', () => {
  const help = resolveHelp(registry, 'project') as GroupHelp;
  assert.equal(help.kind, 'group');
  assert.deepEqual(help.entries.map((entry) => entry.path), ['project.create', 'project.delete', 'project.list']);
  assert.equal(help.entries[0]?.description, 'Create a new project.');
});

test('command help exposes types, flags, requirements and defaults', () => {
  const help = resolveHelp(registry, 'project.create') as CommandHelp;
  assert.equal(help.kind, 'command');
  assert.equal(help.description, 'Create a new project.');

  const name = help.params.find((param) => param.name === 'name');
  assert.deepEqual(
    { type: name?.type, flag: name?.flag, required: name?.required },
    { type: 'string', flag: '--name', required: true },
  );

  const region = help.params.find((param) => param.name === 'region');
  assert.equal(region?.default, 'us-west');
  assert.equal(region?.required, false);
  assert.equal(region?.type, "'us-west' | 'eu-central'");
});

test('help shows the JS and CLI forms side by side', () => {
  const help = resolveHelp(registry, 'deploy') as CommandHelp;
  assert.equal(
    help.jsUsage,
    'cli.deploy({ projectId: string, dryRun?: boolean, timeout?: number, tag?: string[], exclude?: string[], ' +
      "cache?: boolean, mode?: 'fast' | 'safe', path: string })",
  );
  assert.match(help.cliUsage, /^foo deploy --project-id <project-id>/);
  assert.match(help.cliUsage, /<path>$/);
});

test('examples render as JS and the equivalent CLI line', () => {
  const help = resolveHelp(registry, 'project.create') as CommandHelp;
  const [basic, dryRun] = help.examples;
  assert.equal(basic?.title, 'Basic project');
  assert.equal(basic?.js, "await cli.project.create({\n  name: 'demo',\n})");
  assert.equal(basic?.cli, 'foo project create --name demo');
  assert.equal(dryRun?.cli, 'foo project create --name demo --dry-run');
});

test('the root object name used in examples is configurable', () => {
  const help = resolveHelp(registry, 'deploy', 'foo') as CommandHelp;
  assert.match(help.jsUsage, /^foo\.deploy/);
});

test('help paths accept CLI spacing and slashes', () => {
  assert.equal((resolveHelp(registry, 'project create') as CommandHelp).path, 'project.create');
  assert.equal((resolveHelp(registry, 'project/create') as CommandHelp).path, 'project.create');
});

test('unknown commands raise an error with suggestions', () => {
  assert.throws(
    () => resolveHelp(registry, 'project.creat'),
    (error: unknown) => {
      assert.ok(error instanceof CLIUnknownCommandError);
      assert.deepEqual(error.suggestions, ['project.create']);
      assert.match(error.message, /Did you mean/);
      return true;
    },
  );
});

test('parameter help is reachable directly and by path', () => {
  const param = resolveParamHelp(registry, 'project.create', 'name');
  assert.equal(param.flag, '--name');
  assert.equal(param.usage, '--name <name>');

  const byPath = resolveHelpOrParam(registry, 'project.create.name');
  assert.equal((byPath as { name: string }).name, 'name');
});

test('unknown parameters suggest a close match', () => {
  assert.throws(
    () => resolveParamHelp(registry, 'project.create', 'nam'),
    (error: unknown) => {
      assert.ok(error instanceof CLIUnknownCommandError);
      assert.deepEqual(error.suggestions, ['name']);
      return true;
    },
  );
});

test('search finds commands by path, description and parameter', () => {
  const results = searchCommands(registry, 'project');
  // Exact group name first, then its commands, then a description-only match
  // ("Deploy a project.").
  assert.deepEqual(results.map((result) => result.path), [
    'project',
    'project.create',
    'project.delete',
    'project.list',
    'deploy',
  ]);
  assert.equal(results.at(-1)?.matched, 'description');
  assert.ok(searchCommands(registry, 'authentication').some((result) => result.path === 'auth'));
  assert.ok(searchCommands(registry, '--dry-run').some((result) => result.matched === 'param'));
  assert.deepEqual(searchCommands(registry, ''), []);
});

test('search can be limited to paths', () => {
  const results = searchCommands(registry, 'scopes', { descriptions: false, params: false });
  assert.deepEqual(results, []);
});

test('text rendering covers usage, parameters and examples', () => {
  const text = renderText(resolveHelp(registry, 'project.create'));
  assert.match(text, /Usage:/);
  assert.match(text, /CLI:/);
  assert.match(text, /Parameters:/);
  assert.match(text, /Examples:/);
  assert.match(text, /default: "us-west"/);
  assert.match(text, /required/);
});

test('markdown rendering produces a parameter table', () => {
  const markdown = renderMarkdown(resolveHelp(registry, 'project.create'));
  assert.match(markdown, /\| Parameter \| CLI \| Type \| Required \| Default \| Description \|/);
  assert.match(markdown, /\| `name` \| `--name` \| `string` \| Yes \|/);
});

test('json rendering round-trips the structured model', () => {
  const model = resolveHelp(registry, 'project.create');
  assert.deepEqual(JSON.parse(renderJson(model)), JSON.parse(JSON.stringify(model)));
});
