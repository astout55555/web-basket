import type { RequestRecord } from '@web-basket/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { loadBaskets, saveBasket } from '../lib/baskets-store';
import { FakeEventSource, installFakeEventSource } from '../test/fake-event-source';

vi.mock('../lib/api', () => ({
  createBasket: vi.fn(),
  deleteBasket: vi.fn(),
  fetchRequests: vi.fn(),
}));
import { deleteBasket, fetchRequests } from '../lib/api';

const A1 = 'a1B2c3D4e5F6';

function record(id: number, overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id,
    method: 'POST',
    path: `/${A1}/hook-${id}`,
    query: null,
    headers: { 'x-n': String(id) },
    bodyBase64: null,
    bodySize: 0,
    truncated: false,
    contentType: null,
    remoteIp: '203.0.113.9',
    receivedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/b/${A1}`]}>
      <App />
    </MemoryRouter>,
  );
}

async function openStream() {
  await act(async () => {
    FakeEventSource.latest().emitOpen();
  });
}

beforeEach(() => {
  localStorage.clear();
  installFakeEventSource();
  vi.mocked(fetchRequests).mockReset();
  vi.mocked(deleteBasket).mockReset();
});

describe('BasketPage', () => {
  it('connects the stream, shows the sink URL and an empty state', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([]);
    renderPage();

    expect(FakeEventSource.latest().url).toBe(`/api/baskets/${A1}/stream`);
    await openStream();

    expect(await screen.findByText(/waiting for the first request/i)).toBeInTheDocument();
    expect(screen.getByText(`http://localhost:3000/${A1}`)).toBeInTheDocument();
    expect(screen.getByText(/live/i)).toBeInTheDocument();
  });

  it('renders fetched history newest-first', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([record(2), record(1)]);
    renderPage();
    await openStream();

    const paths = await screen.findAllByText(new RegExp(`/${A1}/hook-`));
    expect(paths.map((el) => el.textContent)).toEqual([`/${A1}/hook-2`, `/${A1}/hook-1`]);
  });

  it('prepends live events and dedupes repeats', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([record(1)]);
    renderPage();
    await openStream();
    await screen.findByText(`/${A1}/hook-1`);

    await act(async () => {
      FakeEventSource.latest().emitRequest(record(2));
      FakeEventSource.latest().emitRequest(record(2));
    });

    const paths = screen.getAllByText(new RegExp(`/${A1}/hook-`));
    expect(paths.map((el) => el.textContent)).toEqual([`/${A1}/hook-2`, `/${A1}/hook-1`]);
  });

  it('shows reconnecting on stream errors, then refetches history on reopen', async () => {
    vi.mocked(fetchRequests).mockResolvedValue([record(1)]);
    renderPage();
    await openStream();
    await screen.findByText(`/${A1}/hook-1`);

    await act(async () => {
      FakeEventSource.latest().emitError(FakeEventSource.CONNECTING);
    });
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();

    vi.mocked(fetchRequests).mockResolvedValue([record(9), record(1)]);
    await openStream();

    expect(await screen.findByText(`/${A1}/hook-9`)).toBeInTheDocument();
    expect(vi.mocked(fetchRequests)).toHaveBeenCalledTimes(2);
  });

  it('treats a fatally closed stream as a gone basket and can drop it from the list', async () => {
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    vi.mocked(fetchRequests).mockResolvedValue([]);
    renderPage();

    await act(async () => {
      FakeEventSource.latest().emitError(FakeEventSource.CLOSED);
    });

    expect(await screen.findByText(/expired or was deleted/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /remove from my baskets/i }));

    expect(loadBaskets()).toEqual([]);
    expect(await screen.findByText(/inspect any http request/i)).toBeInTheDocument();
  });

  it('deletes the basket after confirmation and returns home', async () => {
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    vi.mocked(fetchRequests).mockResolvedValue([]);
    vi.mocked(deleteBasket).mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await openStream();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /delete basket/i }));

    expect(vi.mocked(deleteBasket)).toHaveBeenCalledWith(A1);
    expect(loadBaskets()).toEqual([]);
    expect(await screen.findByText(/inspect any http request/i)).toBeInTheDocument();
  });
});
