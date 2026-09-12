import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchema } from '../../src/core/schema.ts';
import { CLISchemaError } from '../../src/core/errors.ts';
import { defineSchema } from '../../src/core/define.ts';
import { fooSchema } from '../fixtures/foo.ts';

test('registers every invokable command by JS path', () => {
  const registry = normalizeSchema(fooSchema);
  assert.deepEqual(registry.paths, [
    'auth.login',
    'auth.logout',
    'deploy',
    'project.create',
    'project.delete',
    'project.list',
  ]);
  assert.deepEqual([...registry.groups.keys()].sort(), ['auth', 'project']);
});

test('derives CLI words from JS keys and honours overrides', () => {
  const registry = normalizeSchema(
    defineSchema({
      binary: 'x',
      commands: {
        revParse: { params: {} },
        listAll: { command: 'ls', params: {} },
        nested: { command: ['a', 'b'], params: {} },
        passthrough: { command: [], params: {} },
      },
    }),
  );

  assert.deepEqual(registry.commands.get('revParse')?.argv, ['rev-parse']);
  assert.deepEqual(registry.commands.get('listAll')?.argv, ['ls']);
  assert.deepEqual(registry.commands.get('nested')?.argv, ['a', 'b']);
  assert.deepEqual(registry.commands.get('passthrough')?.argv, []);
});

test('an invokable group is both a group and a command', () => {
  const registry = normalizeSchema(
    defineSchema({
      binary: 'x',
      commands: { remote: { invokable: true, commands: { add: { params: {} } } } },
    }),
  );

  assert.ok(registry.groups.has('remote'));
  assert.ok(registry.commands.has('remote'));
  assert.deepEqual(registry.commands.get('remote.add')?.argv, ['remote', 'add']);
});

test('positionals keep declaration order and flags are separated', () => {
  const registry = normalizeSchema(fooSchema);
  const deploy = registry.commands.get('deploy');
  assert.deepEqual(deploy?.positionals.map((param) => param.name), ['path']);
  assert.equal(deploy?.positionals[0]?.positionalIndex, 0);
  assert.ok(deploy?.flags.every((param) => param.flag !== null));
});

function expectSchemaError(schema: Parameters<typeof normalizeSchema>[0], fragment: string): void {
  assert.throws(
    () => normalizeSchema(schema),
    (error: unknown) => {
      assert.ok(error instanceof CLISchemaError);
      assert.ok(
        error.issues.some((issue) => issue.includes(fragment)),
        `expected an issue containing "${fragment}", got:\n${error.issues.join('\n')}`,
      );
      return true;
    },
  );
}

test('rejects duplicate flags within a command', () => {
  expectSchemaError(
    { binary: 'x', commands: { a: { params: { one: { type: 'string', flag: '--v' }, two: { type: 'string', flag: '--v' } } } } },
    'already used by',
  );
});

test('rejects a required positional after an optional one', () => {
  expectSchemaError(
    {
      binary: 'x',
      commands: { a: { params: { first: { type: 'string', positional: true }, second: { type: 'string', positional: true, required: true } } } },
    },
    'required positional cannot follow optional positional',
  );
});

test('rejects a boolean positional and a positional with a flag', () => {
  expectSchemaError({ binary: 'x', commands: { a: { params: { b: { type: 'boolean', positional: true } } } } }, 'cannot be positional');
  expectSchemaError(
    { binary: 'x', commands: { a: { params: { b: { type: 'string', positional: true, flag: '--b' } } } } },
    'cannot also declare a flag',
  );
});

test('rejects an array positional that is not last', () => {
  expectSchemaError(
    {
      binary: 'x',
      commands: { a: { params: { list: { type: 'string[]', positional: true }, tail: { type: 'string', positional: true } } } },
    },
    'only the last positional',
  );
});

test('rejects unusable metadata combinations', () => {
  expectSchemaError({ binary: 'x', commands: { a: { params: { b: { type: 'string', applyDefault: true } } } } }, 'requires a "default"');
  expectSchemaError(
    { binary: 'x', commands: { a: { params: { b: { type: 'number', values: ['1'] } } } } },
    'only supported for string parameters',
  );
  expectSchemaError({ binary: 'x', commands: { a: { params: { b: { type: 'string', flag: 'nodash' } } } } }, 'must start with "-"');
  expectSchemaError({ binary: '', commands: { a: { params: {} } } }, 'binary must be a non-empty string');
});

test('reports every issue at once', () => {
  try {
    normalizeSchema({
      binary: 'x',
      commands: { a: { params: { b: { type: 'string', flag: 'nodash' }, c: { type: 'number', values: ['1'] } } } },
    });
    assert.fail('expected a CLISchemaError');
  } catch (error) {
    assert.ok(error instanceof CLISchemaError);
    assert.equal(error.issues.length, 2);
  }
});
