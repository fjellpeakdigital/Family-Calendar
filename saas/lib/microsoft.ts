/**
 * Microsoft Entra / Azure AD OAuth plumbing. We run a standalone
 * OAuth dance (not via NextAuth) so Microsoft is a calendar source
 * only — it never creates a family or signs the user in.
 *
 * Required env:
 *   AZURE_AD_CLIENT_ID
 *   AZURE_AD_CLIENT_SECRET
 *   AZURE_AD_TENANT_ID         — usually 'common' for multi-tenant apps
 *   NEXT_PUBLIC_APP_URL        — used to build the redirect URI
 */

export const MS_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'Calendars.Read',
]

export function msTenantId(): string {
  return process.env.AZURE_AD_TENANT_ID ?? 'common'
}

export function msRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${base}/api/auth/microsoft/callback`
}

export function msAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.AZURE_AD_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  msRedirectUri(),
    response_mode: 'query',
    scope:         MS_SCOPES.join(' '),
    state,
  })
  return `https://login.microsoftonline.com/${msTenantId()}/oauth2/v2.0/authorize?${params}`
}

export interface MsTokenResponse {
  token_type:    string
  expires_in:    number
  access_token:  string
  refresh_token?: string
  scope?:        string
  id_token?:     string
}

export async function msExchangeCode(code: string): Promise<MsTokenResponse> {
  const resp = await fetch(`https://login.microsoftonline.com/${msTenantId()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      redirect_uri:  msRedirectUri(),
      grant_type:    'authorization_code',
      code,
      scope:         MS_SCOPES.join(' '),
    }),
  })
  if (!resp.ok) throw new Error(`MS code exchange failed: ${resp.status} ${await resp.text()}`)
  return resp.json()
}

export async function msRefreshToken(refreshToken: string): Promise<MsTokenResponse> {
  const resp = await fetch(`https://login.microsoftonline.com/${msTenantId()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      scope:         MS_SCOPES.join(' '),
    }),
  })
  if (!resp.ok) throw new Error(`MS token refresh failed: ${resp.status} ${await resp.text()}`)
  return resp.json()
}

/**
 * Pull the signed-in account email out of an id_token without
 * verifying the signature. Signature verification isn't security-
 * critical here because the token came directly from MS's token
 * endpoint over TLS; we only use the email as a stable identifier
 * for oauth_tokens.account_email.
 */
export function msEmailFromIdToken(idToken: string): string | null {
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    )
    return (payload.preferred_username as string | undefined)
        ?? (payload.email            as string | undefined)
        ?? (payload.upn              as string | undefined)
        ?? null
  } catch {
    return null
  }
}
