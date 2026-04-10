import { Hono } from 'hono'
import type { Env } from '../types/env'
import type { Activity, AqiLabel } from '../types/api'
import { getRecommendation } from '../services/recommendation'

const recommendation = new Hono<{ Bindings: Env }>()

recommendation.get('/', async (c) => {
  const lat = parseFloat(c.req.query('lat') ?? '')
  const lng = parseFloat(c.req.query('lng') ?? '')
  const activity = (c.req.query('activity') ?? 'walking') as Activity

  if (isNaN(lat) || isNaN(lng)) {
    return c.json({ error: 'lat and lng are required' }, 400)
  }
  if (!['running', 'cycling', 'walking'].includes(activity)) {
    return c.json({ error: 'activity must be running, cycling or walking' }, 400)
  }

  // Nearest station
  const station = await c.env.DB.prepare(`
    SELECT r.aqi_label, r.aqi,
           ((s.lat - ?) * (s.lat - ?) + (s.lng - ?) * (s.lng - ?)) AS dist
    FROM stations s
    JOIN readings r ON r.id = (
      SELECT id FROM readings WHERE station_id = s.id ORDER BY timestamp DESC LIMIT 1
    )
    WHERE s.active = 1
    ORDER BY dist ASC
    LIMIT 1
  `).bind(lat, lat, lng, lng).first<{ aqi_label: AqiLabel; aqi: number }>()

  if (!station) return c.json({ error: 'No data available' }, 503)

  const localHour = new Date().getUTCHours() - 3 // Santiago UTC-3/UTC-4
  const rec = getRecommendation(station.aqi_label, activity, ((localHour % 24) + 24) % 24)

  return c.json({ data: { ...rec, aqi: station.aqi, aqiLabel: station.aqi_label } })
})

export { recommendation }
