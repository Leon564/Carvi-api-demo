import { describe, expect, it } from 'vitest';
import { isPlainObject, metadataBytes, rowsToMetadata } from './metadata';

describe('rowsToMetadata', () => {
  it('returns no metadata when every row is empty', () => {
    expect(rowsToMetadata([])).toEqual({ errors: {} });
    expect(rowsToMetadata([{ key: '  ', value: ' ' }])).toEqual({ errors: {} });
  });

  it('trims keys and values and converts numbers and booleans', () => {
    const result = rowsToMetadata([
      { key: ' agent ', value: ' laura.m ' },
      { key: 'passengers', value: '2' },
      { key: 'discount', value: '-12.5' },
      { key: 'vip', value: 'true' },
      { key: 'paid', value: 'false' },
      { key: 'flight', value: '2x' },
      { key: 'note', value: '' },
    ]);
    expect(result).toEqual({
      metadata: { agent: 'laura.m', passengers: 2, discount: -12.5, vip: true, paid: false, flight: '2x', note: '' },
      errors: {},
    });
  });

  it('keeps strings that only look like numbers or booleans', () => {
    expect(rowsToMetadata([{ key: 'a', value: 'True' }, { key: 'b', value: '1e3' }, { key: 'c', value: '.5' }]).metadata).toEqual({ a: 'True', b: '1e3', c: '.5' });
  });

  it('keeps leading-zero and long digit strings as text', () => {
    expect(rowsToMetadata([
      { key: 'zip', value: '01101' },
      { key: 'neg', value: '-007' },
      { key: 'dec', value: '00.5' },
      { key: 'card', value: '1234567890123456' },
      { key: 'max', value: '123456789012345' },
      { key: 'frac', value: '1234567890.123456' },
      { key: 'zero', value: '0' },
      { key: 'half', value: '0.5' },
    ]).metadata).toEqual({ zip: '01101', neg: '-007', dec: '00.5', card: '1234567890123456', max: 123456789012345, frac: '1234567890.123456', zero: 0, half: 0.5 });
  });

  it('rejects metadata above 8 KB once serialized', () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({ key: `k${i}`, value: 'x'.repeat(480) }));
    const result = rowsToMetadata(rows);
    expect(result.metadata).toBeUndefined();
    expect(result.errors).toEqual({});
    expect(result.totalError).toMatch(/8 KB/);
    const fits = rowsToMetadata(rows.slice(0, 16));
    expect(metadataBytes(fits.metadata ?? {})).toBeLessThanOrEqual(8192);
    expect(fits.totalError).toBeUndefined();
  });

  it('measures the size in UTF-8 bytes', () => {
    expect(metadataBytes({ a: 'ñ' })).toBe(JSON.stringify({ a: 'ñ' }).length + 1);
  });

  it('flags a value without a key, keyed by the original row index', () => {
    const result = rowsToMetadata([{ key: '', value: '' }, { key: '', value: 'orphan' }]);
    expect(result.metadata).toBeUndefined();
    expect(Object.keys(result.errors)).toEqual(['1']);
  });

  it('validates the key pattern', () => {
    expect(rowsToMetadata([{ key: 'código', value: 'x' }]).errors[0]).toBeDefined();
    expect(rowsToMetadata([{ key: 'with space', value: 'x' }]).errors[0]).toBeDefined();
    expect(rowsToMetadata([{ key: 'k'.repeat(41), value: 'x' }]).errors[0]).toBeDefined();
    expect(rowsToMetadata([{ key: 'k'.repeat(40), value: 'x' }]).errors).toEqual({});
    expect(rowsToMetadata([{ key: 'a.b-c_D9', value: 'x' }]).errors).toEqual({});
  });

  it('rejects duplicated keys', () => {
    const result = rowsToMetadata([{ key: 'a', value: '1' }, { key: ' a', value: '2' }]);
    expect(result.metadata).toBeUndefined();
    expect(Object.keys(result.errors)).toEqual(['1']);
  });

  it('limits values to 500 characters', () => {
    expect(rowsToMetadata([{ key: 'a', value: 'x'.repeat(500) }]).errors).toEqual({});
    expect(rowsToMetadata([{ key: 'a', value: 'x'.repeat(501) }]).errors[0]).toBeDefined();
  });

  it('accepts at most 50 non-empty rows', () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, value: String(i) }));
    const fifty = rowsToMetadata(rows.slice(0, 50));
    expect(Object.keys(fifty.metadata ?? {})).toHaveLength(50);
    const result = rowsToMetadata([{ key: '', value: '' }, ...rows]);
    expect(result.metadata).toBeUndefined();
    expect(Object.keys(result.errors)).toEqual(['51']);
  });
});

describe('isPlainObject', () => {
  it('accepts only non-array objects', () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });
});
