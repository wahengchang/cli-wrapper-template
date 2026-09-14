import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLintReport, lintSchema } from '../../src/core/lint.ts';
import { normalizeSchema } from '../../src/core/schema.ts';
import { fooSchema } from '../fixtures/foo.ts';

const rulesFor = (schema: Parameters<typeof normalizeSchema>[0], strict = false): string[] =>
  lintSchema(normalizeSchema(schema), { strict }).issues.map((issue) => issue.rule);

test('the fixture schema is clean', () => {
  const report = lintSchema(normalizeSchema(fooSchema), { strict: true });
  assert.deepEqual(report.issues, []);
  assert.ok(report.ok);
});

test('missing descriptions are warnings by default and errors in strict mode', () => {
  const schema = { binary: 'x', commands: { a: { params: { b: { type: 'string' as const } } } } };
  const lenient = lintSchema(normalizeSchema(schema));
  assert.ok(lenient.ok);
  assert.equal(lenient.warnings.length, 2);

  const strict = lintSchema(normalizeSchema(schema), { strict: true });
  assert.ok(!strict.ok);
  assert.equal(strict.errors.length, 2);
});

test('examples are validated with the runtime validator', () => {
  const rules = rulesFor({
    binary: 'x',
    commands: {
      a: {
        description: 'A.',
        params: { name: { type: 'string', required: true, description: 'Name.' } },
        examples: [{ title: 'Missing the required parameter', params: {} }],
      },
    },
  });
  assert.ok(rules.includes('invalid-example'));
});

test('dangling related commands are errors', () => {
  const rules = rulesFor({
    binary: 'x',
    commands: { a: { description: 'A.', params: {}, related: ['does.not.exist'] } },
  });
  assert.ok(rules.includes('unknown-related-command'));
});

test('two commands producing the same invocation are flagged', () => {
  const rules = rulesFor({
    binary: 'x',
    commands: {
      a: { description: 'A.', command: 'same', params: {} },
      b: { description: 'B.', command: 'same', params: {} },
    },
  });
  assert.ok(rules.includes('duplicate-cli-mapping'));
});

test('shared command words with different parameters are allowed', () => {
  const rules = rulesFor({
    binary: 'x',
    commands: {
      get: { description: 'Get.', command: 'config', params: { key: { type: 'string', positional: true, description: 'Key.' } } },
      list: { description: 'List.', command: 'config', params: { list: { type: 'boolean', description: 'List.' } } },
    },
  });
  assert.ok(!rules.includes('duplicate-cli-mapping'));
});

test('deprecations without a reason are flagged', () => {
  const rules = rulesFor({ binary: 'x', commands: { a: { description: 'A.', deprecated: true, params: {} } } });
  assert.ok(rules.includes('deprecated-without-reason'));
});

test('rules can be ignored', () => {
  const report = lintSchema(normalizeSchema({ binary: 'x', commands: { a: { params: {} } } }), {
    ignore: ['missing-description'],
  });
  assert.deepEqual(report.issues, []);
});

test('reports render as readable text', () => {
  assert.match(formatLintReport(lintSchema(normalizeSchema(fooSchema))), /passed/);
  const report = lintSchema(normalizeSchema({ binary: 'x', commands: { a: { params: {} } } }));
  assert.match(formatLintReport(report), /warn\s+missing-description/);
});
