/**
 * Integration tests: the wrapper driving the real `git` binary.
 *
 * These are separated from the unit tests because they need the CLI installed.
 * Run them with `npm run test:integration`.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit } from '../../examples/git/index.ts';
import { CLIExitError } from '../../src/index.ts';

let dir: string;
let git: ReturnType<typeof createGit>;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cli-wrapper-git-'));
  git = createGit({
    cwd: dir,
    // Keep the test independent of the developer's own git configuration.
    env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    timeout: 30_000,
  });

  await git.init({ initialBranch: 'main', quiet: true, directory: dir });
  await git.config.set({ key: 'user.email', value: 'dev@example.com' });
  await git.config.set({ key: 'user.name', value: 'Dev' });
  await writeFile(join(dir, 'README.md'), '# integration\n', 'utf8');
  await git.add({ paths: ['README.md'] });
  await git.commit({ message: 'first commit' });
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('runs the real binary and returns raw output', async () => {
  const result = await git.version();
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^git version /);
  assert.equal(result.data, result.stdout.trim());
  assert.deepEqual(result.argv, ['--no-pager', 'version']);
});

test('custom parsers produce typed data', async () => {
  const branch = await git.revParse({ abbrevRef: true, refs: ['HEAD'] });
  assert.equal(branch.data, 'main');

  const config = await git.config.list();
  assert.equal(config.data['user.name'], 'Dev');
});

test('line parsing returns one entry per line', async () => {
  const log = await git.log({ maxCount: 5, format: '%s' });
  assert.deepEqual(log.data, ['first commit']);
});

test('positional arguments reach the CLI', async () => {
  await writeFile(join(dir, 'untracked.txt'), 'x\n', 'utf8');
  const all = await git.status({ porcelain: true });
  assert.deepEqual(all.data, ['?? untracked.txt']);

  const scoped = await git.status({ porcelain: true, paths: ['README.md'] });
  assert.deepEqual(scoped.data, []);
});

test('nested commands work end to end', async () => {
  await git.remote.add({ name: 'origin', url: 'https://example.com/repo.git' });
  const remotes = await git.remote();
  assert.deepEqual(remotes.data, ['origin']);

  const url = await git.remote.getUrl({ name: 'origin' });
  assert.equal(url.data, 'https://example.com/repo.git');
});

test('a failing command raises CLIExitError with git own message', async () => {
  await assert.rejects(
    () => git.config.get({ key: 'no.such.key' }),
    (error: unknown) => {
      assert.ok(error instanceof CLIExitError);
      assert.equal(error.exitCode, 1);
      assert.equal(error.command, 'config.get');
      return true;
    },
  );
});

test('failures can be inspected instead of thrown', async () => {
  const result = await git.config.get({ key: 'no.such.key' }, { throwOnNonZero: false });
  assert.equal(result.exitCode, 1);
  assert.equal(result.data, undefined);
});

test('environment variables and cwd are honoured', async () => {
  const author = await git.log({
    maxCount: 1,
    format: '%an <%ae>',
  });
  assert.deepEqual(author.data, ['Dev <dev@example.com>']);
});

test('the wrapped CLI own help stays available', async () => {
  // `-h` prints git's own usage; `--help` would open a man page.
  const help = await git.$.nativeHelp('status', { flag: '-h' });
  assert.match(`${help.stdout}${help.stderr}`, /usage: git status/);
});
