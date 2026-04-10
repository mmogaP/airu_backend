import type { NormalizedReading, DataSource } from '../types/api'
import { calculateAqi } from './aqi'

export function normalize(raw: {
  stationId: string
  timestamp: string
  pm25?: number | null
  pm10?: number | null
  temperature?: number | null
  humidity?: number | null
  source: DataSource
}): NormalizedReading | null {
  const pm25 = raw.pm25 != null && raw.pm25 >= 0 && raw.pm25 < 2000 ? raw.pm25 : null

  // Need at least PM2.5 to compute AQI
  if (pm25 === null) return null

  const { aqi, label } = calculateAqi(pm25)

  return {
    stationId: raw.stationId,
    timestamp: raw.timestamp,
    pm25,
    pm10: raw.pm10 != null && raw.pm10 >= 0 && raw.pm10 < 2000 ? raw.pm10 : null,
    temperature: raw.temperature != null && raw.temperature > -50 && raw.temperature < 80
      ? raw.temperature : null,
    humidity: raw.humidity != null && raw.humidity >= 0 && raw.humidity <= 100
      ? raw.humidity : null,
    aqi,
    aqiLabel: label,
    source: raw.source,
  }
}
