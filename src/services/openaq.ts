import type { DataSource } from '../types/api'

const BASE_URL = 'https://api.openaq.org/v3'

// Santiago RM bounding box
const SANTIAGO_BBOX = '-71.0,-33.65,-70.4,-33.25'

export interface OpenAQLocation {
  id: number
  name: string
  coordinates: { latitude: number; longitude: number }
  country: string
  sensors: Array<{ id: number; name: string; parameter: { name: string; units: string } }>
  lastUpdated: string
}

export interface OpenAQMeasurement {
  locationId: number
  parameter: string
  value: number
  unit: string
  date: { utc: string; local: string }
}

export async function fetchSantiagoLocations(apiKey: string): Promise<OpenAQLocation[]> {
  const url = `${BASE_URL}/locations?bbox=${SANTIAGO_BBOX}&limit=100&page=1`
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
  })
  if (!res.ok) throw new Error(`OpenAQ locations error: ${res.status}`)
  const data = await res.json() as { results: OpenAQLocation[] }
  return data.results ?? []
}

export async function fetchLatestByLocation(
  apiKey: string,
  locationId: number
): Promise<OpenAQMeasurement[]> {
  const url = `${BASE_URL}/locations/${locationId}/latest`
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
  })
  if (!res.ok) throw new Error(`OpenAQ latest error: ${res.status}`)
  const data = await res.json() as { results: OpenAQMeasurement[] }
  return data.results ?? []
}

export async function fetchHistory(
  apiKey: string,
  locationId: number,
  dateFrom: string,
  dateTo: string
): Promise<OpenAQMeasurement[]> {
  const url = `${BASE_URL}/measurements?locations_id=${locationId}&date_from=${dateFrom}&date_to=${dateTo}&parameters_id=2&limit=1000`
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
  })
  if (!res.ok) throw new Error(`OpenAQ history error: ${res.status}`)
  const data = await res.json() as { results: OpenAQMeasurement[] }
  return data.results ?? []
}

export function openaqStationId(locationId: number): string {
  return `openaq-${locationId}`
}

export const SOURCE: DataSource = 'openaq'
