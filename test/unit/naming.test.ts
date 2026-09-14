import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camelToKebab, defaultFlag, kebabToCamel } from '../../src/core/naming.ts';

test('camelToKebab follows the documented mapping', () => {
  assert.equal(camelToKebab('projectId'), 'project-id');
  assert.equal(camelToKebab('dryRun'), 'dry-run');
  assert.equal(camelToKebab('outputDir'), 'output-dir');
  assert.equal(camelToKebab('revParse'), 'rev-parse');
  assert.equal(camelToKebab('name'), 'name');
  assert.equal(camelToKebab('maxCount2'), 'max-count2');
  assert.equal(camelToKebab('parseHTMLFile'), 'parse-html-file');
});

test('the mapping is reversible for camelCase input', () => {
  for (const name of ['projectId', 'dryRun', 'outputDir', 'revParse', 'name']) {
    assert.equal(kebabToCamel(camelToKebab(name)), name);
  }
});

test('defaultFlag prefixes the kebab-case name', () => {
  assert.equal(defaultFlag('projectId'), '--project-id');
  assert.equal(defaultFlag('dryRun'), '--dry-run');
});
