# Schema reference

The schema is the source of truth for argv generation, validation, types, help and
documentation. Everything on this page is optional except `binary`, `commands`, and
each parameter's `type`.

## Schema

```ts
defineSchema({
  binary: 'git',
  description: 'Distributed version control system.',
  globalArgs: ['--no-pager'],
  commands: { /* ... */ },
});
```

| Field | Type | Meaning |
|---|---|---|
| `binary` | `string` | Executable name or absolute path. |
| `description` | `string` | Shown at the top of help and docs. |
| `globalArgs` | `string[]` | Arguments inserted before the command words on every call. |
| `commands` | `Record<string, CommandSpec>` | The command tree; keys are JS property names. |

## Command

```ts
create: {
  command: 'create',
  description: 'Create a new project.',
  params: { /* ... */ },
  commands: { /* nested subcommands */ },
  invokable: false,
  output: { parse: 'json', type: 'Project[]' },
  examples: [{ title: 'Basic', params: { name: 'demo' } }],
  related: ['project.list'],
  positionalSeparator: '--',
  deprecated: 'Use project.new instead.',
  notes: 'Requires an authenticated session.',
}
```

| Field | Type | Meaning |
|---|---|---|
| `command` | `string \| string[]` | CLI word(s). Defaults to kebab-case of the JS key. `[]` adds no word — use it when the JS hierarchy is deeper than the CLI's. |
| `description` | `string` | Surfaced in help and docs. |
| `params` | `Record<string, ParamSpec>` | Parameters, in emission order. |
| `commands` | `Record<string, CommandSpec>` | Subcommands. A node with `commands` is a group. |
| `invokable` | `boolean` | Make a group callable itself, like `git remote`. |
| `output` | `OutputSpec` | How to turn stdout into `result.data`. |
| `examples` | `ExampleSpec[]` | Rendered as JS *and* the equivalent CLI line, and validated by the schema check. |
| `related` | `string[]` | Related command paths; verified to exist. |
| `positionalSeparator` | `string` | Emitted before the first positional, typically `--`. |
| `deprecated` | `boolean \| string` | Marks the command deprecated; the string is the reason. |
| `notes` | `string` | Extra usage notes. |

## Parameter

| Field | Type | Meaning |
|---|---|---|
| `type` | `'string' \| 'number' \| 'boolean' \| 'string[]' \| 'number[]'` | Required. Drives argv, validation and types. |
| `flag` | `string` | CLI flag with dashes. Defaults to `--` + kebab-case of the JS key. |
| `positional` | `boolean` | Emit as a positional argument. Positionals follow flags, in declaration order. |
| `required` | `boolean` | Rejected before spawning when missing. |
| `default` | value | The **CLI's own** default. Documented, never sent. |
| `applyDefault` | `boolean` | Send `default` when the caller omits the parameter. |
| `description` | `string` | Surfaced in help and docs. |
| `values` | `string[]` | Allowed values; validated and narrowed to a union type. |
| `assign` | `boolean` | Emit `--flag=value` instead of `--flag value`. |
| `delimiter` | `string` | For arrays: join with this instead of repeating the flag. |
| `falseFlag` | `string` | For booleans: flag emitted when the value is `false`, such as `--no-cache`. |
| `allowDashValue` | `boolean` | Permit a positional value starting with `-`. |
| `aliases` | `string[]` | Alternative CLI spellings; documentation only. |
| `deprecated` | `boolean \| string` | Marks the parameter deprecated. |
| `notes` | `string` | Extra usage notes. |

### `default` vs `applyDefault`

`default` documents what the CLI does when the flag is absent; the wrapper sends
nothing, so behaviour matches the bare CLI. Set `applyDefault: true` only when you
deliberately want the wrapper to differ from the CLI:

```ts
// documented, never sent — `foo create --name x`
region: { type: 'string', default: 'us-west' }

// always sent unless overridden — `foo list --json`
json: { type: 'boolean', default: true, applyDefault: true }
```

### Emission rules

| Declaration | Call | argv |
|---|---|---|
| `{ type: 'string' }` | `{ name: 'demo' }` | `--name demo` |
| `{ type: 'string', assign: true }` | `{ name: 'demo' }` | `--name=demo` |
| `{ type: 'number' }` | `{ timeout: 30 }` | `--timeout 30` |
| `{ type: 'boolean' }` | `{ dryRun: true }` | `--dry-run` |
| `{ type: 'boolean' }` | `{ dryRun: false }` | *(nothing)* |
| `{ type: 'boolean', falseFlag: '--no-cache' }` | `{ cache: false }` | `--no-cache` |
| `{ type: 'string[]' }` | `{ tag: ['a', 'b'] }` | `--tag a --tag b` |
| `{ type: 'string[]', delimiter: ',' }` | `{ tag: ['a', 'b'] }` | `--tag a,b` |
| `{ type: 'string', positional: true }` | `{ path: './dist' }` | `./dist` |
| `{ type: 'string[]', positional: true }` | `{ paths: ['a', 'b'] }` | `a b` |

Argument order is: `globalArgs`, command words, flags in declaration order,
`positionalSeparator`, positionals in declaration order, then any `extraArgs`.

## Output

```ts
output: {
  parse: 'json' | 'lines' | ((stdout: string, result: RawResult) => T),
  type: 'Project[]',
  description: 'Projects owned by the account.',
}
```

- `'json'` — `JSON.parse(stdout)`, typed as `unknown`.
- `'lines'` — non-empty lines, typed as `string[]`.
- a function — `result.data` gets the function's return type. This is how you get a
  precisely typed result without code generation.

Parsing runs only on exit code `0`. `result.stdout` is always the raw output, and a
parser failure raises `CLIOutputParseError` rather than returning a half-parsed value.

## Schema errors vs schema warnings

`normalizeSchema` (called by `createCLI`) **throws** on schemas that cannot work:
duplicate flags in one command, a boolean positional, a required positional after an
optional one, an array positional that is not last, `applyDefault` without a
`default`, a flag without a leading dash. All problems are reported at once.

`npm run schema:check` additionally reports quality issues: missing descriptions,
examples that do not satisfy their own command, dangling `related` entries,
deprecations without a reason, and two commands that produce an identical invocation.
Warnings become errors with `strict: true` in `wrapper.config.ts`.
