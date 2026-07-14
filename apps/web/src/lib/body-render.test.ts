import { describe, expect, it } from 'vitest';
import { describeBody } from './body-render';

describe('describeBody', () => {
  it('reports absent bodies', () => {
    expect(describeBody({ bodyBase64: null, bodySize: 0 })).toEqual({ kind: 'none' });
  });

  it('pretty-prints JSON bodies', () => {
    const view = describeBody({ bodyBase64: btoa('{"a":1,"b":[2,3]}'), bodySize: 17 });
    expect(view.kind).toBe('json');
    if (view.kind === 'json') {
      expect(view.text).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
    }
  });

  it('falls back to plain text when UTF-8 but not JSON', () => {
    const view = describeBody({ bodyBase64: btoa('hello=world&x=1'), bodySize: 15 });
    expect(view).toEqual({ kind: 'text', text: 'hello=world&x=1' });
  });

  it('flags undecodable bytes as binary with the received size', () => {
    expect(describeBody({ bodyBase64: '//79', bodySize: 3 })).toEqual({
      kind: 'binary',
      size: 3,
    });
  });
});
