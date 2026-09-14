/**
 * Example wrapper: `git`.
 *
 * Creating a wrapper is schema + `createCLI`. Nothing else.
 */

import { createCLI } from '../../src/index.ts';
import type { ClientDefaults } from '../../src/index.ts';
import { gitSchema } from './schema.ts';

export type { GitConfig } from './schema.ts';
export { gitSchema } from './schema.ts';

/** Create a git client, optionally bound to a working directory. */
export function createGit(defaults: ClientDefaults = {}) {
  return createCLI({ schema: gitSchema, rootName: 'git', ...defaults });
}

/** A git client using the current working directory. */
export const git = createGit();
