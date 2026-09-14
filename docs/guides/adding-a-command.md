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

## The CLI in this walkthrough

A tiny calculator CLI:

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

That is the entire change. Three things worth noticing:

- A positional array emits one argument per element: `3 5 4`.
- `parse` gives `result.data` the return type of the function you supply — here `number`.
- `description` is not decoration. Help and generated docs are made of it, and
  `npm run schema:check` fails without it.

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

Commit the schema entry, the test and the regenerated `docs/generated/` together. CI
runs `docs:check`, so a schema change without its documentation fails the build.

You now also have, without writing any of it: help output in text, Markdown and JSON, a
page under `docs/generated/`, autocomplete on `cli.maths.multi({ … })`, and a validation
error that rejects `numbers: 'three'` before any process starts.

## Definition of done

Use this as the review checklist, so every contributor's commands look the same:

- [ ] The CLI line from question 1 was actually run in a terminal.
- [ ] One schema entry added. Nothing under `src/core/` changed.
- [ ] Every command and parameter has a `description`.
- [ ] At least one `examples` entry.
- [ ] A mapping test asserting the complete argv.
- [ ] `npm run docs` output committed in the same change.
- [ ] `npm run verify` is green.

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
