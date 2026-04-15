const BASE_URL = 'https://api.waqi.info'

export interface WaqiStation {
  uid: number
  aqi: string
  lat: number   // top-level in bounds response
  lon: number
  station: {
    name: string
    time: string
  }
}

export interface WaqiDetail {
  aqi: number
  idx: number
  city: { name: string; geo: [number, number] }
  time: { s: string; tz: string; v: number; iso: string }
  iaqi: {
    pm25?: { v: number }
    pm10?: { v: number }
    t?: { v: number }
    h?: { v: number }
  }
}

export async function fetchNearbyStations(
  token: string,
  lat: number,
  lng: number
): Promise<WaqiStation[]> {
  const url = `${BASE_URL}/map/bounds/?token=${token}&latlng=${lat - 0.3},${lng - 0.3},${lat + 0.3},${lng + 0.3}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`WAQI bounds error: ${res.status}`)
  const data = await res.json() as { status: string; data: WaqiStation[] }
  if (data.status !== 'ok') throw new Error('WAQI response not ok')
  return data.data ?? []
}

export async function fetchStationDetail(token: string, uid: number): Promise<WaqiDetail> {
  const url = `${BASE_URL}/feed/@${uid}/?token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`WAQI station error: ${res.status}`)
  const data = await res.json() as { status: string; data: WaqiDetail }
  if (data.status !== 'ok') throw new Error('WAQI response not ok')
  return data.data
}

export function waqiStationId(uid: number): string {
  return `waqi-${uid}`
}
