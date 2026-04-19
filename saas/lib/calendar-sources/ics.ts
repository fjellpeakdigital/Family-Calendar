/**
 * ICS feed adapter. Polls a public (or private-but-URL-reachable)
 * iCalendar feed — the kind schools, sports teams, and SaaS tools
 * publish for subscription.
 *
 * No OAuth, no tokens; the calendarId itself is the URL. Reads are
 * cached for 15 minutes at the fetch layer so dashboard loads don't
 * re-download the feed on every request.
 *
 * node-ical is loaded lazily inside fetchRaw so the route module can
 * be evaluated by Next.js's build-time page-data collector without
 * triggering its module-load side effects (timezone table registration,
 * dynamic CommonJS requires).
 */

import type { CalendarSourceAdapter, RawEvent, SourceFetchContext } from './types'

// Minimal subset of node-ical's runtime types — kept here so we can
// type the runtime values without forcing the package to be imported
// statically. Mirrors @types/node-ical's VEvent and parseICS shapes.
interface IcalRRule {
  between(after: Date, before: Date, inclusive: boolean): Date[]
}

interface IcalVEvent {
  type: 'VEVENT'
  uid?:        string
  summary?:    string
  location?:   string
  start?:      Date
  end?:        Date
  rrule?:      IcalRRule
  recurrences?: Record<string, IcalVEvent>
  exdate?:     Record<string, unknown>
}

type IcalParsed = Record<string, unknown>

const FEED_TTL_SECONDS = 60 * 15
const MAX_ICS_BYTES    = 2 * 1024 * 1024    // 2 MB cap per feed

function toIso(d: Date): string {
  return d.toISOString()
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

    // Lazy-load node-ical so the build-time route analyzer never
    // executes its module-level setup (timezone registration, etc.).
    let parsed: IcalParsed
    try {
      const ical = (await import('node-ical')).default
      parsed = ical.sync.parseICS(text) as IcalParsed
    } catch {
      return []
    }

    const windowStart = new Date(ctx.timeMin).getTime()
    const windowEnd   = new Date(ctx.timeMax).getTime()
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) return []

    const out: RawEvent[] = []

    for (const value of Object.values(parsed)) {
      if (!value || typeof value !== 'object') continue
      const maybe = value as { type?: string }
      if (maybe.type !== 'VEVENT') continue
      const ev = value as IcalVEvent

      if (ev.rrule) {
        const overrides  = ev.recurrences ?? {}
        const exdateKeys = new Set(ev.exdate ? Object.keys(ev.exdate) : [])
        const occurrences = ev.rrule.between(
          new Date(windowStart - dur(ev)),
          new Date(windowEnd),
          true,
        )

        for (const occ of occurrences) {
          const key = dateKey(occ)
          if (exdateKeys.has(key)) continue

          const override  = overrides[key]
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

function dur(ev: IcalVEvent): number {
  if (!ev.start || !ev.end) return 3600_000
  return new Date(ev.end).getTime() - new Date(ev.start).getTime()
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toRaw(
  effective:     IcalVEvent,
  master:        IcalVEvent,
  instanceStart: Date,
  instanceEnd:   Date,
  isRecurring:   boolean,
): RawEvent {
  const dtStart = effective.start as (Date & { dateOnly?: boolean }) | undefined
  const allDay  = Boolean(dtStart && (dtStart as { dateOnly?: boolean }).dateOnly)

  return {
    sourceId:         effective.uid ?? `${master.uid ?? 'event'}-${dateKey(instanceStart)}`,
    title:            effective.summary ?? '(No title)',
    start:            toIso(instanceStart),
    end:              toIso(instanceEnd),
    allDay,
    location:         effective.location ?? null,
    recurringEventId: isRecurring ? (master.uid ?? null) : null,
    originalStart:    isRecurring ? toIso(instanceStart) : null,
  }
}
