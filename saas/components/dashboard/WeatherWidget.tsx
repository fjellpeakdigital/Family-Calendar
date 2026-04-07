'use client'

import { useState, useEffect } from 'react'

interface WeatherData {
  temp: number
  description: string
  icon: string
  location: string
  humidity: number
  windSpeed: number
}

export default function WeatherWidget({ location }: { location: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)

  useEffect(() => {
    if (!location) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/weather')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setWeather(data)
      } catch {}
    }

    load()
    const timer = setInterval(load, 15 * 60 * 1000) // refresh every 15 min
    return () => { cancelled = true; clearInterval(timer) }
  }, [location])

  if (!weather) return null

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <img
        src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
        alt={weather.description}
        width={32}
        height={32}
        className="opacity-80"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-base font-semibold text-white">{weather.temp}°F</span>
        <span className="text-xs capitalize text-gray-500">{weather.description}</span>
      </div>
    </div>
  )
}
