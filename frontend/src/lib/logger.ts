// Bind early so DevTools shows the real call site, not this wrapper file.
// ESLint suppression is intentional — this is the one allowed console access point.
// warn/error always emit regardless of env; production errors must never be silently dropped.
// eslint-disable-next-line no-console
const _warn = console.warn.bind(console)
// eslint-disable-next-line no-console
const _error = console.error.bind(console)

export const logger = {
  warn: (...args: unknown[]) => _warn(...args),
  error: (...args: unknown[]) => _error(...args),
}
