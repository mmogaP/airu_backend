import type { Activity, AqiLabel, Recommendation } from '../types/api'

// Base score por AQI label (0-10, mayor = más seguro)
const AQI_SCORE: Record<AqiLabel, number> = {
  'good': 10,
  'moderate': 7,
  'unhealthy-sensitive': 4,
  'unhealthy': 2,
  'very-unhealthy': 1,
  'hazardous': 0,
}

// Penalización por actividad (más intenso = más riesgo)
const ACTIVITY_PENALTY: Record<Activity, number> = {
  walking: 0,
  cycling: 1,
  running: 2,
}

// Penalización por hora del día (06-10 y 18-22 peor en Santiago)
function hourPenalty(hour: number): number {
  if ((hour >= 6 && hour <= 10) || (hour >= 18 && hour <= 22)) return 1
  return 0
}

const ADVICE: Record<Activity, Record<'safe' | 'moderate' | 'unsafe', string>> = {
  running: {
    safe: 'Condiciones óptimas para correr. Disfruta tu entrenamiento.',
    moderate: 'Puedes salir a correr, considera reducir la intensidad.',
    unsafe: 'Se recomienda no correr al aire libre. Usa cinta o gym.',
  },
  cycling: {
    safe: 'Buenas condiciones para andar en bici.',
    moderate: 'Puedes pedalear, pero evita rutas con mucho tráfico.',
    unsafe: 'No recomendable andar en bici hoy. Considera transporte cubierto.',
  },
  walking: {
    safe: 'Perfecto para caminar. Disfruta el día.',
    moderate: 'Puedes caminar, pero evita zonas de mucho tráfico.',
    unsafe: 'Limita el tiempo al aire libre y usa mascarilla N95 si debes salir.',
  },
}

export function getRecommendation(
  aqiLabel: AqiLabel,
  activity: Activity,
  localHour?: number
): Recommendation {
  const hour = localHour ?? new Date().getUTCHours()
  const base = AQI_SCORE[aqiLabel]
  const penalty = ACTIVITY_PENALTY[activity] + hourPenalty(hour)
  const score = Math.max(0, Math.min(10, base - penalty))

  const tier = score >= 7 ? 'safe' : score >= 4 ? 'moderate' : 'unsafe'

  return {
    activity,
    score,
    label: score >= 7 ? 'Altamente recomendado' : score >= 4 ? 'Con precaución' : 'No recomendado',
    advice: ADVICE[activity][tier],
    safeToGo: score >= 5,
  }
}
