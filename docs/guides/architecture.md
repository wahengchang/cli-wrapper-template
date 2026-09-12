# Architecture

## The pipeline

```text
JS Object API
    ↓  createCLI builds a nested object from the schema
CLI Schema
    ↓  normalizeSchema resolves defaults into a registry
Argument Builder
    ↓  buildArgs turns validated values into argv
Process Runner
    ↓  spawn(binary, argv, { shell: false })
Existing CLI
```

Every layer is generic. The only CLI-specific artifact is the schema.

## Layers and dependency direction

```text
core  ←  help  ←  client
core  ←  help  ←  docs
```

| Layer | Owns | Must not |
|---|---|---|
| `core` | types, errors, schema normalization, validation, argument building, process execution, schema lint | know about help, docs, or any specific CLI |
| `help` | the normalized help model and its renderers | modify the registry |
| `client` | `createCLI`, the type-level schema→API projection | contain argv or process logic |
| `docs` | orchestration and filesystem output | re-render anything `help` already renders |

`client` is the only layer allowed to depend on both `core` and `help`, which is why
`createCLI` lives there and not in `core`.

## One normalized model

The single most important decision: **there is exactly one normalization step.**

```text
authored schema → normalizeSchema → CommandRegistry
                                      ├── runtime (argv, validation)
                                      ├── help    (model → text/markdown/json)
                                      └── docs    (model → files)
```

The drafts warned against a separate help model and a separate docs model. Here, docs
are the help model written to disk: `renderCommandMarkdown` is the same function
behind `cli.help(path, 'markdown')` and behind `docs/generated/commands/*.md`. Help
and documentation cannot drift, because they are the same code path.

Likewise there is one validation model. The schema linter checks examples by running
them through the runtime's `validateParams`, so an example that would fail at runtime
fails the schema check.

## Extension points

Everything below is reachable without editing `core`.

| Need | Extension point |
|---|---|
| run commands differently (tests, dry run, sandbox, remote host) | `executor` — the `Executor` function passed to `createCLI` |
| logging, metrics, tracing | `hooks.beforeRun` / `afterRun` / `onError` |
| different defaults per instance (cwd, env, timeout) | `createCLI({ cwd, env, timeout, ... })` or `cli.$.with({ ... })` |
| typed structured output | `output.parse` as a function |
| a flag the schema does not model yet | `options.extraArgs` |
| another help or docs output format | a renderer in `src/help/renderers/` consuming the help model |
| stricter or looser schema rules | `lintSchema(registry, { strict, ignore })` |

The `Executor` seam is what keeps the test suite fast: almost every test asserts on
generated argv without starting a process.

## Decisions and trade-offs

**Types are derived, not generated.** `createCLI` projects the schema onto a typed API
with conditional types, so there is no build step and no generated code to keep in
sync. The cost is that schemas must be written with `defineSchema` (or `as const`) to
preserve literal types, and that very large schemas put more work on the type checker.

**A non-zero exit throws by default.** Most callers treat a failed command as an
error, and silent failure is the worse default. Pass `throwOnNonZero: false` per call
or per client to inspect `result.exitCode` instead. Either way the result and the
error carry the same information.

**Defaults are documented, not applied.** A `default` in the schema records what the
CLI does on its own; the wrapper sends nothing unless you set `applyDefault: true`.
This keeps the wrapper's behaviour identical to the bare CLI by default.

**Meta methods live at `cli.$`.** A wrapped CLI may well have a command called `help`
or `run`. Command names always win at the root, and the full meta API is always
reachable at `cli.$`; root aliases (`cli.help(...)`) exist only for names the schema
does not use. The type of the client reflects exactly this rule.

**Positional values starting with `-` are rejected.** A caller-supplied positional
that looks like a flag is an argument-injection vector. Set `allowDashValue: true` on
parameters where the CLI genuinely accepts such values.

**Groups are objects, commands are functions.** A group with `invokable: true` is
both. No class per command, no factory hierarchy — just plain objects and functions
built from the registry.

**Output parsing only runs on success.** On a non-zero exit, stdout is usually empty
or a partial error message; parsing it would turn one failure into a confusing
second one. `result.data` stays `undefined` and the raw streams remain available.

## Security notes

- Commands are spawned with `shell: false`. No argument is ever interpolated into a
  command string, so shell metacharacters in user input are inert. There is a test
  asserting exactly this.
- `quoteArgument` and `formatCommandLine` exist for **display only** — help output,
  docs, error messages. Nothing in the execution path consumes them.
- Positional arguments that look like flags are rejected unless explicitly allowed.
- `env` merges over `process.env` by default; use `envMode: 'replace'` to pass a
  closed environment, and `env: { SECRET: undefined }` to remove an inherited variable.

## What is deliberately absent

No plugin system, no middleware chain, no class hierarchy, no runtime dependencies,
no documentation website, no caching or retry layer. Each of those is easy to add on
top of the `Executor` and hook seams when a real requirement appears — and none of
them can be removed once a template ships with them.
