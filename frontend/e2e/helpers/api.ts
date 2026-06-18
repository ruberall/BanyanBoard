import type { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Create a board via the API using the provided request context.
 * The request context must already be authenticated (session cookie present).
 */
export async function createBoard(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post(`${API_BASE}/boards`, {
    data: { name },
  });
  if (!res.ok()) throw new Error(`createBoard failed: ${res.status()}`);
  const data = await res.json();
  return data.id as string;
}

/**
 * Delete a board via the API using the provided request context.
 * The request context must already be authenticated.
 */
export async function deleteBoard(request: APIRequestContext, id: string): Promise<void> {
  const res = await request.delete(`${API_BASE}/boards/${id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`deleteBoard failed: ${res.status()}`);
  }
}
