# Getting started

How to turn this template into a wrapper for your own CLI.

## 1. Clone and verify

```bash
git clone <this repo> my-cli-wrapper && cd my-cli-wrapper
npm install
npm run verify
```

`verify` runs lint, typecheck, the schema check, the documentation check and the
tests. A green run means the template is working before you change anything.

## 2. Rename the package

Edit `package.json`: `name`, `description`, `version`, `repository`.

## 3. Describe your CLI

Create `src/schemas/<tool>.ts` (or copy `examples/git/schema.ts`) and describe the
commands you need. Start with two or three — you do not have to model the whole CLI
before the wrapper is useful.

```ts
import { defineSchema } from '../index.ts';

export const toolSchema = defineSchema({
  binary: 'tool',
  description: 'What the tool does.',
  commands: {
    deploy: {
      description: 'Deploy a project.',
      params: {
        projectId: { type: 'string', required: true, description: 'Project id.' },
        dryRun: { type: 'boolean', description: 'Validate only.' },
        path: { type: 'string', positional: true, required: true, description: 'Directory.' },
      },
      examples: [{ title: 'Dry run', params: { projectId: 'abc', dryRun: true, path: './dist' } }],
    },
  },
});
```

Rules of thumb:

- Mirror the CLI's own hierarchy and names. `--project-id` becomes `projectId`
  automatically; only use `flag` when the CLI does something unusual.
- Do not invent parameters the CLI does not have, and do not rename concepts.
- Write a `description` for every command and parameter — the schema check enforces
  this in strict mode, and it is what makes help and docs useful.

`defineSchema` is an identity function whose only job is preserving literal types.
Skipping it costs you the precise parameter types.

## 4. Create the client

```ts
import { createCLI } from '../index.ts';
import type { ClientDefaults } from '../index.ts';
import { toolSchema } from './schemas/tool.ts';

export function createTool(defaults: ClientDefaults = {}) {
  return createCLI({ schema: toolSchema, rootName: 'tool', ...defaults });
}
```

Exposing a factory rather than a singleton lets callers bind a working directory,
environment or timeout per instance.

## 5. Point the tooling at your schema

Edit `wrapper.config.ts`:

```ts
const config: WrapperConfig = {
  schema: toolSchema,
  rootName: 'tool',
  outDir: 'docs/generated',
  strict: true,
};
```

Then:

```bash
npm run schema:check
npm run docs
```

## 6. Check the argv before running anything

The fastest feedback loop is `toCommandLine`, which never starts a process:

```ts
tool.deploy.toCommandLine({ projectId: 'abc', dryRun: true, path: './dist' });
// tool deploy --project-id abc --dry-run ./dist
```

If that line is not what you would type in a terminal, the schema is wrong. Common
fixes: `assign: true` for CLIs that require `--flag=value`, `command: []` when the JS
hierarchy is deeper than the CLI's, `delimiter` for comma-separated lists.

## 7. Test the mapping

```ts
test('deploy maps to the expected argv', () => {
  assert.deepEqual(tool.deploy.toArgv({ projectId: 'abc', path: './dist' }), [
    'deploy',
    '--project-id',
    'abc',
    './dist',
  ]);
});
```

Add integration tests under `test/integration/` for the handful of commands where
running the real binary tells you something a mapping test cannot.

## 8. Ship

```bash
npm run verify
npm run build
npm publish   # if you are publishing
```

CI runs the same checks, including `docs:check`, so a schema change without
regenerated documentation fails the build.

## Where to put things

| You are adding | It goes in |
|---|---|
| a command or parameter | your schema |
| an example | the command's `examples` |
| a prose guide | `docs/guides/` |
| a new output format for help or docs | `src/help/renderers/` |
| anything that changes how *every* CLI behaves | `src/core/` — and consider whether it belongs in the schema instead |

If you find yourself editing `src/core/` to support one CLI's quirk, that quirk
probably belongs in the schema. Open an issue if it genuinely does not.
