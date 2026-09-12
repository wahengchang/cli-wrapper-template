import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchema } from '../../src/core/schema.ts';
import type { NormalizedCommand } from '../../src/core/schema.ts';
import { closest, validateParams } from '../../src/core/validate.ts';
import { CLIValidationError } from '../../src/core/errors.ts';
import { fooSchema } from '../fixtures/foo.ts';

const registry = normalizeSchema(fooSchema);
const command = (path: string): NormalizedCommand => registry.commands.get(path) as NormalizedCommand;

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
    assert.fail('expected a CLIValidationError');
  } catch (error) {
    assert.ok(error instanceof CLIValidationError);
    return error.issues;
  }
}

test('accepts a valid call and returns the resolved values', () => {
  const values = validateParams(command('project.create'), { name: 'demo', dryRun: true });
  assert.deepEqual(values, { name: 'demo', dryRun: true });
});

test('reports missing required parameters', () => {
  const issues = issuesOf(() => validateParams(command('project.create'), {}));
  assert.deepEqual(issues, ['missing required parameter "name"']);
});

test('validation errors point at the help system', () => {
  try {
    validateParams(command('deploy'), {});
    assert.fail('expected a CLIValidationError');
  } catch (error) {
    assert.ok(error instanceof CLIValidationError);
    assert.match(error.message, /See: cli\.help\('deploy'\)/);
    assert.equal(error.command, 'deploy');
  }
});

test('reports type mismatches per parameter', () => {
  const issues = issuesOf(() => validateParams(command('deploy'), { projectId: 1, path: './d', timeout: 'soon' }));
  assert.ok(issues.some((issue) => issue.includes('"projectId" must be a string')));
  assert.ok(issues.some((issue) => issue.includes('"timeout" must be a finite number')));
});

test('rejects NaN and Infinity', () => {
  const issues = issuesOf(() => validateParams(command('project.list'), { limit: Number.NaN }));
  assert.ok(issues.some((issue) => issue.includes('finite number')));
});

test('validates array element types', () => {
  const issues = issuesOf(() => validateParams(command('deploy'), { projectId: 'a', path: '.', tag: ['ok', 2] }));
  assert.ok(issues.some((issue) => issue.includes('"tag"[1] must be a string')));
});

test('enforces enum values', () => {
  const issues = issuesOf(() => validateParams(command('project.create'), { name: 'd', region: 'moon' }));
  assert.ok(issues.some((issue) => issue.includes('must be one of: us-west, eu-central')));
});

test('rejects unknown parameters and suggests a close match', () => {
  const issues = issuesOf(() => validateParams(command('project.create'), { name: 'd', dryrun: true }));
  assert.ok(issues.some((issue) => issue.includes('unknown parameter "dryrun"') && issue.includes('dryRun')));
});

test('applies declared defaults only when applyDefault is set', () => {
  assert.deepEqual(validateParams(command('project.list'), {}), { json: true });
  // region has a documented default but never sends it
  assert.deepEqual(validateParams(command('project.create'), { name: 'd' }), { name: 'd' });
});

test('an explicit value overrides an applied default', () => {
  assert.deepEqual(validateParams(command('project.list'), { json: false }), { json: false });
});

test('rejects positional values that look like flags', () => {
  const issues = issuesOf(() => validateParams(command('deploy'), { projectId: 'a', path: '--upload-pack=evil' }));
  assert.ok(issues.some((issue) => issue.includes('must not start with "-"')));
});

test('null and undefined are treated as omitted', () => {
  assert.deepEqual(validateParams(command('project.create'), { name: 'd', dryRun: undefined }), { name: 'd' });
});

test('closest only suggests near matches', () => {
  assert.equal(closest('creat', ['create', 'delete']), 'create');
  assert.equal(closest('zzzzzzzz', ['create', 'delete']), null);
});
