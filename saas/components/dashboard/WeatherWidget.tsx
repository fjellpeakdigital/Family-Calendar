'use client'

import { useState, useEffect } from 'react'
import { Thermometer, Cloud } from 'lucide-react'

interface WeatherData {
  temp:        number
  feelsLike:   number
  description: string
  icon:        string
  humidity:    number
  windSpeed:   number
  location:    string
}

export default function WeatherWidget({ location }: { location: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    if (!location) return

    let cancelled = false
    setError(false)

    const load = async () => {
      try {
        const res = await fetch('/api/weather')
        if (!res.ok || cancelled) { if (!cancelled) setError(true); return }
        const data = await res.json()
        if (!cancelled) { setWeather(data); setError(false) }
      } catch { if (!cancelled) setError(true) }
    }

    load()
    const timer = setInterval(load, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [location])

  // No location configured — subtle prompt
  if (!location) {
    return (
      <span className="hidden text-xs text-gray-700 sm:inline">
        Set location in Admin → Settings
      </span>
    )
  }

  // Loading
  if (!weather && !error) {
    return (
      <div className="flex items-center gap-1.5 text-gray-600">
        <Thermometer className="h-4 w-4" />
        <span className="text-xs">—°</span>
      </div>
    )
  }

  // Error (bad API key, location not found, etc.)
  if (error || !weather) {
    return (
      <div className="hidden items-center gap-1 text-gray-600 sm:flex" title="Weather unavailable">
        <Cloud className="h-4 w-4" />
        <span className="text-xs">—°</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <img
        src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
        alt={weather.description}
        width={32}
        height={32}
        className="opacity-80"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-base font-semibold text-white">{weather.temp}°F</span>
        <span className="hidden text-xs capitalize text-gray-500 sm:inline">{weather.description}</span>
      </div>
    </div>
  )
}
