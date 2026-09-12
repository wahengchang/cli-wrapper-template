/**
 * JSON renderer for the help model.
 *
 * The help model is already plain data; this renderer exists so that every
 * output format is reached the same way.
 */

import type { HelpModel } from '../model.ts';

/** Serialize a help model as JSON. */
export function renderJson(model: HelpModel, indent = 2): string {
  return JSON.stringify(model, null, indent);
}
