type JsonSchema = Record<string, unknown>;

const commonEventProperties: Record<string, JsonSchema> = {
  at: { type: 'number', minimum: 0 },
  name: { type: 'string', nullable: true },
};

function eventVariant(
  type: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema {
  return {
    type: 'object',
    properties: {
      ...commonEventProperties,
      type: { const: type },
      ...properties,
    },
    required: ['at', 'type', ...required],
    additionalProperties: false,
  };
}

export const fixtureEventSchema: JsonSchema = {
  oneOf: [
    eventVariant('session_start', { sessionDir: { type: 'string' } }),
    eventVariant('subagent_started', {
      agentId: { type: 'string', minLength: 1 },
      agentName: { type: 'string', minLength: 1 },
      model: { type: 'string' },
    }, ['agentId', 'agentName']),
    eventVariant('activity', { agentId: { type: 'string' }, content: { type: 'string' } }),
    eventVariant('waiting', { agentId: { type: 'string' }, reason: { type: 'string' } }),
    eventVariant('done', { agentId: { type: 'string' }, content: { type: 'string' } }),
    eventVariant('failed', { agentId: { type: 'string' }, error: { type: 'string' } }),
    eventVariant('workflow_updated', { workflowId: { type: 'string' }, status: { type: 'string' } }),
    eventVariant('artifact_created', {
      artifactId: { type: 'string', minLength: 1 },
      artifactPath: { type: 'string', minLength: 1 },
    }, ['artifactId', 'artifactPath']),
    eventVariant('artifact_updated', { artifactId: { type: 'string', minLength: 1 } }, ['artifactId']),
    eventVariant('state_written', { key: { type: 'string', minLength: 1 }, value: {} }, ['key', 'value']),
    eventVariant('poll'),
    eventVariant('reload', {
      preserve: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
    }, ['preserve']),
    eventVariant('resize', {
      cols: { type: 'integer', minimum: 1, maximum: 300 },
      rows: { type: 'integer', minimum: 1, maximum: 100 },
    }, ['cols', 'rows']),
    eventVariant('theme_changed', { theme: { type: 'string', minLength: 1 } }, ['theme']),
    eventVariant('key', {
      key: { type: 'string', minLength: 1 },
      ctrl: { type: 'boolean' },
      meta: { type: 'boolean' },
      shift: { type: 'boolean' },
    }, ['key']),
    eventVariant('checkpoint', { name: { type: 'string', minLength: 1 } }, ['name']),
  ],
};

export const fixtureSchema: JsonSchema = {
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
      additionalProperties: false,
    },
    theme: { type: 'string', minLength: 1 },
    pollIntervalMs: { type: 'integer', minimum: 100 },
    timeline: { type: 'array', items: fixtureEventSchema },
    imports: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          source: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['session', 'events', 'state', 'artifacts'], nullable: true },
        },
        required: ['source'],
        additionalProperties: false,
      },
    },
  },
  required: ['version', 'name', 'viewport', 'theme', 'pollIntervalMs', 'timeline'],
  additionalProperties: false,
};
