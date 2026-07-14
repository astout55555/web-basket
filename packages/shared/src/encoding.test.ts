import { describe, expect, it } from 'vitest';
import { base64ToBytes, tryDecodeUtf8 } from './encoding';

describe('base64ToBytes', () => {
  it('decodes base64 to the original bytes', () => {
    expect(Array.from(base64ToBytes('aGVsbG8='))).toEqual([104, 101, 108, 108, 111]); // "hello"
  });

  it('decodes an empty string to an empty array', () => {
    expect(base64ToBytes('')).toHaveLength(0);
  });
});

describe('tryDecodeUtf8', () => {
  it('decodes valid UTF-8, including multi-byte characters', () => {
    expect(tryDecodeUtf8(base64ToBytes('aGVsbG8='))).toBe('hello');
    expect(tryDecodeUtf8(new TextEncoder().encode('snack: 🥨'))).toBe('snack: 🥨');
  });

  it('returns null for bytes that are not valid UTF-8', () => {
    expect(tryDecodeUtf8(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });
});
