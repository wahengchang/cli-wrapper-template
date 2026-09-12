# cli-wrapper-template

A reusable template for wrapping an existing CLI tool with a typed JavaScript API.

You write a **schema**. The template gives you a typed client, argument generation,
process execution, a consistent result and error model, a runtime help system and
generated documentation — all from that one schema.

```ts
await git.log({ maxCount: 3, format: '%s' });
// git --no-pager log --max-count 3 --format=%s
```

- **One source of truth.** Runtime, validation, help and docs all read the same schema.
- **No infrastructure per CLI.** A new wrapper adds a schema file and tests, nothing else.
- **Thin by design.** The JS API mirrors the CLI; the wrapper does not invent semantics.
- **Zero runtime dependencies.** TypeScript and Node's own test runner in development.

## Quick start

```bash
git clone <this repo> my-cli-wrapper && cd my-cli-wrapper
npm install
npm run verify        # lint, typecheck, schema check, docs check, tests
```

The repository ships a working wrapper for a subset of `git` in
[`examples/git`](./examples/git), used by the tests and by the generated
[API reference](./docs/generated/README.md).

## Wrapping your own CLI

```text
clone → configure → run → modify → test → deploy
```

1. **Define the schema** — copy `examples/git/schema.ts` and describe your CLI.
2. **Point the tooling at it** — edit [`wrapper.config.ts`](./wrapper.config.ts).
3. **Create the client** — `createCLI({ schema })`.
4. **Test the mapping** — assert `toArgv()` output; no binary required.
5. **Generate docs** — `npm run docs`.

The full walkthrough is in [docs/guides/getting-started.md](./docs/guides/getting-started.md).

### A schema

```ts
import { createCLI, defineSchema } from 'cli-wrapper-template';

const schema = defineSchema({
  binary: 'foo',
  commands: {
    project: {
      description: 'Project management.',
      commands: {
        create: {
          description: 'Create a new project.',
          params: {
            name: { type: 'string', required: true, description: 'Project name.' },
            region: { type: 'string', values: ['us-west', 'eu-central'], description: 'Region.' },
            dryRun: { type: 'boolean', description: 'Validate without creating.' },
          },
          examples: [{ title: 'Basic project', params: { name: 'demo' } }],
        },
      },
    },
  },
});

const foo = createCLI({ schema });

await foo.project.create({ name: 'demo', dryRun: true });
// foo project create --name demo --dry-run
```

`name` is required and `region` only accepts its declared values — as types, at compile
time, with no code generation step.

## What you get

### Result contract

Raw CLI output is always preserved.

```ts
const result = await foo.project.list();

result.exitCode; // number
result.stdout;   // string
result.stderr;   // string
result.data;     // parsed output, when the schema declares a parser
result.argv;     // exactly what was passed to the binary
```

### Error model

Each failure mode is its own class, and every error carries the command, argv, exit
code and output. CLI errors are never hidden behind a generic exception.

| Error | Raised when |
|---|---|
| `CLISchemaError` | the schema itself is invalid (at `createCLI`) |
| `CLIValidationError` | parameters are missing or the wrong type (before spawning) |
| `CLIUnknownCommandError` | an unknown command path was requested |
| `CLIBinaryNotFoundError` | the executable is missing or not executable |
| `CLISpawnError` | the process could not be run, or output exceeded `maxBuffer` |
| `CLITimeoutError` | the process exceeded its timeout |
| `CLIExitError` | the CLI ran and exited non-zero |
| `CLIOutputParseError` | stdout could not be parsed by the declared parser |

### Help system

```ts
git.help();                       // every command group
git.help('remote');               // one group, with its subcommands
git.commit.help();                // full command help, JS and CLI side by side
git.getHelp('commit');            // the same thing as structured data
git.help('commit', 'markdown');   // text | markdown | json
git.searchHelp('remote');         // discovery
git.$.nativeHelp('status');       // the wrapped CLI's own --help
```

Unknown paths suggest the closest match, and validation errors point back at the help
system instead of repeating parameter documentation.

### Documentation

```bash
npm run docs         # regenerate docs/generated
npm run docs:check   # fail if generated docs are stale (used in CI)
```

Generated files carry a do-not-edit banner and live entirely under `docs/generated`;
hand-written material lives in `docs/guides`. Rendering is deterministic, so
`docs:check` is a reliable CI gate against schema/documentation drift.

### Testing

Most tests need no binary, because the process runner is an injectable seam:

```ts
const git = createCLI({ schema: gitSchema, executor: fakeExecutor().executor });
assert.deepEqual(git.status.toArgv({ porcelain: true }), ['--no-pager', 'status', '--porcelain']);
```

`npm run test:unit` covers the infrastructure and the JS→argv mapping;
`npm run test:integration` drives the real binary. See
[docs/guides/testing.md](./docs/guides/testing.md).

## Architecture

```text
JS Object API  →  CLI Schema  →  Argument Builder  →  Process Runner  →  Existing CLI
```

```text
src/
├── core/      infrastructure: types, errors, schema normalization, validation,
│              argument builder, process runner, schema lint
├── help/      help model, resolver, search, renderers (text / markdown / json)
├── client/    createCLI and the type-level projection of a schema onto an API
├── docs/      documentation generator (reuses the help model and renderers)
└── index.ts
```

Dependencies only point one way: `core` ← `help` ← `client` and `core` ← `help` ← `docs`.
`core` knows nothing about help, documentation, or any particular CLI.

Extension points, boundaries and the trade-offs behind them are documented in
[docs/guides/architecture.md](./docs/guides/architecture.md).

## Scripts

| Script | Purpose |
|---|---|
| `npm run verify` | everything CI runs |
| `npm test` | all tests |
| `npm run test:unit` / `test:integration` | without / with the real binary |
| `npm run typecheck` | types, including the type-level API tests |
| `npm run lint` | ESLint (type-aware) |
| `npm run schema:check` | structural and documentation-quality checks on the schema |
| `npm run docs` / `docs:check` | generate / verify the API reference |
| `npm run build` | emit `dist/` |

## Requirements

Node.js 22 or newer for development: tests run TypeScript directly through Node's
native type stripping, so there is no build step and no test framework to install.
The published package is plain ES modules and runs on Node 20.19+.

## Guides

- [Getting started](./docs/guides/getting-started.md) — wrap a new CLI, end to end
- [Schema reference](./docs/guides/schema-reference.md) — every field, with examples
- [Architecture](./docs/guides/architecture.md) — boundaries, extension points, decisions
- [Testing](./docs/guides/testing.md) — what to test and how
- [Generated API reference](./docs/generated/README.md) — output of `npm run docs`

## License

MIT
