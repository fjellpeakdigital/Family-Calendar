/**
 * ICS feed adapter. Polls a public (or private-but-URL-reachable)
 * iCalendar feed — the kind schools, sports teams, and SaaS tools
 * publish for subscription.
 *
 * No OAuth, no tokens; the calendarId itself is the URL. Reads are
 * cached for 15 minutes at the fetch layer so dashboard loads don't
 * re-download the feed on every request.
 */

import ical from 'node-ical'
import type { CalendarSourceAdapter, RawEvent, SourceFetchContext } from './types'

const FEED_TTL_SECONDS = 60 * 15
const MAX_ICS_BYTES    = 2 * 1024 * 1024    // 2 MB cap per feed

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

async function fetchFeed(url: string): Promise<string | null> {
  const resp = await fetch(url, {
    // Next.js fetch cache lets per-URL responses be reused across
    // requests for the TTL window. Per-family isolation is still
    // guaranteed because the URL is the cache key.
    next: { revalidate: FEED_TTL_SECONDS },
    headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
  })
  if (!resp.ok) return null

  // Cap payload so a pathological feed can't exhaust memory
  const buf = await resp.arrayBuffer()
  if (buf.byteLength > MAX_ICS_BYTES) return null
  return new TextDecoder().decode(buf)
}

export const icsAdapter: CalendarSourceAdapter = {
  provider: 'ics',

  async fetchRaw(ctx: SourceFetchContext): Promise<RawEvent[]> {
    const url = ctx.assignment.calendarId
    if (!url || !/^https?:\/\//i.test(url)) return []

    let text: string | null
    try {
      text = await fetchFeed(url)
    } catch {
      return []
    }
    if (!text) return []

    let parsed: ical.CalendarResponse
    try {
      parsed = ical.sync.parseICS(text)
    } catch {
      return []
    }

    const windowStart = new Date(ctx.timeMin).getTime()
    const windowEnd   = new Date(ctx.timeMax).getTime()
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) return []

    const out: RawEvent[] = []

    for (const value of Object.values(parsed)) {
      if (!value || typeof value !== 'object' || value.type !== 'VEVENT') continue
      const ev = value as ical.VEvent

      if (ev.rrule) {
        // Expand the rule inside our window, then overlay any overrides.
        const overrides = ev.recurrences ?? {}
        const exdateKeys = new Set(ev.exdate ? Object.keys(ev.exdate as object) : [])
        const occurrences = ev.rrule.between(
          new Date(windowStart - dur(ev)),   // catch instances that started before the window but still overlap
          new Date(windowEnd),
          true,
        )

        for (const occ of occurrences) {
          const key = dateKey(occ)
          if (exdateKeys.has(key)) continue

          const override  = (overrides as Record<string, ical.VEvent>)[key]
          const effective = override ?? ev
          const instanceStart: Date =
            override?.start ? new Date(override.start) : occ
          const overrideEnd: Date | null =
            override?.end ? new Date(override.end) : null
          const instanceEnd: Date =
            overrideEnd ?? new Date(occ.getTime() + dur(ev))

          if (instanceStart.getTime() >= windowEnd)   continue
          if (instanceEnd.getTime()   <= windowStart) continue

          out.push(toRaw(effective, ev, instanceStart, instanceEnd, true))
        }
      } else {
        if (!ev.start || !ev.end) continue
        const s = new Date(ev.start).getTime()
        const e = new Date(ev.end).getTime()
        if (Number.isNaN(s) || Number.isNaN(e)) continue
        if (s >= windowEnd || e <= windowStart) continue

        out.push(toRaw(ev, ev, ev.start, ev.end, false))
      }
    }

    return out
  },
}

// Duration of the master event (fallback when override doesn't supply one).
function dur(ev: ical.VEvent): number {
  if (!ev.start || !ev.end) return 3600_000
  return new Date(ev.end).getTime() - new Date(ev.start).getTime()
}

function dateKey(d: Date): string {
  // node-ical keys overrides/exceptions by YYYY-MM-DD of the original start.
  return d.toISOString().slice(0, 10)
}

function toRaw(
  effective:     ical.VEvent,
  master:        ical.VEvent,
  instanceStart: Date,
  instanceEnd:   Date,
  isRecurring:   boolean,
): RawEvent {
  const dtStart = effective.start as (Date & { dateOnly?: boolean }) | Date
  const allDay = Boolean((dtStart as { dateOnly?: boolean }).dateOnly)

  return {
    sourceId:         effective.uid ?? `${master.uid}-${dateKey(instanceStart)}`,
    title:            (effective.summary as string | undefined) ?? '(No title)',
    start:            toIso(instanceStart),
    end:              toIso(instanceEnd),
    allDay,
    location:         (effective.location as string | undefined) ?? null,
    recurringEventId: isRecurring ? (master.uid ?? null) : null,
    originalStart:    isRecurring ? toIso(instanceStart) : null,
  }
}
