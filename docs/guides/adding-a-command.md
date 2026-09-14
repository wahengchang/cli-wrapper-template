# Adding a command

The procedure for adding a command to a wrapper, or changing one that already exists.
Follow it top to bottom — you do not need to understand the rest of the framework first.

## Understand

Three facts. That is the whole mental model.

**1. A command is data, not code.** You add one entry to a schema file, and everything
else is derived from it:

```text
one schema entry  →  a typed method, argument generation, parameter
                     validation, help output and generated documentation
```

**2. You never write argument or process code.** No argv assembly, no `spawn`. If a
change has you editing `src/core/`, stop — the answer is almost certainly a schema field.

**3. Two commands give you all your feedback.** `toCommandLine()` shows what will run
without running it; `npm run verify` proves it.

## Where things live

Four files matter. The paths below are this repository's `git` example; a wrapper for
another CLI has the same four files in its own folder. You will normally touch the
first and the third.

| What | Where | Note |
|---|---|---|
| **The schema** — what you edit | `examples/git/schema.ts` | The wrapper's command definitions. One file per wrapped CLI. |
| The client that exposes it | `examples/git/index.ts` | Thin: `createCLI({ schema })` plus a factory. Rarely changes. |
| **Mapping tests** — what you add | `test/unit/example-git.test.ts` | One test per command: JS call → expected argv. |
| Integration tests | `test/integration/git.test.ts` | Only for the few commands worth running the real binary for. |

Two more worth knowing about, which you do **not** hand-edit:

- `wrapper.config.ts` — points the tooling at your schema. Change it once, when you
  wrap a different CLI.
- `docs/generated/` — the API reference, produced by `npm run docs`. Every file says
  "Do not edit by hand" at the top. `npm run docs:check` compares it byte for byte and
  fails CI if it is stale, so regenerate rather than edit.

Everything under `src/` is the generic engine, shared by every wrapper. Adding a
command never requires changing it, and the other files in `test/unit/` test that
engine, not your CLI — leave them alone.

### Where a command goes in the schema

The `commands` object mirrors the CLI's own hierarchy. A nested `commands` block adds
one CLI word:

```ts
commands: {
  gettime: { … },            // top level  → node cli.js gettime
  maths: {                   // a group: contributes the word "maths"
    commands: {
      add: { … },            // subcommand → node cli.js maths add
      multi: { … },          // subcommand → node cli.js maths multi
    },
  },
}
```

So a top-level command is an entry in the root `commands`; a subcommand is an entry in
its parent's `commands`. Nest as deep as the CLI does.

## The CLI in this walkthrough

The repository's real example wraps `git`, which is more than we need here, so this
walkthrough uses a tiny calculator CLI instead. The steps are identical; only the
schema contents differ.

```bash
node cli.js maths add 1 2 3     # 6
node cli.js maths multi 3 5 4   # 60
node cli.js gettime             # 2026-09-14T03:56:29.727Z
```

`maths add` and `gettime` are already wrapped. Your task is to **add `maths multi`**.

```ts
const schema = defineSchema({
  binary: 'node',
  globalArgs: ['cli.js'], // the script is an argument to node, not a binary itself
  commands: {
    maths: {
      description: 'Arithmetic commands.',
      commands: {
        add: {
          description: 'Add numbers together.',
          params: {
            numbers: { type: 'number[]', positional: true, required: true, description: 'Numbers to add.' },
          },
          output: { parse: (stdout: string): number => Number(stdout.trim()), type: 'number' },
        },
      },
    },
    gettime: { description: 'Print the current time.' },
  },
});
```

## Define

Answer these four questions **before you type any code**. Put the answers in your pull
request description — they are the review checklist.

| # | Question | Answer for `maths multi` |
|---|---|---|
| 1 | Which CLI line do you want to produce? | `node cli.js maths multi 3 5 4` |
| 2 | Which JS call should produce it? | `cli.maths.multi({ numbers: [3, 5, 4] })` |
| 3 | What is each parameter — name, type, required, flag or positional? | `numbers`: `number[]`, required, positional |
| 4 | Does the output need parsing? | Yes — a single number |

Two rules while you answer them:

- **Question 1 must be a line you have actually run in a terminal.** The wrapper
  mirrors the CLI; it never invents or fixes behaviour.
- **Keep the CLI's own names.** `--dry-run` becomes `dryRun` automatically, and
  `gettime` stays `gettime` — writing it as `getTime` would produce the CLI word
  `get-time`, which is a different command.

## Build

Add one entry next to `add`:

```ts
multi: {
  description: 'Multiply numbers together.',
  params: {
    numbers: { type: 'number[]', positional: true, required: true, description: 'Numbers to multiply.' },
  },
  output: { parse: (stdout: string): number => Number(stdout.trim()), type: 'number' },
  examples: [{ title: 'Multiply three numbers', params: { numbers: [3, 5, 4] } }],
},
```

