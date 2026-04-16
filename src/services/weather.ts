export interface WeatherData {
  temperature: number
  humidity: number
}

export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  cache: KVNamespace
): Promise<WeatherData | null> {
  const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`

  const cached = await cache.get(key, 'json') as WeatherData | null
  if (cached) return cached

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { current: { temperature_2m: number; relative_humidity_2m: number } }
    const weather: WeatherData = {
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
    }
    try { await cache.put(key, JSON.stringify(weather), { expirationTtl: 1800 }) } catch {}
    return weather
  } catch {
    return null
  }
}
