#!/usr/bin/env node
/**
 * Generate the API reference, or verify it is up to date.
 *
 *   node scripts/docs.ts           # write docs/generated
 *   node scripts/docs.ts --check   # fail if the generated docs are stale
 */

import { checkDocs, generateDocs } from '../src/docs/index.ts';
import { formatLintReport } from '../src/core/lint.ts';
import config from '../wrapper.config.ts';

const check = process.argv.includes('--check');
const options = {
  schema: config.schema,
  outDir: config.outDir,
  rootName: config.rootName,
  lint: { strict: config.strict },
};

if (check) {
  const result = await checkDocs(options);

  if (result.lint && result.lint.issues.length > 0) console.error(formatLintReport(result.lint));

  if (result.ok) {
    console.log(`Generated documentation in ${result.outDir} is up to date.`);
    process.exit(0);
  }

  console.error('Generated documentation is out of date.');
  for (const file of result.missing) console.error(`  missing  ${file}`);
  for (const file of result.stale) console.error(`  stale    ${file}`);
  for (const file of result.extra) console.error(`  extra    ${file}`);
  console.error('\nRun `npm run docs` and commit the result.');
  process.exit(1);
}

const result = await generateDocs(options);
if (result.lint && result.lint.issues.length > 0) console.error(formatLintReport(result.lint));
console.log(`Wrote ${result.written.length} file(s) to ${result.outDir}:`);
for (const file of result.written) console.log(`  ${file}`);
