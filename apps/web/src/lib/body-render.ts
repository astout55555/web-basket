import type { RequestRecord } from '@web-basket/shared';
import { base64ToBytes, tryDecodeUtf8 } from '@web-basket/shared';

export type BodyView =
  | { kind: 'none' }
  | { kind: 'binary'; size: number }
  | { kind: 'json'; text: string }
  | { kind: 'text'; text: string };

/**
 * Decide how to display a stored body: absent, binary (not valid UTF-8),
 * pretty-printed JSON (whenever it parses — content-type headers lie), or
 * plain text.
 */
export function describeBody(record: Pick<RequestRecord, 'bodyBase64' | 'bodySize'>): BodyView {
  if (record.bodyBase64 === null) return { kind: 'none' };

  const text = tryDecodeUtf8(base64ToBytes(record.bodyBase64));
  if (text === null) return { kind: 'binary', size: record.bodySize };

  try {
    return { kind: 'json', text: JSON.stringify(JSON.parse(text), null, 2) };
  } catch {
    return { kind: 'text', text };
  }
}
