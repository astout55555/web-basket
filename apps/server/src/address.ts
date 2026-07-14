import { randomInt } from 'node:crypto';
import { ADDRESS_ALPHABET, ADDRESS_LENGTH } from '@web-basket/shared';

/**
 * The address is the basket's only credential, so it must come from a
 * CSPRNG. crypto.randomInt is cryptographically secure and rejects internally
 * to avoid modulo bias (Math.random would be guessable — never use it for
 * tokens).
 */
export function generateBasketAddress(): string {
  let address = '';
  for (let i = 0; i < ADDRESS_LENGTH; i++) {
    address += ADDRESS_ALPHABET.charAt(randomInt(ADDRESS_ALPHABET.length));
  }
  return address;
}
