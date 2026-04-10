import type { MiddlewareHandler } from 'hono'
import type { Env } from '../types/env'

export const adminAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const key = c.req.header('X-Admin-Key') ?? c.req.query('admin_key')
  if (!key || key !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
