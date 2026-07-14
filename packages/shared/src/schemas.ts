import { z } from 'zod';

/**
 * Basket addresses: the only capability in the system (no auth), so they must
 * be long random tokens. 12 base62 chars ≈ 71 bits of entropy.
 */
export const ADDRESS_LENGTH = 12;
export const ADDRESS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const basketAddressSchema = z
  .string()
  .regex(new RegExp(`^[0-9A-Za-z]{${ADDRESS_LENGTH}}$`), {
    message: `address must be exactly ${ADDRESS_LENGTH} base62 characters`,
  });

export type BasketAddress = z.infer<typeof basketAddressSchema>;

/**
 * A recorded HTTP request as it travels over the wire (API responses and SSE
 * frames). Raw body bytes are carried as base64 because JSON has no binary
 * type; `bodyBase64: null` means the request had no body.
 */
export const requestRecordSchema = z.object({
  id: z.number().int().positive(),
  method: z.string().min(1),
  path: z.string().min(1),
  query: z.string().nullable(),
  headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  bodyBase64: z.base64().nullable(),
  bodySize: z.number().int().nonnegative(),
  truncated: z.boolean(),
  contentType: z.string().nullable(),
  remoteIp: z.string().nullable(),
  receivedAt: z.iso.datetime(),
});

export type RequestRecord = z.infer<typeof requestRecordSchema>;

export const createBasketResponseSchema = z.object({
  address: basketAddressSchema,
});
export type CreateBasketResponse = z.infer<typeof createBasketResponseSchema>;

export const listRequestsResponseSchema = z.object({
  requests: z.array(requestRecordSchema),
});
export type ListRequestsResponse = z.infer<typeof listRequestsResponseSchema>;

/** Error body shape for API 4xx/5xx responses (Fastify's convention). */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** SSE event name used for the live request stream. */
export const SSE_EVENT_REQUEST = 'request';
