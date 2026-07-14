import { basketAddressSchema } from '@web-basket/shared';
import { describe, expect, it } from 'vitest';
import { generateBasketAddress } from './address';

describe('generateBasketAddress', () => {
  it('produces addresses that satisfy the shared schema', () => {
    for (let i = 0; i < 100; i++) {
      const address = generateBasketAddress();
      expect(basketAddressSchema.safeParse(address).success).toBe(true);
    }
  });

  it('produces distinct addresses (collision would be ~impossible at 71 bits)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateBasketAddress());
    }
    expect(seen.size).toBe(1000);
  });

  it('uses the full alphabet over a large sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const ch of generateBasketAddress()) {
        seen.add(ch);
      }
    }
    // 6000 random draws from 62 symbols: every symbol should appear
    // (P(missing any one) ≈ 62 · (61/62)^6000 ≈ 10^-40).
    expect(seen.size).toBe(62);
  });
});
