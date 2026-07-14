import type { RequestRecord } from '@web-basket/shared';
import { createBasketResponseSchema, listRequestsResponseSchema } from '@web-basket/shared';

/** Error carrying the HTTP status, so callers can react to 404 vs the rest. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

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

async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) throw new HttpError(res.status, await errorMessage(res));
  return res;
}

export async function createBasket(): Promise<string> {
  const res = await ensureOk(await fetch('/api/baskets', { method: 'POST' }));
  // zod-parse the response: the shared contract is enforced on BOTH ends.
  return createBasketResponseSchema.parse(await res.json()).address;
}

export async function fetchRequests(address: string): Promise<RequestRecord[]> {
  const res = await ensureOk(await fetch(`/api/baskets/${address}/requests`));
  return listRequestsResponseSchema.parse(await res.json()).requests;
}

export async function deleteBasket(address: string): Promise<void> {
  const res = await fetch(`/api/baskets/${address}`, { method: 'DELETE' });
  // 404 means it's already gone — that's what the caller wanted anyway.
  if (!res.ok && res.status !== 404) throw new HttpError(res.status, await errorMessage(res));
}
