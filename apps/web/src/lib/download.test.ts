import type { RequestRecord } from '@web-basket/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadRecordJson } from './download';

const record: RequestRecord = {
  id: 7,
  method: 'POST',
  path: '/a1B2c3D4e5F6',
  query: null,
  headers: { 'x-a': '1' },
  bodyBase64: null,
  bodySize: 0,
  truncated: false,
  contentType: null,
  remoteIp: null,
  receivedAt: '2026-07-14T12:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadRecordJson', () => {
  it('offers the record as a pretty-printed JSON file download', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadRecordJson(record);

    expect(click).toHaveBeenCalledOnce();
    expect(blobs).toHaveLength(1);
    const parsed: unknown = JSON.parse(await blobs[0]!.text());
    expect(parsed).toEqual(record);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
