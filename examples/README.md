# Examples

## `git`

A wrapper for a subset of `git`: [`schema.ts`](./git/schema.ts) and
[`index.ts`](./git/index.ts).

It is a real wrapper, not a toy — it is exercised by
[`test/unit/example-git.test.ts`](../test/unit/example-git.test.ts) (mapping) and
[`test/integration/git.test.ts`](../test/integration/git.test.ts) (the real binary),
and it is the source of the generated [API reference](../docs/generated/README.md).

```ts
import { createGit } from './examples/git/index.ts';

const git = createGit({ cwd: '/path/to/repo' });

await git.log({ maxCount: 3, format: '%s' });   // string[] in result.data
await git.revParse({ abbrevRef: true, refs: ['HEAD'] });
await git.remote.add({ name: 'origin', url: 'https://example.com/repo.git' });
```

It was chosen because git exercises the awkward parts of real CLIs, each of which is
handled in the schema rather than in code:

| git behaviour | Schema feature |
|---|---|
| `rev-parse` from a JS `revParse` key | automatic kebab-case command words |
| `git config <key> <value>` has no `set` subcommand | `command: []` — a JS group deeper than the CLI |
| `--format=%s` works, `--format %s` does not | `assign: true` |
| `git status -- <paths>` | `positionalSeparator: '--'` |
| `git commit --no-verify` | `falseFlag` |
| `git remote` both lists remotes and has subcommands | `invokable: true` |
| `--untracked-files=<no\|normal\|all>` | `values` + `assign` |
| `git config --list` output | a custom `output.parse` returning a typed object |

Delete this directory when you start your own wrapper — or keep it around as a
reference while you write your schema.

## The fictional `foo` CLI

[`test/fixtures/foo.ts`](../test/fixtures/foo.ts) is the tool used in the design
documents. It exercises every schema feature without needing a binary, and the core
tests are written against it.
