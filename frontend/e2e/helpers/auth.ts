import type { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

export const E2E_EMAIL = 'e2e-user@banyanboard.test';
export const E2E_PASSWORD = 'E2ePassword1!';

/**
 * Register a test user (ignores 409 if already exists), then login.
 * Uses the page's request context so the session cookie is shared with page.goto().
 */
export async function loginAsTestUser(request: APIRequestContext): Promise<void> {
  // Register (no-op on 409 conflict)
  await request.post(`${API_BASE}/auth/register`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  // Login to get a fresh session
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`loginAsTestUser failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Logout the current session.
 */
export async function logoutTestUser(request: APIRequestContext): Promise<void> {
  await request.post(`${API_BASE}/auth/logout`);
}
