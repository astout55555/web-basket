import { basketAddressSchema } from '@web-basket/shared';

/**
 * "Your baskets" is purely client-side (spec §3): the server has no concept
 * of ownership, so the browser remembers what it created. Losing this list
 * loses the *list*, not the baskets — the URL is the capability.
 */
export interface SavedBasket {
  address: string;
  createdAt: string;
}

const STORAGE_KEY = 'webBasket.baskets';

function isSavedBasket(value: unknown): value is SavedBasket {
  return (
    typeof value === 'object' &&
    value !== null &&
    'address' in value &&
    'createdAt' in value &&
    typeof (value as SavedBasket).createdAt === 'string' &&
    basketAddressSchema.safeParse((value as SavedBasket).address).success
  );
}

/** Read the saved list; malformed storage degrades to [] instead of throwing. */
export function loadBaskets(): SavedBasket[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedBasket);
  } catch {
    return [];
  }
}

/** Prepend (newest first); re-saving an address moves it to the front. */
export function saveBasket(basket: SavedBasket): SavedBasket[] {
  const rest = loadBaskets().filter((b) => b.address !== basket.address);
  const next = [basket, ...rest];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeBasket(address: string): SavedBasket[] {
  const next = loadBaskets().filter((b) => b.address !== address);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
