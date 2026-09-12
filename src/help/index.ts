/**
 * Help system: schema -> help model -> renderer.
 *
 * The help layer reads the registry produced by the core layer and never
 * modifies it.
 */

export type {
  CommandHelp,
  ExampleHelp,
  GroupHelp,
  HelpEntry,
  HelpModel,
  ParamHelp,
  RootHelp,
} from './model.ts';
export { buildCommandHelp, buildGroupHelp, buildRootHelp, formatJsCall, formatJsValue } from './model.ts';
export { normalizePath, resolveHelp, resolveHelpOrParam, resolveParamHelp } from './resolver.ts';
export { searchCommands } from './search.ts';
export type { SearchOptions, SearchResult } from './search.ts';
export { renderText, renderParamText } from './renderers/text.ts';
export {
  renderCommandMarkdown,
  renderCommandTree,
  renderGroupMarkdown,
  renderMarkdown,
  renderParamTable,
  renderRootMarkdown,
} from './renderers/markdown.ts';
export { renderJson } from './renderers/json.ts';

/** Supported help output formats. */
export type HelpFormat = 'text' | 'markdown' | 'json';
