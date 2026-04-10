import { cors } from 'hono/cors'

export const corsMiddleware = cors({
  origin: ['http://localhost:5173', 'https://airu.cl', 'https://airu.pages.dev'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  maxAge: 86400,
})
