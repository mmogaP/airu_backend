import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../types/env'
import { fetchCurrentWeather } from '../services/weather'

const current = new Hono<{ Bindings: Env }>()

const querySchema = z.union([
  z.object({ station_id: z.string() }),
  z.object({ lat: z.coerce.number(), lng: z.coerce.number() }),
])

async function enrichWeather(
  data: Record<string, unknown>,
  lat: number,
  lng: number,
  cache: KVNamespace
): Promise<Record<string, unknown>> {
  if (data.temperature != null && data.humidity != null) return data
  const weather = await fetchCurrentWeather(lat, lng, cache)
  if (!weather) return data
  return {
    ...data,
    temperature: data.temperature ?? weather.temperature,
    humidity: data.humidity ?? weather.humidity,
  }
}

current.get('/', async (c) => {
  const q = c.req.query()

  // By station ID
  if (q.station_id) {
    // Always fetch from DB so we have lat/lng for weather enrichment
    const row = await c.env.DB.prepare(`
      SELECT r.*, s.name, s.lat, s.lng, s.address
      FROM readings r
      JOIN stations s ON s.id = r.station_id
      WHERE r.station_id = ?
      ORDER BY r.timestamp DESC
      LIMIT 1
    `).bind(q.station_id).first()

    if (!row) return c.json({ error: 'No readings found' }, 404)
    const { aqi_label, ...rest } = row as Record<string, unknown>
    const reading = { ...rest, aqiLabel: aqi_label }
    const enriched = await enrichWeather(reading, reading.lat as number, reading.lng as number, c.env.CACHE)
    return c.json({ data: enriched })
  }

  // By coordinates — find nearest station
  if (q.lat && q.lng) {
    const lat = parseFloat(q.lat)
    const lng = parseFloat(q.lng)

    const rows = await c.env.DB.prepare(`
      SELECT
        s.id, s.name, s.lat, s.lng, s.address,
        r.pm25, r.pm10, r.temperature, r.humidity, r.aqi, r.aqi_label, r.timestamp,
        ((s.lat - ?) * (s.lat - ?) + (s.lng - ?) * (s.lng - ?)) AS dist
      FROM stations s
      LEFT JOIN readings r ON r.id = (
        SELECT id FROM readings WHERE station_id = s.id ORDER BY timestamp DESC LIMIT 1
      )
      WHERE s.active = 1
      ORDER BY dist ASC
      LIMIT 1
    `).bind(lat, lat, lng, lng).first()

    if (!rows) return c.json({ error: 'No stations found' }, 404)
    const { aqi_label, ...rest2 } = rows as Record<string, unknown>
    const reading2 = { ...rest2, aqiLabel: aqi_label }
    const enriched2 = await enrichWeather(reading2, reading2.lat as number, reading2.lng as number, c.env.CACHE)
    return c.json({ data: enriched2 })
  }

  return c.json({ error: 'Provide station_id or lat+lng' }, 400)
})

export { current }
