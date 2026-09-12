import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCLI } from '../../src/index.ts';
import {
  CLIExitError,
  CLIOutputParseError,
  CLITimeoutError,
  CLIUnknownCommandError,
  CLIValidationError,
} from '../../src/core/errors.ts';
import { fooSchema } from '../fixtures/foo.ts';
import { fakeExecutor } from '../helpers.ts';

function client(result?: Parameters<typeof fakeExecutor>[0]) {
  const fake = fakeExecutor(result);
  return { cli: createCLI({ schema: fooSchema, executor: fake.executor }), fake };
}

test('mirrors the command hierarchy as nested objects', () => {
  const { cli } = client();
  assert.equal(typeof cli.auth.login, 'function');
  assert.equal(typeof cli.project.create, 'function');
  assert.equal(typeof cli.deploy, 'function');
  assert.equal(typeof cli.project, 'object');
});

test('a JS call produces the expected argv', async () => {
  const { cli, fake } = client();
  await cli.deploy({ projectId: 'abc', dryRun: true, path: './dist' });
  assert.deepEqual(fake.lastArgv(), ['deploy', '--project-id', 'abc', '--dry-run', './dist']);
  assert.equal(fake.calls[0]?.binary, 'foo');
});

test('commands can be invoked without arguments when nothing is required', async () => {
  const { cli, fake } = client();
  await cli.auth.logout();
  assert.deepEqual(fake.lastArgv(), ['auth', 'logout']);
});

test('the result preserves raw CLI information', async () => {
  const { cli } = client({ exitCode: 0, stdout: 'out', stderr: 'warn' });
  const result = await cli.auth.logout();
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'warn');
  assert.equal(result.binary, 'foo');
  assert.equal(result.command, 'auth.logout');
  assert.deepEqual(result.argv, ['auth', 'logout']);
  assert.equal(result.data, undefined);
});

test('declared parsers fill result.data while keeping stdout', async () => {
  const { cli } = client({ stdout: '[{"id":"p1"}]' });
  const result = await cli.project.list();
  assert.deepEqual(result.data, [{ id: 'p1' }]);
  assert.equal(result.stdout, '[{"id":"p1"}]');
});

test('unparseable output raises CLIOutputParseError with context', async () => {
  const { cli } = client({ stdout: 'not json' });
  await assert.rejects(
    () => cli.project.list(),
    (error: unknown) => {
      assert.ok(error instanceof CLIOutputParseError);
      assert.equal(error.command, 'project.list');
      assert.equal(error.stdout, 'not json');
      return true;
    },
  );
});

test('a non-zero exit raises CLIExitError carrying the CLI output', async () => {
  const { cli } = client({ exitCode: 2, stderr: 'boom' });
  await assert.rejects(
    () => cli.deploy({ projectId: 'a', path: '.' }),
    (error: unknown) => {
      assert.ok(error instanceof CLIExitError);
      assert.equal(error.exitCode, 2);
      assert.equal(error.stderr, 'boom');
      assert.deepEqual(error.argv, ['deploy', '--project-id', 'a', '.']);
      assert.match(error.message, /boom/);
      return true;
    },
  );
});

test('throwOnNonZero: false returns the failed result instead', async () => {
  const { cli } = client({ exitCode: 2, stderr: 'boom' });
  const result = await cli.deploy({ projectId: 'a', path: '.' }, { throwOnNonZero: false });
  assert.equal(result.exitCode, 2);
  assert.equal(result.data, undefined);
});

test('a timed-out run raises CLITimeoutError', async () => {
  const { cli } = client({ timedOut: true, exitCode: -1 });
  await assert.rejects(
    () => cli.auth.logout({}, { timeout: 25 }),
    (error: unknown) => {
      assert.ok(error instanceof CLITimeoutError);
      assert.equal(error.timeout, 25);
      return true;
    },
  );
});

test('invalid parameters fail before any process starts', async () => {
  const { cli, fake } = client();
  await assert.rejects(() => (cli.project.create as (p: unknown) => Promise<unknown>)({}), CLIValidationError);
  assert.equal(fake.calls.length, 0);
});

test('per-call options reach the executor, merged over client defaults', async () => {
  const fake = fakeExecutor();
  const cli = createCLI({ schema: fooSchema, executor: fake.executor, cwd: '/base', timeout: 1000 });
  await cli.auth.logout({}, { cwd: '/override', env: { TOKEN: 'x' } });
  const options = fake.calls[0]?.options;
  assert.equal(options?.cwd, '/override');
  assert.equal(options?.timeout, 1000);
  assert.equal(options?.env?.TOKEN, 'x');
  assert.ok(options?.env?.PATH !== undefined, 'merge mode keeps the ambient environment');
});

