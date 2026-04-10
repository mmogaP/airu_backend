import { Hono } from 'hono'
import type { Env } from '../types/env'

const stations = new Hono<{ Bindings: Env }>()

stations.get('/', async (c) => {
  const cached = await c.env.CACHE.get('stations:all', 'json') as any[] | null
  if (cached) return c.json({ data: cached })

  const rows = await c.env.DB.prepare(`
    SELECT
      s.id, s.name, s.source, s.lat, s.lng, s.address, s.active, s.battery, s.last_seen,
      r.aqi, r.aqi_label, r.pm25, r.timestamp
    FROM stations s
    LEFT JOIN readings r ON r.id = (
      SELECT id FROM readings WHERE station_id = s.id ORDER BY timestamp DESC LIMIT 1
    )
    WHERE s.active = 1
    ORDER BY s.name
  `).all()

  const data = rows.results.map((r: any) => ({
    id: r.id,
    name: r.name,
    source: r.source,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    battery: r.battery,
    lastSeen: r.last_seen,
    currentAqi: r.aqi,
    currentLabel: r.aqi_label,
    currentPm25: r.pm25,
    lastReading: r.timestamp,
  }))

  await c.env.CACHE.put('stations:all', JSON.stringify(data), { expirationTtl: 300 })

  return c.json({ data })
})

stations.get('/:id', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(
    'SELECT * FROM stations WHERE id = ? AND active = 1'
  ).bind(id).first()

  if (!row) return c.json({ error: 'Station not found' }, 404)
  return c.json({ data: row })
})

export { stations }
