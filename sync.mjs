#!/usr/bin/env node
// Sync script: runs outside Miniflare, fetches real API data,
// writes directly to local D1 via wrangler d1 execute, then clears KV cache.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readDevVars() {
  const content = readFileSync(__dirname + '/.dev.vars', 'utf8')
  return Object.fromEntries(
    content.trim().split('\n')
      .filter(l => l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
}

function esc(v) {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return isFinite(v) ? v : 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

function calcAqi(pm25) {
  const bps = [
    [0.0, 12.0, 0, 50, 'good'], [12.1, 35.4, 51, 100, 'moderate'],
    [35.5, 55.4, 101, 150, 'unhealthy-sensitive'], [55.5, 150.4, 151, 200, 'unhealthy'],
    [150.5, 250.4, 201, 300, 'very-unhealthy'], [250.5, 500.4, 301, 500, 'hazardous'],
  ]
  const t = Math.trunc(pm25 * 10) / 10
  for (const [cL, cH, iL, iH, label] of bps) {
    if (t >= cL && t <= cH) {
      return { aqi: Math.round(((iH - iL) / (cH - cL)) * (t - cL) + iL), label }
    }
  }
  return { aqi: 500, label: 'hazardous' }
}

const HOURLY_FACTOR = [0.7,0.65,0.6,0.6,0.65,0.75,0.9,1.1,1.15,1.05,0.95,0.85,
                       0.8,0.8,0.85,0.9,1.0,1.1,1.2,1.15,1.05,0.95,0.85,0.75]

function generateSyntheticHistory(stationId, basePm25) {
  const now = new Date()
  const s = []
  for (let h = 24; h >= 1; h--) {
    const ts = new Date(now.getTime() - h * 60 * 60 * 1000)
    const factor = HOURLY_FACTOR[ts.getUTCHours()]
    const pm25 = Math.max(1, Math.round(basePm25 * factor * (0.9 + Math.random() * 0.2) * 10) / 10)
    const { aqi, label } = calcAqi(pm25)
    const tsStr = ts.toISOString().replace('T', ' ').slice(0, 19)
    s.push(`INSERT INTO readings (station_id,timestamp,pm25,aqi,aqi_label,source) SELECT ${esc(stationId)},${esc(tsStr)},${pm25},${aqi},${esc(label)},'synthetic' WHERE NOT EXISTS (SELECT 1 FROM readings WHERE station_id=${esc(stationId)} AND timestamp=${esc(tsStr)});`)
  }
  return s
}

async function main() {
  const vars = readDevVars()
  const { OPENAQ_API_KEY, WAQI_TOKEN } = vars
  const stmts = []
  const errors = []
  const stationPm25 = new Map()

  // --- OpenAQ ---
  if (OPENAQ_API_KEY) {
    try {
      const r = await fetch('https://api.openaq.org/v3/locations?bbox=-71.0,-33.65,-70.4,-33.25&limit=100&page=1', {
        headers: { 'X-API-Key': OPENAQ_API_KEY }
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { results = [] } = await r.json()

      for (const loc of results.slice(0, 20)) {
        const sid = `openaq-${loc.id}`
        stmts.push(`INSERT OR REPLACE INTO stations (id,name,source,lat,lng,last_seen) VALUES (${esc(sid)},${esc(loc.name)},'openaq',${loc.coordinates.latitude},${loc.coordinates.longitude},datetime('now'));`)

        try {
          // Build sensorId→parameter map from location's sensors array
          const sensorParam = {}
          for (const sensor of (loc.sensors ?? [])) {
            sensorParam[sensor.id] = sensor.parameter?.name ?? sensor.name
          }

          const mr = await fetch(`https://api.openaq.org/v3/locations/${loc.id}/latest`, {
            headers: { 'X-API-Key': OPENAQ_API_KEY }
          })
          if (!mr.ok) continue
          const { results: m = [] } = await mr.json()

          // In v3, readings have sensorsId — match to parameter name via sensorParam map
          const pm25m = m.find(x => sensorParam[x.sensorsId] === 'pm25')
          const pm10m = m.find(x => sensorParam[x.sensorsId] === 'pm10')
          if (!pm25m || pm25m.value < 0 || pm25m.value >= 2000) continue
          const { aqi, label } = calcAqi(pm25m.value)
          const ts = pm25m.datetime?.utc ?? pm25m.date?.utc
          stmts.push(`INSERT INTO readings (station_id,timestamp,pm25,pm10,aqi,aqi_label,source) VALUES (${esc(sid)},${esc(ts)},${pm25m.value},${pm10m ? pm10m.value : 'NULL'},${aqi},${esc(label)},'openaq');`)
          stationPm25.set(sid, pm25m.value)
        } catch { /* skip location */ }
      }
    } catch (e) { errors.push(`OpenAQ: ${e.message}`) }
  }

  // --- WAQI ---
  if (WAQI_TOKEN) {
    try {
      const r = await fetch(`https://api.waqi.info/map/bounds/?token=${WAQI_TOKEN}&latlng=-33.7,-70.9,-33.1,-70.3`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const body = await r.json()
      if (body.status !== 'ok') throw new Error('status not ok')

      for (const s of (body.data ?? []).slice(0, 15)) {
        if (s.aqi === '-' || !s.station?.geo) continue
        const sid = `waqi-${s.uid}`
        stmts.push(`INSERT OR REPLACE INTO stations (id,name,source,lat,lng,last_seen) VALUES (${esc(sid)},${esc(s.station.name)},'waqi',${s.station.geo[0]},${s.station.geo[1]},datetime('now'));`)

        try {
          const dr = await fetch(`https://api.waqi.info/feed/@${s.uid}/?token=${WAQI_TOKEN}`)
          if (!dr.ok) continue
          const db = await dr.json()
          if (db.status !== 'ok') continue
          const { iaqi, time } = db.data
          const pm25 = iaqi.pm25?.v
          if (!pm25 || pm25 < 0 || pm25 >= 2000) continue
          const { aqi, label } = calcAqi(pm25)
          stmts.push(`INSERT INTO readings (station_id,timestamp,pm25,pm10,temperature,humidity,aqi,aqi_label,source) VALUES (${esc(sid)},${esc(time.iso)},${pm25},${esc(iaqi.pm10?.v ?? null)},${esc(iaqi.t?.v ?? null)},${esc(iaqi.h?.v ?? null)},${aqi},${esc(label)},'waqi');`)
          stationPm25.set(sid, pm25)
        } catch { /* skip station */ }
      }
    } catch (e) { errors.push(`WAQI: ${e.message}`) }
  }

  if (errors.length) console.error('[sync] API errors:', errors)

  // Synthetic history backfill for all synced stations
  for (const [sid, pm25] of stationPm25.entries()) {
    stmts.push(...generateSyntheticHistory(sid, pm25))
  }

  if (stmts.length === 0) {
    console.log('[sync] No data to insert')
    return
  }

  // Write SQL file and execute via wrangler d1
  const sqlFile = '/tmp/airu_sync.sql'
  writeFileSync(sqlFile, stmts.join('\n'))
  try {
    execSync(`npx wrangler d1 execute airu-db --local --file=${sqlFile}`, {
      cwd: __dirname, stdio: 'pipe',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
    })
    console.log(`[sync] OK — ${stmts.filter(s => s.includes('INTO stations')).length} stations, ${stmts.filter(s => s.includes('INTO readings')).length} readings`)
  } catch (e) {
    console.error('[sync] DB write failed:', e.stderr?.toString() ?? e.message)
  } finally {
    unlinkSync(sqlFile)
  }

  // Clear KV cache so Worker serves fresh data immediately
  try {
    await fetch('http://127.0.0.1:8787/dev/cache-clear', { method: 'POST' })
  } catch { /* worker might not be ready yet */ }
}

main().catch(e => console.error('[sync] Fatal:', e.message))
