/**
 * Fixture schema: the fictional `foo` CLI used throughout the guidelines.
 *
 * It exercises every schema feature, so core tests never need a real binary.
 */

import { defineSchema } from '../../src/index.ts';

export const fooSchema = defineSchema({
  binary: 'foo',
  description: 'Fictional deployment tool.',

  commands: {
    auth: {
      description: 'Authentication commands.',
      commands: {
        login: {
          description: 'Log in.',
          params: {
            token: { type: 'string', required: true, description: 'API token.' },
            scope: { type: 'string[]', description: 'Requested scopes.' },
          },
        },
        logout: { description: 'Log out.' },
      },
    },

    project: {
      description: 'Project management.',
      commands: {
        create: {
          description: 'Create a new project.',
          params: {
            name: { type: 'string', required: true, description: 'Project name.' },
            region: {
              type: 'string',
              values: ['us-west', 'eu-central'],
              default: 'us-west',
              description: 'Deployment region.',
            },
            dryRun: { type: 'boolean', description: 'Validate without creating the project.' },
          },
          examples: [
            { title: 'Basic project', params: { name: 'demo' } },
            { title: 'Dry run', params: { name: 'demo', dryRun: true } },
          ],
          related: ['project.list'],
        },
        delete: {
          description: 'Delete a project.',
          params: {
            projectId: { type: 'string', required: true, positional: true, description: 'Project id.' },
            force: { type: 'boolean', description: 'Skip confirmation.' },
          },
        },
        list: {
          description: 'List projects.',
          params: {
            json: { type: 'boolean', applyDefault: true, default: true, description: 'Machine-readable output.' },
            limit: { type: 'number', description: 'Maximum number of projects.' },
          },
          output: { parse: 'json', type: 'Project[]', description: 'Projects owned by the account.' },
        },
      },
    },

    deploy: {
      description: 'Deploy a project.',
      params: {
        projectId: { type: 'string', required: true, description: 'Project id.' },
        dryRun: { type: 'boolean', description: 'Validate without deploying.' },
        timeout: { type: 'number', description: 'Deploy timeout in seconds.' },
        tag: { type: 'string[]', description: 'Tags to attach.' },
        exclude: { type: 'string[]', delimiter: ',', description: 'Comma-separated exclusions.' },
        cache: { type: 'boolean', falseFlag: '--no-cache', default: true, description: 'Use the build cache.' },
        mode: { type: 'string', assign: true, values: ['fast', 'safe'], description: 'Deploy strategy.' },
        path: { type: 'string', positional: true, required: true, description: 'Directory to deploy.' },
      },
      examples: [{ title: 'Dry run deploy', params: { projectId: 'abc', dryRun: true, path: './dist' } }],
    },
  },
});
