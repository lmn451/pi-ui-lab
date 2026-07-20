// Validation function using Ajv
import { Ajv, type ErrorObject } from 'ajv';
import { fixtureEventSchema, fixtureSchema } from './fixture-schema.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(fixtureSchema as Record<string, unknown>);
const validateEvent = ajv.compile(fixtureEventSchema as Record<string, unknown>);


export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateFixture(data: unknown): ValidationResult {
  const valid = validate(data) as boolean;
  if (valid) {
    return { valid: true };
  }

  const errors = formatErrors(validate.errors);

  return { valid: false, errors };
}

export function validateFixtureEvent(data: unknown): ValidationResult {
  if (validateEvent(data)) return { valid: true };
  return { valid: false, errors: formatErrors(validateEvent.errors) };
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath.replace(/^\//, '').replace(/\//g, '.');
    const location = path ? `at ${path}` : 'at root';
    return `${location}: ${error.message ?? 'unknown error'}`;
  });
}
