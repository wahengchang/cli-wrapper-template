import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocs, generateDocs, renderDocs, GENERATED_BANNER } from '../../src/docs/index.ts';
import { fooSchema } from '../fixtures/foo.ts';

const options = { schema: fooSchema, rootName: 'foo' };

test('renders an index, one file per top-level node, and machine-readable metadata', () => {
  const { files } = renderDocs(options);
  assert.deepEqual(
    [...files.keys()].sort(),
    ['README.md', 'api.json', 'commands/auth.md', 'commands/deploy.md', 'commands/project.md'],
  );
});

test('every generated file carries the do-not-edit banner', () => {
  const { files } = renderDocs(options);
  for (const [name, content] of files) {
    if (name.endsWith('.md')) assert.ok(content.startsWith(GENERATED_BANNER), `${name} is missing the banner`);
  }
});

test('generated docs document the hierarchy, flags, types and defaults', () => {
  const { files } = renderDocs(options);
  const index = files.get('README.md') as string;
  assert.match(index, /```text\nfoo\n/);
  assert.match(index, /├── create/);
  assert.match(index, /\[`project`\]\(\.\/commands\/project\.md\)/);

  const project = files.get('commands/project.md') as string;
  assert.match(project, /## project\.create/);
  assert.match(project, /\| `name` \| `--name` \| `string` \| Yes \| - \| Project name\. \|/);
  assert.match(project, /\| `region` \|.*`"us-west"`/);
});

test('generated docs show JS and CLI side by side', () => {
  const { files } = renderDocs(options);
  const deploy = files.get('commands/deploy.md') as string;
  assert.match(deploy, /```ts\nfoo\.deploy\(/);
  assert.match(deploy, /```bash\nfoo deploy --project-id/);
  assert.match(deploy, /await foo\.deploy\(\{\n {2}projectId: 'abc',/);
});

test('api.json exposes the same structured model as the help system', () => {
  const { files } = renderDocs(options);
  const api = JSON.parse(files.get('api.json') as string) as {
    binary: string;
    commands: { path: string; params: { name: string }[] }[];
  };
  assert.equal(api.binary, 'foo');
  const create = api.commands.find((command) => command.path === 'project.create');
  assert.deepEqual(create?.params.map((param) => param.name), ['name', 'region', 'dryRun']);
});

test('rendering is deterministic', () => {
  const first = renderDocs(options).files;
  const second = renderDocs(options).files;
  assert.deepEqual([...first.entries()], [...second.entries()]);
});

test('generation refuses to run on a schema with errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'docs-'));
  try {
    await assert.rejects(
      () =>
        generateDocs({
          schema: { binary: 'x', commands: { a: { description: 'A.', params: {}, related: ['nope'] } } },
          outDir: dir,
        }),
      /schema has errors/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generate writes files and check reports them as up to date', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'docs-'));
  try {
    const result = await generateDocs({ ...options, outDir: dir });
    assert.equal(result.written.length, 5);
    assert.ok((await readFile(join(dir, 'README.md'), 'utf8')).startsWith(GENERATED_BANNER));

    const check = await checkDocs({ ...options, outDir: dir });
    assert.ok(check.ok);
    assert.deepEqual([check.stale, check.missing, check.extra], [[], [], []]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check detects edited, missing and orphaned files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'docs-'));
  try {
    await generateDocs({ ...options, outDir: dir });
    await writeFile(join(dir, 'README.md'), 'hand edited\n', 'utf8');
    await rm(join(dir, 'commands/deploy.md'));
    await writeFile(join(dir, 'commands/orphan.md'), 'left over\n', 'utf8');

    const check = await checkDocs({ ...options, outDir: dir });
    assert.ok(!check.ok);
    assert.deepEqual(check.stale, ['README.md']);
    assert.deepEqual(check.missing, ['commands/deploy.md']);
    assert.deepEqual(check.extra, ['commands/orphan.md']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('check reports a missing output directory as missing files', async () => {
  const check = await checkDocs({ ...options, outDir: join(tmpdir(), 'docs-does-not-exist-xyz') });
  assert.ok(!check.ok);
  assert.equal(check.missing.length, 5);
});
