/**
 * Type-level tests.
 *
 * These are checked by `npm run typecheck`, not by the test runner: every
 * `@ts-expect-error` below must stay an error, or the typed API has regressed.
 */

import { createCLI, defineSchema } from '../../src/index.ts';
import type { CLIResult } from '../../src/index.ts';

const schema = defineSchema({
  binary: 'foo',
  commands: {
    auth: { description: 'Auth.', commands: { logout: { description: 'Log out.', params: {} } } },
    project: {
      description: 'Projects.',
      commands: {
        create: {
          description: 'Create.',
          params: {
            name: { type: 'string', required: true, description: 'Name.' },
            region: { type: 'string', values: ['us-west', 'eu-central'], description: 'Region.' },
            dryRun: { type: 'boolean', description: 'Dry run.' },
            retries: { type: 'number', description: 'Retries.' },
            tags: { type: 'string[]', description: 'Tags.' },
          },
        },
        list: {
          description: 'List.',
          params: {},
          output: { parse: (stdout: string): { id: string }[] => JSON.parse(stdout) as { id: string }[] },
        },
        count: { description: 'Count.', params: {}, output: { parse: 'lines' } },
      },
    },
  },
});

const cli = createCLI({ schema });

async function accepted(): Promise<void> {
  await cli.project.create({ name: 'demo' });
  await cli.project.create({ name: 'demo', region: 'us-west', dryRun: true, retries: 2, tags: ['a'] });
  await cli.auth.logout();
  await cli.auth.logout({}, { cwd: '/tmp' });

  // Structured output is typed from the parser.
  const list: CLIResult<{ id: string }[]> = await cli.project.list();
  const first: string | undefined = list.data[0]?.id;
  void first;

  const lines: string[] = (await cli.project.count()).data;
  void lines;

  // Commands without a parser expose `data: undefined`.
  const plain: undefined = (await cli.auth.logout()).data;
  void plain;

  // Introspection is attached to every command.
  const argv: string[] = cli.project.create.toArgv({ name: 'demo' });
  const help: string = cli.project.create.help();
  const path: string = cli.project.create.path;
  void argv;
  void help;
  void path;

  // The meta API is reachable both ways.
  void cli.$.commands();
  void cli.commands();
}

async function rejected(): Promise<void> {
  // @ts-expect-error a required parameter cannot be omitted
  await cli.project.create({});

  // @ts-expect-error the parameter object itself is required here
  await cli.project.create();

  // @ts-expect-error wrong scalar type
  await cli.project.create({ name: 42 });

  // @ts-expect-error value outside the declared enum
  await cli.project.create({ name: 'demo', region: 'moon' });

  // @ts-expect-error unknown parameter
  await cli.project.create({ name: 'demo', nope: true });

  // @ts-expect-error wrong array element type
  await cli.project.create({ name: 'demo', tags: [1] });

  // @ts-expect-error a group is not callable
  await cli.project();

  // @ts-expect-error unknown command
  await cli.project.destroy({});

  // @ts-expect-error data is undefined when no parser is declared
  const data: string = (await cli.auth.logout()).data;
  void data;
}

void accepted;
void rejected;
