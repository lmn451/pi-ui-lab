// JSON Schema for fixture validation
import type { Fixture } from '../types.js';

export const fixtureSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    $schema: { type: 'string', nullable: true },
    version: { type: 'integer', const: 1 },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    viewport: {
      type: 'object',
      properties: {
        cols: { type: 'integer', minimum: 20, maximum: 300 },
        rows: { type: 'integer', minimum: 5, maximum: 100 },
      },
      required: ['cols', 'rows'],
    },
    theme: { type: 'string' },
    pollIntervalMs: { type: 'integer', minimum: 100 },
    timeline: {
      type: 'array',
      items: fixtureEventSchema(),
    },
    imports: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          type: {
            type: 'string',
            enum: ['session', 'events', 'state', 'artifacts'],
            nullable: true,
          },
        },
        required: ['source'],
      },
    },
  },
  required: ['version', 'name', 'viewport', 'theme', 'pollIntervalMs', 'timeline'],
};

function fixtureEventSchema() {
  return {
    type: 'object',
    properties: {
      at: { type: 'number', minimum: 0 },
      type: {
        type: 'string',
        enum: [
          'session_start',
          'subagent_started',
          'activity',
          'waiting',
          'done',
          'failed',
          'workflow_updated',
          'artifact_created',
          'artifact_updated',
          'state_written',
          'poll',
          'reload',
          'resize',
          'theme_changed',
          'key',
          'checkpoint',
        ],
      },
      name: { type: 'string', nullable: true },
    },
    required: ['at', 'type'],
    additionalProperties: true,
  } as const;
}
