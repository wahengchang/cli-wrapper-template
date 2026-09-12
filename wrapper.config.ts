/**
 * Project configuration for the tooling scripts.
 *
 * This is the one file to repoint when you wrap a different CLI: the docs
 * generator and the schema checker read the schema from here.
 */

import { gitSchema } from './examples/git/schema.ts';
import type { CLISchema } from './src/index.ts';

export interface WrapperConfig {
  /** The schema documentation and checks are generated from. */
  schema: CLISchema;
  /** Root object name used in generated JS examples. */
  rootName: string;
  /** Where generated documentation is written. */
  outDir: string;
  /** Fail the schema check on warnings as well as errors. */
  strict: boolean;
}

const config: WrapperConfig = {
  schema: gitSchema,
  rootName: 'git',
  outDir: 'docs/generated',
  strict: true,
};

export default config;
