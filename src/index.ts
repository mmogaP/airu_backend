import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'
import { stations } from './routes/stations'
import { current } from './routes/current'
import { history } from './routes/history'
import { recommendation } from './routes/recommendation'
import { alertLevel } from './routes/alertLevel'
import type { Env } from './types/env'
import { normalize } from './services/normalizer'
import { fetchSantiagoLocations, fetchLatestByLocation, openaqStationId } from './services/openaq'
import { fetchNearbyStations, fetchStationDetail, waqiStationId } from './services/waqi'
import type { DataSource } from './types/api'

const app = new Hono<{ Bindings: Env }>()

app.use('*', corsMiddleware)

// Public API
app.route('/v1/stations', stations)
app.route('/v1/current', current)
app.route('/v1/history', history)
app.route('/v1/recommendation', recommendation)
app.route('/v1/alert-level', alertLevel)

// Health
app.get('/', (c) => c.json({ name: 'Airu API', version: '1.0.0', status: 'ok' }))

// Dev: clear KV cache so fresh data is served after external sync
app.post('/dev/cache-clear', async (c) => {
  await c.env.CACHE.delete('stations:all')
  await c.env.CACHE.delete('alert-level')
  return c.json({ ok: true })
})

// Cron handler — sync data every 30 min
async function syncData(env: Env) {
  const SANTIAGO_LAT = -33.4372
  const SANTIAGO_LNG = -70.6506

  const errors: string[] = []

  // --- OpenAQ ---
  if (env.OPENAQ_API_KEY) {
    try {
      const locations = await fetchSantiagoLocations(env.OPENAQ_API_KEY)
      for (const loc of locations.slice(0, 20)) {
        const stationId = openaqStationId(loc.id)

        // Upsert station
        await env.DB.prepare(`
          INSERT OR REPLACE INTO stations (id, name, source, lat, lng, last_seen)
          VALUES (?, ?, 'openaq', ?, ?, datetime('now'))
        `).bind(stationId, loc.name, loc.coordinates.latitude, loc.coordinates.longitude).run()

        // Get latest measurements
        const measurements = await fetchLatestByLocation(env.OPENAQ_API_KEY, loc.id)
        const pm25m = measurements.find(m => m.parameter === 'pm25')
        const pm10m = measurements.find(m => m.parameter === 'pm10')

        if (!pm25m) continue

        const reading = normalize({
          stationId,
          timestamp: pm25m.date.utc,
          pm25: pm25m.value,
          pm10: pm10m?.value,
          source: 'openaq',
        })

        if (reading) {
          await env.DB.prepare(`
            INSERT INTO readings (station_id, timestamp, pm25, pm10, aqi, aqi_label, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            reading.stationId, reading.timestamp, reading.pm25, reading.pm10,
            reading.aqi, reading.aqiLabel, reading.source
          ).run()

          await env.CACHE.put(`latest:${stationId}`, JSON.stringify(reading), { expirationTtl: 3600 })
        }
      }
    } catch (e) {
      errors.push(`OpenAQ: ${(e as Error).message}`)
    }
  }

  // --- WAQI ---
  if (env.WAQI_TOKEN) {
    try {
      const waqiStations = await fetchNearbyStations(env.WAQI_TOKEN, SANTIAGO_LAT, SANTIAGO_LNG)
      for (const s of waqiStations.slice(0, 15)) {
        if (s.aqi === '-') continue
        const stationId = waqiStationId(s.uid)

        await env.DB.prepare(`
          INSERT OR REPLACE INTO stations (id, name, source, lat, lng, last_seen)
          VALUES (?, ?, 'waqi', ?, ?, datetime('now'))
        `).bind(stationId, s.station.name, s.station.geo[0], s.station.geo[1]).run()

        const detail = await fetchStationDetail(env.WAQI_TOKEN, s.uid)
        const reading = normalize({
          stationId,
          timestamp: detail.time.iso,
          pm25: detail.iaqi.pm25?.v,
          pm10: detail.iaqi.pm10?.v,
          temperature: detail.iaqi.t?.v,
          humidity: detail.iaqi.h?.v,
          source: 'waqi',
        })

        if (reading) {
          await env.DB.prepare(`
            INSERT INTO readings (station_id, timestamp, pm25, pm10, temperature, humidity, aqi, aqi_label, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            reading.stationId, reading.timestamp, reading.pm25, reading.pm10,
            reading.temperature, reading.humidity, reading.aqi, reading.aqiLabel, reading.source
          ).run()

          await env.CACHE.put(`latest:${stationId}`, JSON.stringify(reading), { expirationTtl: 3600 })
        }
      }
    } catch (e) {
      errors.push(`WAQI: ${(e as Error).message}`)
    }
  }

  // Invalidate station list cache
  await env.CACHE.delete('stations:all')
  await env.CACHE.delete('alert-level')

  return errors
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncData(env))
  },
}