test('envMode replace passes only the supplied variables', async () => {
  const fake = fakeExecutor();
  const cli = createCLI({ schema: fooSchema, executor: fake.executor, envMode: 'replace', env: { ONLY: '1' } });
  await cli.auth.logout();
  assert.deepEqual(fake.calls[0]?.options.env, { ONLY: '1' });
});

test('extraArgs is an escape hatch for unmodelled flags', async () => {
  const { cli, fake } = client();
  await cli.auth.logout({}, { extraArgs: ['--verbose'] });
  assert.deepEqual(fake.lastArgv(), ['auth', 'logout', '--verbose']);
});

test('with() derives a client that shares the schema', async () => {
  const fake = fakeExecutor();
  const cli = createCLI({ schema: fooSchema, executor: fake.executor, cwd: '/a' });
  const scoped = cli.$.with({ cwd: '/b' });
  await scoped.auth.logout();
  assert.equal(fake.calls[0]?.options.cwd, '/b');
  assert.equal(scoped.$.registry, cli.$.registry);
});

test('hooks observe successful and failed runs', async () => {
  const events: string[] = [];
  const fake = fakeExecutor({ exitCode: 1 });
  const cli = createCLI({
    schema: fooSchema,
    executor: fake.executor,
    hooks: {
      beforeRun: (event) => void events.push(`before:${event.command}`),
      afterRun: (event) => void events.push(`after:${event.command}`),
      onError: (event) => void events.push(`error:${event.command}`),
    },
  });

  await assert.rejects(() => cli.auth.logout());
  assert.deepEqual(events, ['before:auth.logout', 'error:auth.logout']);
});

test('toArgv and toCommandLine do not run anything', () => {
  const { cli, fake } = client();
  assert.deepEqual(cli.deploy.toArgv({ projectId: 'a', path: './d' }), ['deploy', '--project-id', 'a', './d']);
  assert.equal(cli.deploy.toCommandLine({ projectId: 'a', path: './d' }), 'foo deploy --project-id a ./d');
  assert.equal(fake.calls.length, 0);
});

test('the meta API is reachable at $ and aliased on the root', () => {
  const { cli } = client();
  assert.equal(typeof cli.$.help, 'function');
  assert.equal(typeof cli.help, 'function');
  assert.equal(cli.$.binary, 'foo');
  assert.ok(cli.$.commands().includes('project.create'));
  assert.ok(cli.$.hasCommand('deploy'));
  assert.ok(!cli.$.hasCommand('nope'));
});

test('command names always win over meta aliases', () => {
  const fake = fakeExecutor();
  const cli = createCLI({
    schema: { binary: 'x', commands: { help: { description: 'A real command named help.', params: {} } } },
    executor: fake.executor,
  });

  assert.equal(typeof cli.help, 'function');
  assert.equal((cli.help as unknown as { path: string }).path, 'help');
  assert.equal(typeof cli.$.help, 'function');
});

test('running an unknown command path suggests a close match', async () => {
  const { cli } = client();
  await assert.rejects(
    () => cli.$.run('project.creat', { name: 'd' }),
    (error: unknown) => {
      assert.ok(error instanceof CLIUnknownCommandError);
      assert.deepEqual(error.suggestions, ['project.create']);
      return true;
    },
  );
});

test('nativeHelp runs the wrapped CLI own help', async () => {
  const { cli, fake } = client({ stdout: 'usage: foo' });
  const result = await cli.$.nativeHelp('project.create');
  assert.deepEqual(fake.lastArgv(), ['project', 'create', '--help']);
  assert.equal(result.stdout, 'usage: foo');

  await cli.$.nativeHelp('project create', { flag: '-h' });
  assert.deepEqual(fake.lastArgv(), ['project', 'create', '-h']);
});

test('an invokable group is callable and still exposes its children', async () => {
  const fake = fakeExecutor();
  const cli = createCLI({
    schema: {
      binary: 'x',
      commands: {
        remote: { description: 'Remotes.', invokable: true, commands: { add: { description: 'Add.', params: {} } } },
      },
    },
    executor: fake.executor,
  });

  await cli.remote();
  assert.deepEqual(fake.lastArgv(), ['remote']);
  await cli.remote.add();
  assert.deepEqual(fake.lastArgv(), ['remote', 'add']);
});
