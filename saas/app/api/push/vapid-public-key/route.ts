import { NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push'

/**
 * GET /api/push/vapid-public-key — return the VAPID public key so the
 * client can subscribe with it. The public key is safe to expose;
 * the private key stays on the server.
 */
export async function GET() {
  const key = getVapidPublicKey()
  if (!key) {
    return NextResponse.json({ error: 'push not configured' }, { status: 503 })
  }
  return NextResponse.json({ key })
}
