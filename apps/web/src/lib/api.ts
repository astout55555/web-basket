import { createBasketResponseSchema } from '@web-basket/shared';

/** Pull the server's error message out of a failed response, if it sent one. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const msg = (body as { message: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
  } catch {
    // non-JSON error body — fall through
  }
  return `HTTP ${res.status}`;
}

export async function createBasket(): Promise<string> {
  const res = await fetch('/api/baskets', { method: 'POST' });
  if (!res.ok) throw new Error(await errorMessage(res));
  // zod-parse the response: the shared contract is enforced on BOTH ends.
  return createBasketResponseSchema.parse(await res.json()).address;
}
