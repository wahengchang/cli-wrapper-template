/**
 * Example schema: a subset of `git`.
 *
 * This is the CLI-specific half of a wrapper — the only half you write for a
 * new tool. It contains no infrastructure: no argv assembly, no spawning, no
 * help or documentation logic.
 */

import { defineSchema } from '../../src/index.ts';

/** One `key=value` line of `git config --list`. */
export type GitConfig = Record<string, string>;

function parseConfigList(stdout: string): GitConfig {
  const config: GitConfig = {};
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    config[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return config;
}

export const gitSchema = defineSchema({
  binary: 'git',
  description: 'Distributed version control system.',
  // `--no-pager` keeps output non-interactive for every command.
  globalArgs: ['--no-pager'],

  commands: {
    version: {
      command: 'version',
      description: 'Print the git version.',
      output: {
        parse: (stdout: string): string => stdout.trim(),
        type: 'string',
        description: 'The raw version line, trimmed.',
      },
      examples: [{ title: 'Read the installed version' }],
    },

    init: {
      description: 'Create an empty git repository.',
      params: {
        bare: { type: 'boolean', description: 'Create a bare repository.' },
        quiet: { type: 'boolean', description: 'Suppress informational output.' },
        initialBranch: {
          type: 'string',
          flag: '--initial-branch',
          description: 'Name of the initial branch.',
        },
        directory: { type: 'string', positional: true, description: 'Directory to initialise.' },
      },
      examples: [{ title: 'Initialise a repository in ./tmp', params: { directory: './tmp' } }],
    },

    status: {
      description: 'Show the working tree status.',
      params: {
        porcelain: { type: 'boolean', description: 'Machine-readable output.' },
        branch: { type: 'boolean', description: 'Include branch information.' },
        untrackedFiles: {
          type: 'string',
          flag: '--untracked-files',
          assign: true,
          values: ['no', 'normal', 'all'],
          default: 'normal',
          description: 'How to report untracked files.',
        },
        paths: { type: 'string[]', positional: true, description: 'Limit the report to these paths.' },
      },
      positionalSeparator: '--',
      output: { parse: 'lines', type: 'string[]', description: 'One entry per output line.' },
      examples: [
        { title: 'Machine-readable status', params: { porcelain: true } },
        { title: 'Status of one directory', params: { porcelain: true, paths: ['src'] } },
      ],
      related: ['add', 'commit'],
    },

    add: {
      description: 'Add file contents to the index.',
      params: {
        all: { type: 'boolean', description: 'Stage every change, including deletions.' },
        dryRun: { type: 'boolean', description: 'Report what would be staged without staging it.' },
        paths: { type: 'string[]', positional: true, required: true, description: 'Paths to stage.' },
      },
      examples: [{ title: 'Stage two files', params: { paths: ['README.md', 'src/index.ts'] } }],
      related: ['commit', 'status'],
    },

    commit: {
      description: 'Record staged changes to the repository.',
      params: {
        message: { type: 'string', required: true, description: 'Commit message.' },
        amend: { type: 'boolean', description: 'Replace the previous commit.' },
        allowEmpty: { type: 'boolean', description: 'Permit a commit with no staged changes.' },
        author: { type: 'string', description: 'Override the commit author, as "Name <email>".' },
        verify: {
          type: 'boolean',
          // `verify: false` emits `--no-verify`; `true` emits nothing, matching git's default.
          flag: '--verify',
          falseFlag: '--no-verify',
          default: true,
          description: 'Run pre-commit and commit-msg hooks.',
        },
      },
      examples: [
        { title: 'Commit staged changes', params: { message: 'Add wrapper template' } },
        { title: 'Commit without hooks', params: { message: 'wip', verify: false } },
      ],
      related: ['add', 'status'],
    },

    log: {
      description: 'Show commit history.',
      params: {
        maxCount: { type: 'number', description: 'Limit the number of commits.' },
        // git only accepts `--format=<fmt>`; the separate-word form is read as a revision.
        format: { type: 'string', assign: true, description: 'Pretty-print format, for example "%H %s".' },
        author: { type: 'string', description: 'Only commits by this author.' },
        since: { type: 'string', description: 'Only commits newer than this date.' },
        revisionRange: {
          type: 'string',
          positional: true,
          description: 'Revision or range, for example "main..HEAD".',
        },
      },
      output: { parse: 'lines', type: 'string[]', description: 'One entry per output line.' },
      examples: [{ title: 'Last three subjects', params: { maxCount: 3, format: '%s' } }],
    },

    revParse: {
      // JS `revParse` maps to the CLI word `rev-parse` automatically.
      description: 'Resolve revisions and repository metadata.',
      params: {
        abbrevRef: { type: 'boolean', description: 'Print the short symbolic name of a ref.' },
        showToplevel: { type: 'boolean', description: 'Print the root directory of the working tree.' },
        refs: { type: 'string[]', positional: true, description: 'Revisions to resolve.' },
      },
      output: {
        parse: (stdout: string): string => stdout.trim(),
        type: 'string',
        description: 'Resolved value, trimmed.',
      },
      examples: [{ title: 'Current branch name', params: { abbrevRef: true, refs: ['HEAD'] } }],
    },

    remote: {
      description: 'Manage the set of tracked repositories.',
      // `git remote` on its own lists remotes, so the group is callable too.
      invokable: true,
      output: { parse: 'lines', type: 'string[]', description: 'Configured remote names.' },
      commands: {
        add: {
          description: 'Add a remote.',
          params: {
            fetch: { type: 'boolean', description: 'Fetch the remote immediately.' },
            name: { type: 'string', positional: true, required: true, description: 'Remote name.' },
            url: { type: 'string', positional: true, required: true, description: 'Remote URL.' },
          },
          examples: [
            { title: 'Add an origin remote', params: { name: 'origin', url: 'https://example.com/repo.git' } },
          ],
        },
        remove: {
          description: 'Remove a remote.',
          params: {
            name: { type: 'string', positional: true, required: true, description: 'Remote name.' },
          },
        },
        getUrl: {
          description: 'Print the URL of a remote.',
          params: {
            name: { type: 'string', positional: true, required: true, description: 'Remote name.' },
          },
          output: { parse: (stdout: string): string => stdout.trim(), type: 'string' },
        },
      },
    },

    config: {
      description: 'Read and write repository configuration.',
      commands: {
        // `git config <key>` takes no subcommand word, so the JS hierarchy is
        // richer than the CLI's: `command: []` adds no word to the argv.
        get: {
          command: [],
          description: 'Read one configuration value.',
          params: {
            key: { type: 'string', positional: true, required: true, description: 'Configuration key.' },
          },
          output: { parse: (stdout: string): string => stdout.trim(), type: 'string' },
          examples: [{ title: 'Read the configured user name', params: { key: 'user.name' } }],
        },
        set: {
          command: [],
          description: 'Write one configuration value.',
          params: {
            key: { type: 'string', positional: true, required: true, description: 'Configuration key.' },
            value: { type: 'string', positional: true, required: true, description: 'Value to store.' },
          },
        },
        list: {
          command: [],
          description: 'List every configuration value.',
          params: {
            list: { type: 'boolean', applyDefault: true, default: true, description: 'Required by git to list values.' },
          },
          output: {
            parse: parseConfigList,
            type: 'GitConfig',
            description: 'Configuration entries keyed by dotted name.',
          },
          examples: [{ title: 'Read all configuration' }],
        },
      },
    },
  },
});
