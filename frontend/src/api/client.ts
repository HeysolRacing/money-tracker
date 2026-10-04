import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

/** Typed client generated from FastAPI's OpenAPI schema (`npm run gen:api`). */
// Absolute base (same origin) so requests also work outside a browser, e.g. in tests.
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? '',
  credentials: 'include',
  // Resolve fetch per call (not at import time) so tests can stub it.
  fetch: (request) => globalThis.fetch(request),
});

export type Schemas = components['schemas'];

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Unwraps an openapi-fetch result: returns `data`, or throws ApiRequestError built from the
 * backend's `{ error: { code, message, details } }` body.
 */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (error !== undefined || !response.ok) {
    const body = (error ?? {}) as ErrorBody;
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? response.statusText,
      body.error?.details,
    );
  }
  return data as T;
}
