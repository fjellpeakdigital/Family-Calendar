import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

// Lazily initialized so the module can be imported without env vars in tests
let ratelimit: Ratelimit | null = null

function getRatelimiter() {
  if (!ratelimit) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return null // graceful degradation in dev without Redis
    }
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(60, '1 m'), // 60 req/min per IP
      analytics: false, // no behavioral data collected
    })
  }
  return ratelimit
}

/**
 * Apply rate limiting to an API route handler.
 * Returns a 429 response if the limit is exceeded, otherwise null.
 * Usage:
 *   const limited = await rateLimit(req)
 *   if (limited) return limited
 */
export async function rateLimit(req: NextRequest): Promise<NextResponse | null> {
  const limiter = getRatelimiter()
  if (!limiter) return null // dev mode — skip

  // Use IP address as the rate limit key
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { success, limit, remaining, reset } = await limiter.limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    )
  }

  return null
}
