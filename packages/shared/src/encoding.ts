/**
 * Isomorphic byte helpers. Only web-standard globals (atob, TextDecoder) are
 * used so the same code runs in browsers and in Node (both provide them).
 */

/** Decode base64 into bytes. Throws on malformed base64 (validate upstream). */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decode bytes as UTF-8, or return null if they are not valid UTF-8. */
export function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
