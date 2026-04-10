export type AqiLabel =
  | 'good'
  | 'moderate'
  | 'unhealthy-sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous'

export type DataSource = 'sensor' | 'openaq' | 'sinca' | 'waqi'

export type Activity = 'running' | 'cycling' | 'walking'

export interface Station {
  id: string
  name: string
  source: DataSource
  lat: number
  lng: number
  address?: string
  active: boolean
  battery?: number
  lastSeen?: string
  currentAqi?: number
  currentLabel?: AqiLabel
}

export interface Reading {
  id?: number
  stationId: string
  timestamp: string
  pm25?: number
  pm10?: number
  pm1?: number
  no2?: number
  temperature?: number
  humidity?: number
  aqi?: number
  aqiLabel?: AqiLabel
  source: DataSource
}

export interface NormalizedReading {
  stationId: string
  timestamp: string
  pm25: number | null
  pm10: number | null
  temperature: number | null
  humidity: number | null
  aqi: number
  aqiLabel: AqiLabel
  source: DataSource
}

export interface Recommendation {
  activity: Activity
  score: number
  label: string
  advice: string
  safeToGo: boolean
}

export interface AlertLevel {
  level: 'green' | 'yellow' | 'red' | 'emergency'
  pm25Value?: number
  message: string
}
