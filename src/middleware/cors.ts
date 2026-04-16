import { cors } from 'hono/cors'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://airu-web.pages.dev',
  // Cloudflare Pages preview deployments
  /^https:\/\/[a-f0-9]+\.airu-web\.pages\.dev$/,
]

export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  maxAge: 86400,
})
