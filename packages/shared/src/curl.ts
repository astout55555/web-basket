import { base64ToBytes, tryDecodeUtf8 } from './encoding';
import type { RequestRecord } from './schemas';

/** The subset of a RequestRecord the cURL builder needs. */
export type CurlInput = Pick<
  RequestRecord,
  'method' | 'path' | 'query' | 'headers' | 'bodyBase64' | 'truncated'
>;

/**
 * Headers curl (or the transport) computes itself, or that only made sense on
 * the original hop. Replaying them verbatim would be wrong or misleading.
 */
const SKIPPED_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-connection',
]);

/**
 * POSIX single-quoting: nothing inside single quotes is special, and embedded
 * single quotes become '\'' (close, escaped quote, reopen). Header and body
 * values come from arbitrary internet requests, so this is a security
 * boundary — without it a crafted header could inject shell commands into the
 * command the user copies.
 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Rebuild a runnable curl command that replays a recorded request. */
export function buildCurlCommand(input: CurlInput, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const url = `${base}${input.path}${input.query ? `?${input.query}` : ''}`;
  const method = input.method.toUpperCase();

  let bodyText: string | null = null;
  let hasBinaryBody = false;
  if (input.bodyBase64 !== null) {
    bodyText = tryDecodeUtf8(base64ToBytes(input.bodyBase64));
    if (bodyText === null) hasBinaryBody = true;
  }

  const parts: string[] = [`curl ${shellQuote(url)}`];

  if (method === 'HEAD') {
    parts.push('-I');
  } else if (method !== 'GET' || bodyText !== null) {
    // Explicit -X GET matters when a GET has a body: --data-* alone would
    // silently turn the request into a POST.
    parts.push(`-X ${method}`);
  }

  for (const [name, value] of Object.entries(input.headers)) {
    if (SKIPPED_HEADERS.has(name.toLowerCase())) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      parts.push(`-H ${shellQuote(`${name}: ${v}`)}`);
    }
  }

  if (bodyText !== null) {
    // --data-raw, not -d: -d treats a leading @ as "read this file", which a
    // malicious recorded body could exploit on replay.
    parts.push(`--data-raw ${shellQuote(bodyText)}`);
    if (input.truncated) {
      // The stored body was capped, so this replay payload is incomplete.
      parts.push('# body truncated at capture; payload above is incomplete');
    }
  }
  if (hasBinaryBody) {
    parts.push('# binary body omitted');
  }

  return parts.join(' \\\n  ');
}
