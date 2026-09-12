/**
 * CLI-specific tests: a JS call must produce exactly the expected argv.
 *
 * This is the only kind of test a new wrapper normally needs — the
 * infrastructure is covered by the core tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCLI } from '../../src/index.ts';
import { gitSchema } from '../../examples/git/schema.ts';
import { fakeExecutor } from '../helpers.ts';

const git = createCLI({ schema: gitSchema, rootName: 'git', executor: fakeExecutor().executor });

test('flags, values and positionals map to the documented argv', () => {
  assert.deepEqual(git.log.toArgv({ maxCount: 3, format: '%s' }), [
    '--no-pager',
    'log',
    '--max-count',
    '3',
    '--format=%s',
  ]);

  assert.deepEqual(git.status.toArgv({ porcelain: true, paths: ['src', 'test'] }), [
    '--no-pager',
    'status',
    '--porcelain',
    '--',
    'src',
    'test',
  ]);

  assert.deepEqual(git.commit.toArgv({ message: 'a message', verify: false }), [
    '--no-pager',
    'commit',
    '--message',
    'a message',
    '--no-verify',
  ]);

  assert.deepEqual(git.remote.add.toArgv({ name: 'origin', url: 'https://example.com/r.git' }), [
    '--no-pager',
    'remote',
    'add',
    'origin',
    'https://example.com/r.git',
  ]);
});

test('camelCase command keys map to kebab-case CLI words', () => {
  assert.deepEqual(git.revParse.toArgv({ abbrevRef: true, refs: ['HEAD'] }), [
    '--no-pager',
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
});

test('a JS group can be deeper than the CLI', () => {
  // `git config <key> <value>` has no `set` subcommand word.
  assert.deepEqual(git.config.set.toArgv({ key: 'user.name', value: 'Dev' }), [
    '--no-pager',
    'config',
    'user.name',
    'Dev',
  ]);
  assert.deepEqual(git.config.list.toArgv(), ['--no-pager', 'config', '--list']);
});

test('enum parameters use the assign form', () => {
  assert.deepEqual(git.status.toArgv({ untrackedFiles: 'all' }), [
    '--no-pager',
    'status',
    '--untracked-files=all',
  ]);
});

test('the command line matches the argv', () => {
  assert.equal(
    git.commit.toCommandLine({ message: 'hello world' }),
    "git --no-pager commit --message 'hello world'",
  );
});

test('the schema exposes every wrapped command', () => {
  assert.deepEqual(git.$.commands(), [
    'add',
    'commit',
    'config.get',
    'config.list',
    'config.set',
    'init',
    'log',
    'remote',
    'remote.add',
    'remote.getUrl',
    'remote.remove',
    'revParse',
    'status',
    'version',
  ]);
});
