// Validation function using Ajv
import { Ajv } from 'ajv';
import { fixtureSchema } from './fixture-schema.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(fixtureSchema as Record<string, unknown>);


export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateFixture(data: unknown): ValidationResult {
  const valid = validate(data) as boolean;
  if (valid) {
    return { valid: true };
  }

  const errors = (validate.errors ?? []).map((err) => {
    const path = err.instancePath.replace(/^\//, '').replace(/\//g, '.');
    const location = path ? `at ${path}` : 'at root';
    return `${location}: ${err.message ?? 'unknown error'}`;
  });

  return { valid: false, errors };
}
