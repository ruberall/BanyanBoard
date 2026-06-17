const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

export async function createBoard(name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`createBoard failed: ${res.status}`);
  const data = await res.json();
  return data.id as string;
}

export async function deleteBoard(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/boards/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteBoard failed: ${res.status}`);
  }
}
