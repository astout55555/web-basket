import { describe, expect, it } from 'vitest';
import {
  ADDRESS_ALPHABET,
  ADDRESS_LENGTH,
  basketAddressSchema,
  createBasketResponseSchema,
  listRequestsResponseSchema,
  requestRecordSchema,
} from './schemas';

const validRecord = {
  id: 42,
  method: 'POST',
  path: '/a1B2c3D4e5F6/hook',
  query: 'x=1&y=2',
  headers: { 'content-type': 'application/json', 'x-multi': ['a', 'b'] },
  bodyBase64: 'eyJhIjoxfQ==',
  bodySize: 7,
  truncated: false,
  contentType: 'application/json',
  remoteIp: '203.0.113.9',
  receivedAt: '2026-07-14T12:00:00.000Z',
};

describe('basketAddressSchema', () => {
  it('accepts a 12-char base62 address', () => {
    expect(basketAddressSchema.parse('a1B2c3D4e5F6')).toBe('a1B2c3D4e5F6');
  });

  it('rejects wrong lengths', () => {
    expect(basketAddressSchema.safeParse('abc').success).toBe(false);
    expect(basketAddressSchema.safeParse('a'.repeat(ADDRESS_LENGTH + 1)).success).toBe(false);
    expect(basketAddressSchema.safeParse('').success).toBe(false);
  });

  it('rejects characters outside base62', () => {
    expect(basketAddressSchema.safeParse('abc_def-1234').success).toBe(false);
    expect(basketAddressSchema.safeParse('abc def 1234').success).toBe(false);
    expect(basketAddressSchema.safeParse('abcdéf123456').success).toBe(false);
  });

  it('alphabet constant matches the schema', () => {
    expect(ADDRESS_ALPHABET).toHaveLength(62);
    for (const ch of ADDRESS_ALPHABET) {
      expect(basketAddressSchema.safeParse(ch.repeat(ADDRESS_LENGTH)).success).toBe(true);
    }
  });
});

describe('requestRecordSchema', () => {
  it('accepts a fully-populated record', () => {
    expect(requestRecordSchema.parse(validRecord)).toEqual(validRecord);
  });

  it('accepts nullable fields as null', () => {
    const rec = {
      ...validRecord,
      query: null,
      bodyBase64: null,
      contentType: null,
      remoteIp: null,
    };
    expect(requestRecordSchema.parse(rec)).toEqual(rec);
  });

  it('rejects a non-ISO receivedAt', () => {
    expect(requestRecordSchema.safeParse({ ...validRecord, receivedAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  it('rejects invalid base64 bodies', () => {
    expect(
      requestRecordSchema.safeParse({ ...validRecord, bodyBase64: 'not base64!!!' }).success,
    ).toBe(false);
  });

  it('rejects a negative bodySize', () => {
    expect(requestRecordSchema.safeParse({ ...validRecord, bodySize: -1 }).success).toBe(false);
  });

  it('rejects non-string header values', () => {
    expect(requestRecordSchema.safeParse({ ...validRecord, headers: { 'x-bad': 7 } }).success).toBe(
      false,
    );
  });
});

describe('API response schemas', () => {
  it('createBasketResponseSchema requires a valid address', () => {
    expect(createBasketResponseSchema.parse({ address: 'a1B2c3D4e5F6' })).toEqual({
      address: 'a1B2c3D4e5F6',
    });
    expect(createBasketResponseSchema.safeParse({ address: 'nope' }).success).toBe(false);
  });

  it('listRequestsResponseSchema wraps an array of records', () => {
    expect(listRequestsResponseSchema.parse({ requests: [validRecord] }).requests).toHaveLength(1);
    expect(listRequestsResponseSchema.safeParse({ requests: [{ id: 1 }] }).success).toBe(false);
  });
});
