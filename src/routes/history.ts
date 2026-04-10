import { Hono } from 'hono'
import type { Env } from '../types/env'

const history = new Hono<{ Bindings: Env }>()

history.get('/', async (c) => {
  const stationId = c.req.query('station_id')
  const hours = Math.min(parseInt(c.req.query('hours') ?? '24'), 168)

  if (!stationId) return c.json({ error: 'station_id is required' }, 400)

  const rows = await c.env.DB.prepare(`
    SELECT timestamp, pm25, pm10, temperature, humidity, aqi, aqi_label
    FROM readings
    WHERE station_id = ?
      AND timestamp >= datetime('now', ? || ' hours')
    ORDER BY timestamp ASC
  `).bind(stationId, `-${hours}`).all()

  return c.json({ data: rows.results, station_id: stationId, hours })
})

export { history }
