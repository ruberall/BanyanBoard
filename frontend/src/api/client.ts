import { ApiError } from '@/types'

export async function request<T>(
  method: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  // Read VITE_API_URL inside the function (not cached at module level) to allow Vitest to stub it in tests via vi.stubEnv()
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  const url = `${baseUrl}${path}`
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...options?.headers }
  let res: Response
  try {
    res = await fetch(url, { ...options, method, headers })
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText)
  }
  // Return undefined for 204 No Content; the caller expects T, but this response has no body
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
