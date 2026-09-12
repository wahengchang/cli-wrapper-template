/**
 * Documentation system: schema -> help model -> Markdown / JSON -> files.
 */

export { checkDocs, generateDocs, renderDocs, GENERATED_BANNER } from './generator.ts';
export type { DocsCheckResult, DocsResult, GeneratedFiles, GenerateDocsOptions } from './generator.ts';
export { formatLintReport, lintSchema } from '../core/lint.ts';
export type { LintIssue, LintOptions, LintReport } from '../core/lint.ts';
