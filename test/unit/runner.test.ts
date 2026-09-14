/**
 * Runner tests use the node binary itself, so they need no fixture CLI.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawnExecutor } from '../../src/core/runner.ts';
import { CLIBinaryNotFoundError, CLISpawnError } from '../../src/core/errors.ts';
import type { ResolvedRunOptions } from '../../src/core/types.ts';

const baseOptions: ResolvedRunOptions = {
  cwd: undefined,
  env: undefined,
  timeout: 0,
  killSignal: 'SIGTERM',
  stdin: undefined,
  signal: undefined,
  maxBuffer: 1024 * 1024,
};

const node = process.execPath;

test('captures stdout, stderr and a zero exit code', async () => {
  const result = await spawnExecutor(node, ['-e', 'process.stdout.write("out"); process.stderr.write("err")'], baseOptions);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
  assert.equal(result.timedOut, false);
  assert.ok(result.durationMs >= 0);
});

test('reports a non-zero exit code instead of throwing', async () => {
  const result = await spawnExecutor(node, ['-e', 'process.exit(3)'], baseOptions);
  assert.equal(result.exitCode, 3);
});

test('arguments are never interpreted by a shell', async () => {
  const dangerous = '$(touch /tmp/should-not-exist); rm -rf /; `whoami`';
  const result = await spawnExecutor(node, ['-e', 'process.stdout.write(process.argv[1])', dangerous], baseOptions);
  assert.equal(result.stdout, dangerous);
});

test('writes stdin to the child', async () => {
  const result = await spawnExecutor(
    node,
    ['-e', 'process.stdin.on("data", (d) => process.stdout.write(d))'],
    { ...baseOptions, stdin: 'piped input' },
  );
  assert.equal(result.stdout, 'piped input');
});

test('passes environment variables and working directory', async () => {
  const result = await spawnExecutor(
    node,
    ['-e', 'process.stdout.write(`${process.env.WRAPPER_TEST}|${process.cwd()}`)'],
    { ...baseOptions, env: { ...process.env, WRAPPER_TEST: 'set' }, cwd: tmpdir() },
  );
  const [value, cwd] = result.stdout.split('|');
  assert.equal(value, 'set');
  assert.ok(cwd !== undefined && cwd.length > 0);
});

test('marks a killed process as timed out', async () => {
  const result = await spawnExecutor(node, ['-e', 'setTimeout(() => {}, 5000)'], { ...baseOptions, timeout: 50 });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.signal, null);
});

test('missing binaries raise CLIBinaryNotFoundError', async () => {
  await assert.rejects(
    () => spawnExecutor('definitely-not-a-real-binary-xyz', [], baseOptions),
    (error: unknown) => {
      assert.ok(error instanceof CLIBinaryNotFoundError);
      assert.equal(error.code, 'BINARY_NOT_FOUND');
      assert.equal(error.binary, 'definitely-not-a-real-binary-xyz');
      return true;
    },
  );
});

test('output beyond maxBuffer raises CLISpawnError', async () => {
  await assert.rejects(
    () => spawnExecutor(node, ['-e', 'process.stdout.write("x".repeat(5000))'], { ...baseOptions, maxBuffer: 100 }),
    (error: unknown) => {
      assert.ok(error instanceof CLISpawnError);
      assert.match(error.message, /maxBuffer/);
      return true;
    },
  );
});

test('an abort signal stops the process', async () => {
  const controller = new AbortController();
  const promise = spawnExecutor(node, ['-e', 'setTimeout(() => {}, 5000)'], { ...baseOptions, signal: controller.signal });
  controller.abort();
  await assert.rejects(promise);
});
