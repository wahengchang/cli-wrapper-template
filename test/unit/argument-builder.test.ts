import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArgs, formatCommandLine, quoteArgument } from '../../src/core/argument-builder.ts';
import { normalizeSchema } from '../../src/core/schema.ts';
import type { NormalizedCommand } from '../../src/core/schema.ts';
import { fooSchema } from '../fixtures/foo.ts';

const registry = normalizeSchema(fooSchema);
const command = (path: string): NormalizedCommand => registry.commands.get(path) as NormalizedCommand;

test('produces the argv from the guideline example', () => {
  assert.deepEqual(
    buildArgs(command('deploy'), { projectId: 'abc', dryRun: true, timeout: 30, path: './dist' }),
    ['deploy', '--project-id', 'abc', '--dry-run', '--timeout', '30', './dist'],
  );
});

test('emits nested command words', () => {
  assert.deepEqual(buildArgs(command('project.create'), { name: 'demo' }), ['project', 'create', '--name', 'demo']);
});

test('omits parameters that were not supplied', () => {
  assert.deepEqual(buildArgs(command('project.create'), { name: 'demo' }), ['project', 'create', '--name', 'demo']);
});

test('booleans emit the flag only when true', () => {
  assert.deepEqual(buildArgs(command('project.create'), { name: 'd', dryRun: false }), ['project', 'create', '--name', 'd']);
  assert.deepEqual(buildArgs(command('project.create'), { name: 'd', dryRun: true }), [
    'project',
    'create',
    '--name',
    'd',
    '--dry-run',
  ]);
});

test('falseFlag is emitted for false booleans when declared', () => {
  const argv = buildArgs(command('deploy'), { projectId: 'a', path: '.', cache: false });
  assert.ok(argv.includes('--no-cache'));
  assert.ok(!argv.includes('--cache'));
});

test('array parameters repeat the flag by default', () => {
  const argv = buildArgs(command('deploy'), { projectId: 'a', path: '.', tag: ['x', 'y'] });
  assert.deepEqual(argv, ['deploy', '--project-id', 'a', '--tag', 'x', '--tag', 'y', '.']);
});

test('array parameters join on a delimiter when declared', () => {
  const argv = buildArgs(command('deploy'), { projectId: 'a', path: '.', exclude: ['node_modules', 'dist'] });
  assert.deepEqual(argv, ['deploy', '--project-id', 'a', '--exclude', 'node_modules,dist', '.']);
});

test('empty arrays emit nothing', () => {
  assert.deepEqual(buildArgs(command('deploy'), { projectId: 'a', path: '.', tag: [] }), [
    'deploy',
    '--project-id',
    'a',
    '.',
  ]);
});

test('assign style emits --flag=value', () => {
  const argv = buildArgs(command('deploy'), { projectId: 'a', path: '.', mode: 'fast' });
  assert.ok(argv.includes('--mode=fast'));
});

test('positionals come after flags, in declaration order', () => {
  const argv = buildArgs(command('project.delete'), { projectId: 'p1', force: true });
  assert.deepEqual(argv, ['project', 'delete', '--force', 'p1']);
});

test('numbers are stringified', () => {
  const argv = buildArgs(command('project.list'), { limit: 10 });
  assert.deepEqual(argv, ['project', 'list', '--limit', '10']);
});

test('global and extra arguments wrap the generated argv', () => {
  const argv = buildArgs(command('deploy'), { projectId: 'a', path: '.' }, {
    globalArgs: ['--profile', 'ci'],
    extraArgs: ['--unmodelled'],
  });
  assert.deepEqual(argv, ['--profile', 'ci', 'deploy', '--project-id', 'a', '.', '--unmodelled']);
});

test('the positional separator is emitted only when positionals are present', () => {
  const withPaths = buildArgs(
    { ...command('project.delete'), positionalSeparator: '--' },
    { projectId: 'p1' },
  );
  assert.deepEqual(withPaths, ['project', 'delete', '--', 'p1']);

  const withoutPaths = buildArgs({ ...command('project.delete'), positionalSeparator: '--' }, {});
  assert.deepEqual(withoutPaths, ['project', 'delete']);
});

test('command lines are quoted for display only', () => {
  assert.equal(quoteArgument('simple'), 'simple');
  assert.equal(quoteArgument('two words'), "'two words'");
  assert.equal(quoteArgument("it's"), "'it'\\''s'");
  assert.equal(quoteArgument(''), "''");
  assert.equal(
    formatCommandLine('foo', ['deploy', '--message', 'hello world']),
    "foo deploy --message 'hello world'",
  );
});
