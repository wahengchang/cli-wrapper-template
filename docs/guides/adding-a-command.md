# Adding a command

The procedure for adding a command to a wrapper, or changing one that already
exists. Follow it top to bottom — you do not need to understand the rest of the
framework first. It takes about fifteen minutes, and the example below is a real
command you can add to the `git` wrapper in this repository right now.

---

## Understand

Three facts. That is the whole mental model.

**1. A command is data, not code.** You add one entry to a schema file. Everything
else is derived from it:

```text
you write                    you get, with no extra work
─────────                    ──────────────────────────
one schema entry       →     git.diff({ ... })     a typed method
                             argument generation
                             parameter validation
                             git.diff.help()
                             docs/generated/commands/diff.md
```

**2. You never write argument or process code.** No `argv` assembly, no `spawn`, no
`try/catch` around either. If a change has you editing anything under `src/core/`,
stop — the answer is almost certainly a schema field instead.

**3. Two commands give you all your feedback.** `toCommandLine()` shows what will run
without running it; `npm run verify` proves the whole thing.

---

## Define

Answer these four questions **before you type any code**. Put the answers in your
pull request description — they are the review checklist.

| # | Question | Worked example |
|---|---|---|
| 1 | Which CLI line do you want to produce? | `git diff --name-only main` |
| 2 | Which JS call should produce it? | `git.diff({ nameOnly: true, revision: 'main' })` |
| 3 | What is each parameter — name, type, required, flag or positional? | `nameOnly`: boolean, optional, flag<br>`staged`: boolean, optional, flag<br>`revision`: string, optional, positional |
| 4 | Does the output need parsing? | Yes — one file path per line |

Two rules while you answer them:

- **Question 1 must be a command you have actually run in a terminal.** The wrapper
  mirrors the CLI; it never invents or fixes behaviour. If the line does not work in
  your shell, it will not work here.
- **Keep the CLI's own names.** `--name-only` becomes `nameOnly` automatically, and
  the mapping is mechanical in both directions. Do not rename concepts, do not invent
  friendlier words, do not flatten the command hierarchy.

---

## Build

Open your schema — for this example, `examples/git/schema.ts` — and add one entry to
`commands`:

```ts
diff: {
  description: 'Show changes between commits.',
  params: {
    nameOnly: { type: 'boolean', description: 'List only the names of changed files.' },
    staged: { type: 'boolean', description: 'Compare the staged changes against HEAD.' },
    revision: { type: 'string', positional: true, description: 'Revision or range to compare.' },
  },
  output: { parse: 'lines', type: 'string[]', description: 'One changed path per line.' },
  examples: [{ title: 'Files changed in the last commit', params: { nameOnly: true, revision: 'HEAD~1' } }],
},
```

That is the entire change. Three things are happening by default, which is why the
entry is this short:

- `nameOnly` becomes `--name-only`; you only write `flag` when a CLI does something
  unusual.
- `revision` is positional, so it is emitted after the flags, in declaration order.
- `parse: 'lines'` turns stdout into `string[]` on `result.data`, while
  `result.stdout` keeps the raw output.

Every command and every parameter needs a `description`. It is not decoration: it is
what the help system and the generated documentation are made of, and the schema
check fails without it.

---

## Verify

### 1. Look at the command line first (seconds)

```bash
node -e "import('./examples/git/index.ts').then(({ git }) => console.log(git.diff.toCommandLine({ nameOnly: true, revision: 'main' })))"
```

```text
git --no-pager diff --name-only main
```

Compare that against your answer to question 1. **If this line is not what you would
type in a terminal, fix the schema and run it again** — nothing else matters until it
matches. No process is started, so this loop is instant.

### 2. Lock the mapping with a test

In `test/unit/example-git.test.ts`:

```ts
test('diff maps to the expected argv', () => {
  assert.deepEqual(git.diff.toArgv({ nameOnly: true, revision: 'main' }), [
    '--no-pager',
    'diff',
    '--name-only',
    'main',
  ]);
});
```

```bash
npm run test:unit
```

Assert the whole array, not a fragment: ordering is part of the contract. This test
needs no binary, so it runs anywhere in milliseconds.

### 3. Run the full checks

```bash
npm run docs     # regenerate the API reference
npm run verify   # lint, typecheck, schema check, docs check, tests
```

Commit the schema entry, the test, and the regenerated `docs/generated/` together.
CI runs `docs:check`, so a schema change without its documentation fails the build.

