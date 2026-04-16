import { Hono } from 'hono'
import type { Env } from '../types/env'
import type { AlertLevel } from '../types/api'

const alertLevel = new Hono<{ Bindings: Env }>()

alertLevel.get('/', async (c) => {
  const cached = await c.env.CACHE.get('alert-level', 'json') as AlertLevel | null
  if (cached) return c.json({ data: cached })

  // Get max AQI across all active stations in last hour
  const row = await c.env.DB.prepare(`
    SELECT MAX(r.pm25) as max_pm25, MAX(r.aqi) as max_aqi
    FROM readings r
    JOIN stations s ON s.id = r.station_id
    WHERE s.active = 1
      AND r.timestamp >= datetime('now', '-1 hour')
  `).first<{ max_pm25: number; max_aqi: number }>()

  const pm25 = row?.max_pm25 ?? 0

  let level: AlertLevel['level']
  let message: string

  if (pm25 >= 150.5) {
    level = 'emergency'
    message = 'Emergencia ambiental. Evite salir al exterior.'
  } else if (pm25 >= 55.5) {
    level = 'red'
    message = 'Alerta roja. Grupos sensibles deben permanecer en interiores.'
  } else if (pm25 >= 35.5) {
    level = 'yellow'
    message = 'Alerta amarilla. Reduzca actividad física al aire libre.'
  } else {
    level = 'green'
    message = 'Calidad del aire saludable.'
  }

  const result: AlertLevel = { level, pm25Value: pm25, message }
  try { await c.env.CACHE.put('alert-level', JSON.stringify(result), { expirationTtl: 300 }) } catch {}

  return c.json({ data: result })
})

export { alertLevel }
