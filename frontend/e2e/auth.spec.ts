/**
 * auth.spec.ts
 *
 * E2E tests for the authentication user journey.
 *
 * AC-ENTRY-1    Unauthenticated user navigating to / is redirected to /login
 * AC-ENTRY-2    Unauthenticated user navigating to a board page is redirected to /login
 * AC-LOGIN-1    Logging in with valid credentials redirects to /
 * AC-LOGIN-2    Logging in with wrong password shows an error banner
 * AC-REG-1      Registering with valid credentials redirects to / (auto-login)
 * AC-REG-2      Registering with an already-used email shows an error banner
 * AC-LOGOUT-1   Clicking logout redirects to /login
 * AC-LOGOUT-2   After logout, navigating to / redirects back to /login
 * AC-A11Y-1     Login form inputs have associated labels
 * AC-A11Y-2     Register form inputs have associated labels
 * AC-A11Y-3     Login error banner has role="alert"
 * AC-S3-HAPPY-1 Register with first + last name → GET /auth/me returns names
 * AC-S3-HAPPY-2 Register without names → succeeds (null fields)
 */

import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD, loginAsTestUser } from './helpers/auth.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

// Unique email per registration test — UUID suffix prevents collisions under parallel workers
function uniqueEmail() {
  return `e2e-reg-${randomUUID()}@banyanboard.test`;
}

// ---------------------------------------------------------------------------
// AC-ENTRY: Unauthenticated redirect
// ---------------------------------------------------------------------------

test.describe('Unauthenticated access (AC-ENTRY)', () => {
  test('AC-ENTRY-1: navigating to / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible();
  });

  test('AC-ENTRY-2: navigating to a board URL redirects to /login', async ({ page }) => {
    await page.goto('/boards/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// AC-LOGIN: Login flow
// ---------------------------------------------------------------------------

test.describe('Login (AC-LOGIN)', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure test user exists
    await page.request.post(`${API_BASE}/auth/register`, {
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    });
  });

  test('AC-LOGIN-1: valid credentials → redirect to / (board list)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /my boards/i })).toBeVisible();
  });

  test('AC-LOGIN-2: wrong password → error banner shown, stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByLabel(/password/i).fill('wrong-password-123');
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// AC-REG: Registration flow
// ---------------------------------------------------------------------------

test.describe('Registration (AC-REG)', () => {
  test('AC-REG-1: new user registers → auto-logged-in → redirected to /', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /my boards/i })).toBeVisible();

    // Cleanup
    await page.request.post(`${API_BASE}/auth/logout`);
    // Note: user row cleanup requires direct DB access; acceptable for E2E smoke test
  });

  test('AC-REG-2: duplicate email → error banner shown, stays on /register', async ({ page }) => {
    // Ensure test user exists
    await page.request.post(`${API_BASE}/auth/register`, {
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    });

    await page.goto('/register');
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByRole('alert')).toContainText(/email already registered/i);
    await expect(page).toHaveURL(/\/register/);
  });
});

// ---------------------------------------------------------------------------
// AC-LOGOUT: Logout flow
// ---------------------------------------------------------------------------

test.describe('Logout (AC-LOGOUT)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page.request);
  });

  test('AC-LOGOUT-1: clicking logout redirects to /login', async ({ page }) => {
    await page.goto('/');
    // Confirm session is active before testing logout (guards against session-store race)
    await expect(page.getByRole('heading', { name: /my boards/i })).toBeVisible();
    await page.getByRole('button', { name: /log out/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test('AC-LOGOUT-2: after logout, navigating to / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /my boards/i })).toBeVisible();
    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// AC-A11Y: Accessibility — label/input associations
// ---------------------------------------------------------------------------

test.describe('Accessibility (AC-A11Y)', () => {
  test('AC-A11Y-1: login form inputs have associated labels', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify inputs are reachable via label (getByLabel would throw if no label association)
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('AC-A11Y-2: register form inputs have associated labels', async ({ page }) => {
    await page.goto('/register');

    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('AC-A11Y-3: login error banner has role="alert"', async ({ page }) => {
    // Ensure test user exists
    await page.request.post(`${API_BASE}/auth/register`, {
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByLabel(/password/i).fill('wrong');
    await page.getByRole('button', { name: /log in/i }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid email or password/i);
  });
});

// ---------------------------------------------------------------------------
// AC-S3: Register form name fields (Phase 3 E2E)
// ---------------------------------------------------------------------------

test.describe('Registration with name fields (AC-S3)', () => {
  test('AC-S3-HAPPY-1: register with first + last name → GET /auth/me returns names', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/register');
    await page.getByLabel(/first name/i).fill('Jane');
    await page.getByLabel(/last name/i).fill('Doe');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    // Auto-login → redirect to /
    await expect(page).toHaveURL('/');

    // Verify names persisted — call GET /auth/me with the session cookie
    const meRes = await page.request.get(`${API_BASE}/auth/me`);
    expect(meRes.ok()).toBeTruthy();
    const me = await meRes.json();
    expect(me.first_name).toBe('Jane');
    expect(me.last_name).toBe('Doe');

    // Cleanup
    await page.request.post(`${API_BASE}/auth/logout`);
  });

  test('AC-S3-HAPPY-2: register without names → succeeds, no form error', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/register');
    // Leave first_name and last_name blank
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    // Should succeed and redirect to /
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Cleanup
    await page.request.post(`${API_BASE}/auth/logout`);
  });
});
