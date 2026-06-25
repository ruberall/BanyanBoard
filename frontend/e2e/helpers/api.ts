import type { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

export interface Column {
  id: string;
  name: string;
  position: number;
}

export interface Label {
  name: string;
  color: string;
}

export interface Card {
  id: string;
  title: string;
  labels: Label[];
}

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

export async function getColumns(request: APIRequestContext, boardId: string): Promise<Column[]> {
  const res = await request.get(`${API_BASE}/boards/${boardId}`);
  if (!res.ok()) throw new Error(`getColumns failed: ${res.status()}`);
  const data = await res.json();
  return data.columns as Column[];
}

export async function createCard(
  request: APIRequestContext,
  columnId: string,
  title: string,
  labels?: Label[],
): Promise<Card> {
  const res = await request.post(`${API_BASE}/columns/${columnId}/cards`, {
    data: labels ? { title, labels } : { title },
  });
  if (!res.ok()) throw new Error(`createCard failed: ${res.status()}`);
  return res.json() as Promise<Card>;
}