That is the entire change. Two things worth noticing: a positional array emits one
argument per element (`3 5 4`), and `parse` gives `result.data` the return type of the
function you supply — here `number`.

### Mapping the common parameters

These five cover most commands. The flag is derived from the JS name, so `dryRun`
becomes `--dry-run` and you do not write it out:

| The CLI takes | Declare | Call it with |
|---|---|---|
| `--name demo` | `{ type: 'string' }` | `{ name: 'demo' }` |
| `--dry-run` | `{ type: 'boolean' }` | `{ dryRun: true }` |
| `--count 3` | `{ type: 'number' }` | `{ count: 3 }` |
| `demo` with no flag | `{ type: 'string', positional: true }` | `{ name: 'demo' }` |
| `--tags a --tags b` | `{ type: 'string[]' }` (or `'number[]'`) | `{ tags: ['a', 'b'] }` |

A parameter you leave out of the call is left out of the command line. Add
`required: true` to reject the call instead. Flags are emitted in declaration order,
then positionals in declaration order.

Anything stranger — `--flag=value`, `--no-cache`, comma-separated lists, a fixed set of
allowed values, a `--` before file arguments — has a schema field for it, listed under
[which field do I need?](./schema-reference.md#which-field-do-i-need) in the reference.

### What is actually required

| Field | Required? |
|---|---|
| `type` | **Yes** — nothing works without it. |
| `description` | Optional in the schema, but **required here**: this repo runs `schema:check` with `strict: true`, which turns a missing description into a build error. |
| `required`, `positional`, `flag`, `output` | Optional. Omit them and you get a flag named after the JS key, taking a value, that the caller may skip. |
| `examples` | Optional, and not enforced by any check — but they render into help and docs, so this repo adds one per command by convention. |

## Verify

### 1. Look at the command line first (seconds)

```ts
cli.maths.multi.toCommandLine({ numbers: [3, 5, 4] });
// node cli.js maths multi 3 5 4
```

Compare that against your answer to question 1. **If this line is not what you would
type in a terminal, fix the schema and look again** — nothing else matters until it
matches. No process is started, so the loop is instant.

### 2. Lock the mapping with a test

```ts
test('maths.multi maps to the expected argv', () => {
  assert.deepEqual(cli.maths.multi.toArgv({ numbers: [3, 5, 4] }), [
    'cli.js',
    'maths',
    'multi',
    '3',
    '5',
    '4',
  ]);
});
```

Assert the whole array, not a fragment: ordering is part of the contract. This test
needs no binary, so it runs anywhere in milliseconds.

### 3. Run the full checks

```bash
npm run docs     # regenerate the API reference
npm run verify   # lint, typecheck, schema check, docs check, tests
```

`npm run docs` rewrites `docs/generated/` from the schema — that is the only way those
files should ever change. Commit the schema entry, the test and the regenerated docs
together; CI runs `docs:check`, so a schema change without its documentation fails the
build, and so does a hand-edit that the generator would not produce.

You now also have, without writing any of it: help output in text, Markdown and JSON, a
page under `docs/generated/`, autocomplete on `cli.maths.multi({ … })`, and a validation
error that rejects `numbers: 'three'` before any process starts.

## Definition of done

Use this as the review checklist, so every contributor's commands look the same.
The first three are enforced by `npm run verify`; the rest are for a reviewer to check.

- [ ] `npm run verify` is green.
- [ ] Every command and parameter has a `description` (strict mode fails without it).
- [ ] `npm run docs` output committed in the same change, regenerated rather than edited.
- [ ] One schema entry added. Nothing under `src/` changed.
- [ ] A mapping test asserting the complete argv.
- [ ] The CLI line from question 1 was actually run in a terminal, and at least one
      `examples` entry records it.

## Changing an existing command

Same four questions, same loop. The schema is your public API, so treat JS names as a
contract.

| Change | Safe? | Do this |
|---|---|---|
| Add an optional parameter | Yes | Just add it. |
| Add a `description`, example or note | Yes | Just add it. |
| Fix a wrong flag or positional | Yes — it was broken | Fix it, and add a test pinning the correct argv. |
| Rename a parameter or command | **No** | Add the new name, mark the old one `deprecated: 'Use X instead.'`, remove it in the next major version. |
| Make an optional parameter required | **No** | Same as a rename: introduce the new shape, deprecate the old one. |

## Next

- [Schema reference](./schema-reference.md) — every field, which field solves which CLI
  quirk, and what to do when something goes wrong
- [Testing](./testing.md) — what to test, and how to test without the binary
- [Getting started](./getting-started.md) — wrapping a *new* CLI, rather than adding to one
