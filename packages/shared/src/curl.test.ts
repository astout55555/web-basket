import { describe, expect, it } from 'vitest';
import { buildCurlCommand } from './curl';

const BASE = 'https://demo.test';

function input(overrides: Partial<Parameters<typeof buildCurlCommand>[0]> = {}) {
  return {
    method: 'GET',
    path: '/a1B2c3D4e5F6',
    query: null,
    headers: {},
    bodyBase64: null,
    truncated: false,
    ...overrides,
  };
}

const b64 = (s: string) => btoa(s);

describe('buildCurlCommand', () => {
  it('renders a bare GET as just curl + URL', () => {
    expect(buildCurlCommand(input(), BASE)).toBe(`curl 'https://demo.test/a1B2c3D4e5F6'`);
  });

  it('appends the query string and tolerates a trailing slash on the base URL', () => {
    expect(buildCurlCommand(input({ query: 'x=1&y=2' }), 'https://demo.test/')).toBe(
      `curl 'https://demo.test/a1B2c3D4e5F6?x=1&y=2'`,
    );
  });

  it('renders a JSON POST with method, header, and body on continuation lines', () => {
    const cmd = buildCurlCommand(
      input({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        bodyBase64: b64('{"a":1}'),
      }),
      BASE,
    );
    expect(cmd).toBe(
      [
        `curl 'https://demo.test/a1B2c3D4e5F6'`,
        `-X POST`,
        `-H 'content-type: application/json'`,
        `--data-raw '{"a":1}'`,
      ].join(' \\\n  '),
    );
  });

  it('skips auto-managed/hop-by-hop headers but keeps meaningful ones', () => {
    const cmd = buildCurlCommand(
      input({
        method: 'POST',
        headers: {
          Host: 'demo.test',
          'Content-Length': '7',
          Connection: 'keep-alive',
          'Transfer-Encoding': 'chunked',
          Authorization: 'Bearer tok',
          'x-custom': 'yes',
        },
        bodyBase64: b64('{"a":1}'),
      }),
      BASE,
    );
    expect(cmd).not.toContain('Host:');
    expect(cmd).not.toContain('Content-Length:');
    expect(cmd).not.toContain('Connection:');
    expect(cmd).not.toContain('Transfer-Encoding:');
    expect(cmd).toContain(`-H 'Authorization: Bearer tok'`);
    expect(cmd).toContain(`-H 'x-custom: yes'`);
  });

  it('repeats -H for multi-valued headers', () => {
    const cmd = buildCurlCommand(input({ headers: { 'x-multi': ['a', 'b'] } }), BASE);
    expect(cmd).toContain(`-H 'x-multi: a'`);
    expect(cmd).toContain(`-H 'x-multi: b'`);
  });

  it('escapes single quotes so header/body values cannot break out of the shell string', () => {
    const cmd = buildCurlCommand(
      input({
        method: 'POST',
        headers: { 'x-note': "it's; rm -rf /" },
        bodyBase64: b64(`{"msg":"it's"}`),
      }),
      BASE,
    );
    expect(cmd).toContain(`-H 'x-note: it'\\''s; rm -rf /'`);
    expect(cmd).toContain(`--data-raw '{"msg":"it'\\''s"}'`);
  });

  it('omits undecodable (binary) bodies and leaves a note instead', () => {
    const cmd = buildCurlCommand(
      input({ method: 'POST', bodyBase64: 'w7/DvsO9' /* 0xFF 0xFE 0xFD as latin1→b64 */ }),
      BASE,
    );
    // That base64 decodes to bytes that ARE valid UTF-8 (ÿþý), so use real junk:
    const junk = buildCurlCommand(input({ method: 'POST', bodyBase64: '//79' }), BASE);
    expect(junk).not.toContain('--data-raw');
    expect(junk).toContain('# binary body omitted');
    expect(cmd).toContain('--data-raw');
  });

  it('keeps -X GET when a GET carries a body (curl would otherwise switch to POST)', () => {
    const cmd = buildCurlCommand(input({ method: 'GET', bodyBase64: b64('ping') }), BASE);
    expect(cmd).toContain('-X GET');
    expect(cmd).toContain(`--data-raw 'ping'`);
  });

  it('uses -I for HEAD requests', () => {
    const cmd = buildCurlCommand(input({ method: 'HEAD' }), BASE);
    expect(cmd).toContain('-I');
    expect(cmd).not.toContain('-X HEAD');
  });

  it('warns when the stored body was truncated', () => {
    const cmd = buildCurlCommand(
      input({ method: 'POST', bodyBase64: b64('partial'), truncated: true }),
      BASE,
    );
    expect(cmd).toContain(`--data-raw 'partial'`);
    expect(cmd).toContain('# body truncated');
  });
});
