/**
 * Calendar source dispatcher — loads assignments for a family, fans
 * out to the appropriate adapter for each, merges overlay data, and
 * returns a unified CalendarEvent[] for the rest of the app.
 *
 * Replaces the old lib/google-calendar.ts fetchFamilyEvents entry
 * point. lib/google-calendar.ts now re-exports from here for
 * back-compat with existing call sites.
 */

import { createClient } from '@/lib/supabase/server'
import type { CalAssignment, CalendarEvent, CalendarSourceProvider, ConfigJson, Person } from '@/lib/supabase/types'
import { googleAdapter }    from './google'
import { icsAdapter }       from './ics'
import { microsoftAdapter } from './microsoft'
import {
  assignmentProvider,
  computeEventKey,
  seriesOverlayId,
  type CalendarSourceAdapter,
  type RawEvent,
} from './types'

const adapters: Record<CalendarSourceProvider, CalendarSourceAdapter | null> = {
  google:    googleAdapter,
  ics:       icsAdapter,
  microsoft: microsoftAdapter,
  caldav:    null,       // deferred
}

export async function fetchFamilyEvents(
  familyId:   string,
  timeMin:    string,
  timeMax:    string,
  configJson: ConfigJson,
): Promise<CalendarEvent[]> {
  const assignments = configJson.cal_assignments ?? []
  if (assignments.length === 0) return []

  const personMap = new Map<string, Person>(configJson.people.map(p => [p.id, p]))

  // Fan out: one fetchRaw per assignment, keeping them independent so
  // a single broken source doesn't take out the others.
  type Fetched = {
    assignment: CalAssignment
    provider:   CalendarSourceProvider
    events:     RawEvent[]
  }
  const results = await Promise.allSettled<Fetched>(
    assignments.map(async (assignment) => {
      const provider = assignmentProvider(assignment)
      const adapter  = adapters[provider]
      if (!adapter) {
        console.warn(`[calendar] no adapter registered for provider=${provider} (calendar ${assignment.calendarId})`)
        return { assignment, provider, events: [] }
      }
      try {
        const events = await adapter.fetchRaw({ familyId, timeMin, timeMax, assignment })
        return { assignment, provider, events }
      } catch (err) {
        console.error(`[calendar] adapter ${provider} threw for calendar ${assignment.calendarId}:`, err)
        return { assignment, provider, events: [] }
      }
    })
  )

  // Flatten to (provider, assignment, raw event, computed eventKey)
  type Bound = { raw: RawEvent; assignment: CalAssignment; provider: CalendarSourceProvider; eventKey: string }
  const bound: Bound[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const raw of r.value.events) {
      bound.push({
        raw,
        assignment: r.value.assignment,
        provider:   r.value.provider,
        eventKey:   computeEventKey(r.value.provider, r.value.assignment.calendarId, raw),
      })
    }
  }

  // Batch-fetch overlay rows
  const supabase = await createClient()
  const eventKeys = Array.from(new Set(bound.map(b => b.eventKey)))
  const seriesIds = Array.from(new Set(
    bound
      .filter(b => b.raw.recurringEventId)
      .map(b => seriesOverlayId(b.provider, b.assignment.calendarId, b.raw.recurringEventId!))
  ))

  const [instanceRowsRes, seriesRowsRes] = await Promise.all([
    eventKeys.length
      ? supabase
          .from('event_instance_overlay')
          .select('event_key, attendee_person_ids, responsible_person_ids, offset_min')
          .eq('family_id', familyId)
          .in('event_key', eventKeys)
      : Promise.resolve({ data: [] }),
    seriesIds.length
      ? supabase
          .from('event_series_overlay')
          .select('recurring_event_id, attendee_person_ids, responsible_person_ids, default_offset_min')
          .eq('family_id', familyId)
          .in('recurring_event_id', seriesIds)
      : Promise.resolve({ data: [] }),
  ])

  type InstanceRow = { event_key: string; attendee_person_ids: string[]; responsible_person_ids: string[]; offset_min: number | null }
  type SeriesRow   = { recurring_event_id: string; attendee_person_ids: string[]; responsible_person_ids: string[]; default_offset_min: number | null }

  const instanceMap = new Map<string, InstanceRow>(
    ((instanceRowsRes.data ?? []) as InstanceRow[]).map(r => [r.event_key, r]),
  )
  const seriesMap = new Map<string, SeriesRow>(
    ((seriesRowsRes.data ?? []) as SeriesRow[]).map(r => [r.recurring_event_id, r]),
  )

  // Merge
  return bound.map(({ raw, assignment, provider, eventKey }): CalendarEvent => {
    const inst = instanceMap.get(eventKey)
    const seriesKey = raw.recurringEventId
      ? seriesOverlayId(provider, assignment.calendarId, raw.recurringEventId)
      : null
    const series = seriesKey ? seriesMap.get(seriesKey) : undefined

    const attendeePersonIds =
      inst?.attendee_person_ids?.length   ? inst.attendee_person_ids   :
      series?.attendee_person_ids?.length ? series.attendee_person_ids :
      [assignment.personId]

    const responsiblePersonIds =
      inst?.responsible_person_ids?.length   ? inst.responsible_person_ids   :
      series?.responsible_person_ids?.length ? series.responsible_person_ids :
      []

    const offsetMin =
      inst?.offset_min ?? series?.default_offset_min ?? null

    return {
      id:               raw.sourceId,
      title:            raw.title,
      start:            raw.start,
      end:              raw.end,
      allDay:           raw.allDay,
      location:         raw.location,
      calendarId:       assignment.calendarId,
      personId:         assignment.personId,
      personName:       personMap.get(assignment.personId)?.name ?? '',
      color:            assignment.color,
      recurringEventId: raw.recurringEventId,
      eventKey,
      attendeePersonIds,
      responsiblePersonIds,
      offsetMin,
    }
  })
}

export type { CalendarEvent } from '@/lib/supabase/types'
