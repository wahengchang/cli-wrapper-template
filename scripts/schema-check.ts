#!/usr/bin/env node
/**
 * Validate the CLI schema: structural errors plus documentation completeness.
 */

import { formatLintReport, lintSchema } from '../src/core/lint.ts';
import { normalizeSchema } from '../src/index.ts';
import config from '../wrapper.config.ts';

const registry = normalizeSchema(config.schema);
const report = lintSchema(registry, { strict: config.strict });

console.log(formatLintReport(report));
console.log(`\n${registry.commands.size} command(s), ${registry.groups.size} group(s) in "${registry.binary}".`);

if (!report.ok) process.exit(1);
