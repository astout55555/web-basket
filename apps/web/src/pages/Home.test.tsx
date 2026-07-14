import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { loadBaskets, saveBasket } from '../lib/baskets-store';

vi.mock('../lib/api', () => ({
  createBasket: vi.fn(),
}));
import { createBasket } from '../lib/api';

const A1 = 'a1B2c3D4e5F6';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(createBasket).mockReset();
});

describe('Home', () => {
  it('shows an empty state when no baskets are saved', () => {
    renderHome();
    expect(screen.getByText(/no baskets yet/i)).toBeInTheDocument();
  });

  it('lists saved baskets with their sink URLs', () => {
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    renderHome();
    expect(screen.getByRole('link', { name: new RegExp(A1) })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`/${A1}$`))).toBeInTheDocument();
  });

  it('creates a basket, saves it locally, and navigates to its dashboard', async () => {
    const user = userEvent.setup();
    vi.mocked(createBasket).mockResolvedValue(A1);
    renderHome();

    await user.click(screen.getByRole('button', { name: /create basket/i }));

    expect(
      await screen.findByText(new RegExp(`dashboard.*${A1}|${A1}.*dashboard`, 'i')),
    ).toBeInTheDocument();
    expect(loadBaskets().map((b) => b.address)).toEqual([A1]);
  });

  it('surfaces creation errors (e.g. rate limiting)', async () => {
    const user = userEvent.setup();
    vi.mocked(createBasket).mockRejectedValue(new Error('Rate limit exceeded, retry in 1 minute'));
    renderHome();

    await user.click(screen.getByRole('button', { name: /create basket/i }));

    expect(await screen.findByText(/rate limit exceeded/i)).toBeInTheDocument();
    expect(loadBaskets()).toEqual([]);
  });

  it('copies the sink URL to the clipboard', async () => {
    const user = userEvent.setup();
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    renderHome();

    await user.click(screen.getByRole('button', { name: /copy/i }));

    expect(await navigator.clipboard.readText()).toMatch(new RegExp(`/${A1}$`));
  });
});
