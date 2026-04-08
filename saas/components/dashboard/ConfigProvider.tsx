'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ConfigJson } from '@/lib/supabase/types'

interface ConfigContextValue {
  config:      ConfigJson
  setConfig:   (c: ConfigJson) => void
  saveConfig:  (c: ConfigJson) => Promise<void>
  lastSynced:  Date | null
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used inside ConfigProvider')
  return ctx
}

interface Props {
  children:      ReactNode
  initialConfig: ConfigJson
  familyId:      string
}

/**
 * ConfigProvider:
 * 1. Holds family config in React state (seeded from server)
 * 2. Persists saves to /api/config (debounced)
 * 3. Subscribes to Supabase Realtime on family_config for cross-device sync
 *
 * Any device that saves config triggers a DB update, which triggers the
 * Realtime channel on all other connected devices, which re-fetches and
 * updates local state — so all devices stay in sync without polling.
 */
export default function ConfigProvider({ children, initialConfig, familyId }: Props) {
  const [config, setConfigState] = useState<ConfigJson>(initialConfig)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving  = useRef(false)

  // Debounced save to server
  const saveConfig = useCallback(async (newConfig: ConfigJson) => {
    setConfigState(newConfig)

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (isSaving.current) return
      isSaving.current = true
      try {
        await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: newConfig }),
        })
        setLastSynced(new Date())
      } finally {
        isSaving.current = false
      }
    }, 800)
  }, [])

  // Fetch latest config from server (used by Realtime handler)
  const refetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config')
      if (!res.ok) return
      const data = await res.json()
      if (data.config) {
        setConfigState(data.config)
        setLastSynced(new Date())
      }
    } catch {}
  }, [])

  // Supabase Realtime: listen for config changes from other devices
  useEffect(() => {
    if (!familyId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`family_config:${familyId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'family_config',
          filter: `family_id=eq.${familyId}`,
        },
        () => {
          // Another device saved — refetch to get the latest
          refetchConfig()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId, refetchConfig])

  return (
    <ConfigContext.Provider
      value={{
        config,
        setConfig: setConfigState,
        saveConfig,
        lastSynced,
      }}
    >
      {children}
    </ConfigContext.Provider>
  )
}
