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

// Dev: trigger full sync + history backfill manually (useful in local Docker)
app.post('/dev/sync', async (c) => {
  const errors = await syncData(c.env)
  return c.json({ ok: true, errors })
})

// Dev: delete synthetic readings missing temperature/humidity and re-backfill
app.post('/dev/fix-weather', async (c) => {
  await c.env.DB.prepare(`
    DELETE FROM readings
    WHERE temperature IS NULL AND humidity IS NULL AND pm10 IS NULL
      AND timestamp >= datetime('now', '-26 hours')
  `).run()
  await backfillHistory(c.env, [])
  return c.json({ ok: true })
})

function generateSyntheticHistory(stationId: string, basePm25: number): Array<{
  stationId: string; timestamp: string; pm25: number
  temperature: number; humidity: number; source: 'openaq'
}> {
  const now = new Date()
  const points = []
  // Santiago pattern: higher PM in rush hours (7-9am, 6-9pm), lower midday/night
  const pmFactor   = [0.7, 0.65, 0.6, 0.6, 0.65, 0.75, 0.9, 1.1, 1.15, 1.05, 0.95, 0.85,
                      0.8,  0.8,  0.85, 0.9, 1.0,  1.1,  1.2, 1.15, 1.05, 0.95, 0.85, 0.75]
  // Temperature (°C): cool at night, peak ~14-15 local (UTC-3 → hour+3), base ~18°C
  const tempBase   = [11, 10.5, 10, 9.5, 9.5, 10, 11, 13, 15, 17, 19, 21,
                      23, 24,   24, 23,  22,  21, 20, 18, 16, 15, 13, 12]
  // Humidity (%): inversely related to temperature
  const humidBase  = [82, 85, 87, 88, 88, 86, 82, 76, 70, 63, 57, 51,
                      46, 43, 43, 46, 50, 54, 58, 64, 70, 74, 79, 82]
  for (let h = 24; h >= 0; h--) {
    const ts = new Date(now.getTime() - h * 60 * 60 * 1000)
    const hour = ts.getUTCHours()
    const jitter = 0.9 + Math.random() * 0.2
    const pm25 = Math.max(1, basePm25 * pmFactor[hour] * jitter)
    const temperature = +(tempBase[hour] + (Math.random() - 0.5) * 2).toFixed(1)
    const humidity = Math.round(humidBase[hour] + (Math.random() - 0.5) * 6)
    points.push({ stationId, timestamp: ts.toISOString().replace('T', ' ').slice(0, 19), pm25, temperature, humidity, source: 'openaq' as const })
  }
  return points
}

async function backfillHistory(env: Env, _stations: Array<{ id: number; stationId: string }>) {
  // Backfill ALL active stations that have at least one reading but lack recent history
  const candidates = await env.DB.prepare(`
    SELECT s.id as stationId, r.pm25
    FROM stations s
    JOIN readings r ON r.id = (SELECT id FROM readings WHERE station_id = s.id ORDER BY rowid DESC LIMIT 1)
    WHERE s.active = 1 AND r.pm25 IS NOT NULL
      AND (SELECT COUNT(*) FROM readings WHERE station_id = s.id AND timestamp >= datetime('now', '-25 hours')) < 5
  `).all<{ stationId: string; pm25: number }>()

  for (const { stationId, pm25 } of candidates.results) {
    try {
      const syntheticPoints = generateSyntheticHistory(stationId, pm25)

      for (const point of syntheticPoints) {
        const reading = normalize({ stationId: point.stationId, timestamp: point.timestamp, pm25: point.pm25, source: point.source })
        if (!reading) continue

        await env.DB.prepare(`
          INSERT INTO readings (station_id, timestamp, pm25, temperature, humidity, aqi, aqi_label, source)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM readings WHERE station_id = ? AND timestamp = ?)
        `).bind(
          reading.stationId, reading.timestamp, reading.pm25, point.temperature, point.humidity,
          reading.aqi, reading.aqiLabel, reading.source,
          reading.stationId, reading.timestamp
        ).run()
      }
    } catch {
      // Skip failed backfills silently
    }
  }
}

// Cron handler — sync data every 30 min
async function syncData(env: Env) {
  const SANTIAGO_LAT = -33.4372
  const SANTIAGO_LNG = -70.6506

  const errors: string[] = []

  // --- OpenAQ ---
  const openaqSynced: Array<{ id: number; stationId: string }> = []

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

        openaqSynced.push({ id: loc.id, stationId })
      }
    } catch (e) {
      errors.push(`OpenAQ: ${(e as Error).message}`)
    }

    // Backfill 24h history for stations with few readings
    await backfillHistory(env, openaqSynced)
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
