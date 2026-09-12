# Testing

The test suite runs TypeScript directly through Node's native type stripping, so
there is no build step, no transpiler and no test framework to install.

```bash
npm test                  # everything
npm run test:unit         # no binary required
npm run test:integration   # drives the real CLI
npm run typecheck         # includes the type-level API tests
```

## Three kinds of test

### 1. Infrastructure tests (`test/unit/`)

Cover the generic layers once, for every wrapper: naming, schema normalization,
validation, argument building, the process runner, the client, help and docs.
You should not need to touch these when wrapping a new CLI.

The runner tests use `process.execPath` — node itself — as the binary, so they need
no fixture CLI, and they assert that arguments are never interpreted by a shell.

### 2. Mapping tests — the ones you write

For your own CLI, the test that matters is *JS call → expected argv*:

```ts
import { createCLI } from '../../src/index.ts';
import { fakeExecutor } from '../helpers.ts';

const git = createCLI({ schema: gitSchema, executor: fakeExecutor().executor });

test('status maps to the expected argv', () => {
  assert.deepEqual(git.status.toArgv({ porcelain: true, paths: ['src'] }), [
    '--no-pager', 'status', '--porcelain', '--', 'src',
  ]);
});
```

`toArgv` never starts a process, so these tests are fast and run anywhere. Assert the
full array rather than a substring: ordering is part of the contract.

To assert on execution rather than mapping, use the recording executor:

```ts
const fake = fakeExecutor({ stdout: '[]' });
const cli = createCLI({ schema, executor: fake.executor });
await cli.project.list();
assert.deepEqual(fake.lastArgv(), ['project', 'list', '--json']);
```

### 3. Integration tests (`test/integration/`)

Run the real binary for the few things a mapping test cannot prove: that the CLI
accepts the flags you generate, and that your output parsers match real output.
`examples`-driven wrappers should keep this set small and hermetic — the git
integration test builds a repository in a temporary directory and neutralises the
developer's own git configuration:

```ts
const git = createGit({
  cwd: await mkdtemp(join(tmpdir(), 'wrapper-')),
  env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
});
```

## Type-level tests

`test/types/typed-api.ts` asserts that the *types* behave: required parameters cannot
be omitted, enums reject unknown values, `result.data` follows the declared parser.
Every `@ts-expect-error` there must remain an error, so `npm run typecheck` fails if
the typed API regresses. Add a case there whenever you change the type projection.

## Schema and documentation checks

`npm run schema:check` validates the schema and its examples; `npm run docs:check`
fails when generated documentation no longer matches the schema. Both run in CI, so
a schema change cannot land with stale docs.
