/** Decode DhanHQ access-token JWT payload (no signature verify — client UX only). */
export function parseDhanAccessToken(token: string): {
  clientId: string | null
  expiresAt: Date | null
} {
  const raw = token.trim().replace(/^"+|"+$/g, '')
  const parts = raw.split('.')
  if (parts.length < 2) return { clientId: null, expiresAt: null }
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = atob(b64 + pad)
    const payload = JSON.parse(json) as {
      dhanClientId?: string | number
      exp?: number
    }
    const clientId = payload.dhanClientId != null ? String(payload.dhanClientId) : null
    const expiresAt =
      typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null
    return { clientId, expiresAt }
  } catch {
    return { clientId: null, expiresAt: null }
  }
}
