import type { AqiLabel } from '../types/api'

// EPA PM2.5 breakpoints
const PM25_BREAKPOINTS = [
  { cLow: 0.0,   cHigh: 12.0,  iLow: 0,   iHigh: 50,  label: 'good' as AqiLabel },
  { cLow: 12.1,  cHigh: 35.4,  iLow: 51,  iHigh: 100, label: 'moderate' as AqiLabel },
  { cLow: 35.5,  cHigh: 55.4,  iLow: 101, iHigh: 150, label: 'unhealthy-sensitive' as AqiLabel },
  { cLow: 55.5,  cHigh: 150.4, iLow: 151, iHigh: 200, label: 'unhealthy' as AqiLabel },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300, label: 'very-unhealthy' as AqiLabel },
  { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500, label: 'hazardous' as AqiLabel },
]

export function calculateAqi(pm25: number): { aqi: number; label: AqiLabel } {
  const truncated = Math.trunc(pm25 * 10) / 10

  for (const bp of PM25_BREAKPOINTS) {
    if (truncated >= bp.cLow && truncated <= bp.cHigh) {
      const aqi = Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (truncated - bp.cLow) + bp.iLow
      )
      return { aqi, label: bp.label }
    }
  }

  // Over 500
  return { aqi: 500, label: 'hazardous' }
}

export function aqiLabelEs(label: AqiLabel): string {
  const map: Record<AqiLabel, string> = {
    'good': 'Bueno',
    'moderate': 'Moderado',
    'unhealthy-sensitive': 'Dañino para grupos sensibles',
    'unhealthy': 'Dañino',
    'very-unhealthy': 'Muy dañino',
    'hazardous': 'Peligroso',
  }
  return map[label]
}
