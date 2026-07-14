import { beforeEach, describe, expect, it } from 'vitest';
import { loadBaskets, removeBasket, saveBasket } from './baskets-store';

const A1 = 'a1B2c3D4e5F6';
const A2 = 'XxYyZz012345';

beforeEach(() => {
  localStorage.clear();
});

describe('baskets store', () => {
  it('starts empty', () => {
    expect(loadBaskets()).toEqual([]);
  });

  it('saves and reloads baskets, newest first', () => {
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    saveBasket({ address: A2, createdAt: '2026-07-14T11:00:00.000Z' });
    expect(loadBaskets().map((b) => b.address)).toEqual([A2, A1]);
  });

  it('deduplicates by address (re-saving moves it to the front)', () => {
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    saveBasket({ address: A2, createdAt: '2026-07-14T11:00:00.000Z' });
    saveBasket({ address: A1, createdAt: '2026-07-14T12:00:00.000Z' });
    const baskets = loadBaskets();
    expect(baskets.map((b) => b.address)).toEqual([A1, A2]);
    expect(baskets[0]?.createdAt).toBe('2026-07-14T12:00:00.000Z');
  });

  it('removes a basket by address', () => {
    saveBasket({ address: A1, createdAt: '2026-07-14T10:00:00.000Z' });
    saveBasket({ address: A2, createdAt: '2026-07-14T11:00:00.000Z' });
    removeBasket(A1);
    expect(loadBaskets().map((b) => b.address)).toEqual([A2]);
  });

  it('survives garbage in localStorage', () => {
    localStorage.setItem('webBasket.baskets', 'not json {{{');
    expect(loadBaskets()).toEqual([]);
  });

  it('filters out malformed entries instead of crashing', () => {
    localStorage.setItem(
      'webBasket.baskets',
      JSON.stringify([
        { address: A1, createdAt: '2026-07-14T10:00:00.000Z' },
        { address: 'way too short' },
        42,
        null,
      ]),
    );
    expect(loadBaskets().map((b) => b.address)).toEqual([A1]);
  });
});