### What you now have, without writing it

```text
$ git.diff.help()

diff

Show changes between commits.

Usage:

  git.diff({ nameOnly?: boolean, staged?: boolean, revision?: string })

CLI:

  git --no-pager diff [--name-only] [--staged] [<revision>]

Parameters:

nameOnly
  boolean  optional
  CLI: --name-only
  List only the names of changed files.
...
```

Plus `docs/generated/commands/diff.md`, an entry in the command tree, the command in
`api.json`, autocomplete on `git.diff({ … })`, and a validation error that rejects
`nameOnly: 'yes'` before any process starts.

---

## Definition of done

Use this as the review checklist so every contributor's commands look the same:

- [ ] The CLI line from question 1 was actually run in a terminal.
- [ ] One schema entry added. Nothing under `src/core/` changed.
- [ ] Every command and parameter has a `description`.
- [ ] At least one `examples` entry.
- [ ] A mapping test asserting the complete argv.
- [ ] `npm run docs` output committed in the same change.
- [ ] `npm run verify` is green.

---

## Changing an existing command

Same four questions, same loop. One extra consideration: the schema is your public
API, so treat JS names as a contract.

| Change | Safe? | Do this |
|---|---|---|
| Add an optional parameter | Yes | Just add it. |
| Add a `description`, `example` or `notes` | Yes | Just add it. |
| Fix a wrong flag, or a wrong `assign` / positional | Yes — it was broken | Fix it, and add a test that pins the correct argv. |
| Rename a parameter or command | **No** | Add the new name, mark the old one `deprecated: 'Use X instead.'`, remove it in the next major version. |
| Make an optional parameter required | **No** | Same as a rename: introduce it optional, deprecate the old shape. |

`deprecated` takes a string reason, which shows up in help and docs — a bare `true`
is reported by the schema check as a missing reason.

---

## When the happy path is not enough

Real CLIs are inconsistent. Every quirk below is handled by a schema field, never by
code in `src/`:

| The CLI does this | Use |
|---|---|
| requires `--flag=value` | `assign: true` |
| has a negative form like `--no-verify` | `falseFlag: '--no-verify'` |
| takes a comma-separated list | `delimiter: ','` |
| accepts a fixed set of values | `values: ['a', 'b']` |
| needs `--` before file arguments | `positionalSeparator: '--'` |
| has no subcommand word where your JS API wants one | `command: []` |
| is callable *and* has subcommands, like `git remote` | `invokable: true` |
| needs a flag on every call | `default` + `applyDefault: true` |
| legitimately accepts a positional starting with `-` | `allowDashValue: true` |
| emits JSON or another structured format | `output.parse` — pass a function to type `result.data` |
| has a flag you have not modelled yet | `options.extraArgs` at the call site |

Each field is documented with examples in the
[schema reference](./schema-reference.md). If you hit something that genuinely has no
schema answer, that is a template bug worth raising — not a reason to hand-build argv.

---

## Troubleshooting

| You see | It means | Fix |
|---|---|---|
| `Schema check found 1 error(s)`<br>`missing-description  diff.nameOnly` | A command or parameter has no description. | Add `description`. |
| `Generated documentation is out of date.`<br>`missing  commands/diff.md` | The schema changed but the docs were not regenerated. | `npm run docs`, then commit the result. |
| `Invalid parameters for diff:`<br>`- "nameOnly" must be a boolean` | The caller passed the wrong type; nothing was executed. | Fix the call, or the parameter's `type` if the schema is wrong. |
| `CLIExitError: git diff exited with code 128` | Your argv reached git and git rejected it. | Read `error.argv`, paste that line into a terminal, and fix the schema until it works there. |
| `CLIValidationError: unknown parameter "nameonly", did you mean "nameOnly"?` | A typo at the call site. | Use the suggested name. |
| `must not start with "-"` on a positional | A positional value looks like a flag — rejected to prevent argument injection. | Use the intended value, or set `allowDashValue: true` if the CLI really accepts it. |
| Types do not narrow; everything is `string` | The schema was written without `defineSchema` (or `as const`). | Wrap the schema in `defineSchema({ … })`. |

---

## Next

- [Schema reference](./schema-reference.md) — every field, with examples
- [Testing](./testing.md) — what to test, and how to test without the binary
- [Getting started](./getting-started.md) — wrapping a *new* CLI, rather than adding to one
- [Architecture](./architecture.md) — why the framework is shaped this way
