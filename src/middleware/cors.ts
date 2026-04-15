import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://airu-web.pages.dev',
]

export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  maxAge: 86400,
})

// Server-side origin guard — rejects requests from origins not in the allowlist.
// CORS alone only instructs browsers; this blocks non-browser clients too.
// Cloudflare cron triggers call scheduled() directly and never go through fetch,
// so they are unaffected by this middleware.
export const originGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return next()
}
