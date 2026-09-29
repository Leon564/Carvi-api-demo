import type { Metadata, MetadataValue } from '../api/types';

export interface MetadataRow {
  key: string;
  value: string;
}

export const METADATA_MAX_KEYS = 50;
export const METADATA_MAX_VALUE_LENGTH = 500;
export const METADATA_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

export interface MetadataResult {
  /** Only present when there is at least one row and no row has an error. */
  metadata?: Metadata;
  /** Error message per row, keyed by the index of the row in the input. */
  errors: Record<number, string>;
}

/** Typed value for a form cell: `true`/`false` become booleans, plain decimals become numbers. */
export function parseMetadataValue(value: string): MetadataValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (NUMBER_PATTERN.test(value)) return Number(value);
  return value;
}

/** Converts the key/value rows of the booking form into the `metadata` object Carvi accepts. */
export function rowsToMetadata(rows: MetadataRow[]): MetadataResult {
  const errors: Record<number, string> = {};
  const metadata: Metadata = {};
  const seen = new Set<string>();
  let kept = 0;
  rows.forEach((row, index) => {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) return;
    kept += 1;
    if (kept > METADATA_MAX_KEYS) {
      errors[index] = `Máximo ${METADATA_MAX_KEYS} datos adicionales`;
      return;
    }
    if (!key) {
      errors[index] = 'Falta la clave';
      return;
    }
    if (!METADATA_KEY_PATTERN.test(key)) {
      errors[index] = 'Clave de 1 a 40 caracteres: letras sin tilde, números, «_», «.» o «-»';
      return;
    }
    if (seen.has(key)) {
      errors[index] = 'Clave repetida';
      return;
    }
    seen.add(key);
    if (value.length > METADATA_MAX_VALUE_LENGTH) {
      errors[index] = `El valor admite como máximo ${METADATA_MAX_VALUE_LENGTH} caracteres`;
      return;
    }
    metadata[key] = parseMetadataValue(value);
  });
  if (Object.keys(errors).length > 0 || Object.keys(metadata).length === 0) return { errors };
  return { metadata, errors };
}

/** Narrows an unknown value (e.g. a webhook payload field) to a flat object. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
