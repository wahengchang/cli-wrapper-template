/**
 * Deterministic, reversible naming between JS identifiers and CLI words.
 *
 *   projectId -> --project-id
 *   dryRun    -> --dry-run
 *   revParse  -> rev-parse
 *
 * The mapping is mechanical so it stays predictable; any schema entry can
 * override it explicitly with `flag` or `command`.
 */

/** `projectId` -> `project-id`. */
export function camelToKebab(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/** `project-id` -> `projectId`. The inverse of {@link camelToKebab}. */
export function kebabToCamel(name: string): string {
  return name.replace(/[-_](\w)/g, (_, char: string) => char.toUpperCase());
}

/** Default CLI flag for a JS parameter name: `dryRun` -> `--dry-run`. */
export function defaultFlag(paramName: string): string {
  return `--${camelToKebab(paramName)}`;
}

/** Default CLI word for a JS command key: `revParse` -> `rev-parse`. */
export function defaultCommandWord(key: string): string {
  return camelToKebab(key);
}
