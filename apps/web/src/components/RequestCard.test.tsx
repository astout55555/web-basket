import type { RequestRecord } from '@web-basket/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestCard } from './RequestCard';

function record(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: 1,
    method: 'POST',
    path: '/a1B2c3D4e5F6/hook',
    query: 'x=1',
    headers: { 'content-type': 'application/json', 'x-multi': ['a', 'b'] },
    bodyBase64: btoa('{"n":1}'),
    bodySize: 7,
    truncated: false,
    contentType: 'application/json',
    remoteIp: '203.0.113.9',
    receivedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  };
}

function renderCard(rec: RequestRecord) {
  return render(
    <ul>
      <RequestCard record={rec} />
    </ul>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RequestCard', () => {
  it('shows method badge, path+query, source IP, and pretty JSON body', () => {
    renderCard(record());
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('/a1B2c3D4e5F6/hook?x=1')).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.9/)).toBeInTheDocument();
    expect(screen.getByText(/"n": 1/)).toBeInTheDocument();
  });

  it('marks truncated bodies', () => {
    renderCard(record({ truncated: true, bodySize: 999999 }));
    expect(screen.getByText(/truncated/i)).toBeInTheDocument();
  });

  it('notes binary bodies instead of rendering garbage', () => {
    renderCard(
      record({ bodyBase64: '//79', bodySize: 3, contentType: 'application/octet-stream' }),
    );
    expect(screen.getByText(/binary body/i)).toBeInTheDocument();
  });

  it('lists headers, joining multi-values', () => {
    renderCard(record());
    expect(screen.getByText('x-multi')).toBeInTheDocument();
    expect(screen.getByText('a, b')).toBeInTheDocument();
  });

  it('copies a runnable curl command', async () => {
    const user = userEvent.setup();
    renderCard(record());

    await user.click(screen.getByRole('button', { name: /copy as curl/i }));

    const copied = await navigator.clipboard.readText();
    expect(copied).toMatch(/^curl 'http:\/\/localhost:3000\/a1B2c3D4e5F6\/hook\?x=1'/);
    expect(copied).toContain(`-H 'content-type: application/json'`);
    expect(copied).toContain(`--data-raw '{"n":1}'`);
  });

  it('downloads the record as JSON', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderCard(record());

    await user.click(screen.getByRole('button', { name: /download json/i }));

    expect(blobs).toHaveLength(1);
    const parsed = JSON.parse(await blobs[0]!.text()) as RequestRecord;
    expect(parsed.id).toBe(1);
  });
});
