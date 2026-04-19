/**
 * Shared types for the calendar source abstraction. Each provider
 * (google, ics, microsoft, ...) implements a thin adapter that returns
 * RawEvents. The dispatcher in ./index.ts merges overlay data and
 * returns the unified CalendarEvent shape used by the rest of the app.
 */

import type { CalAssignment, CalendarSourceProvider } from '@/lib/supabase/types'

/**
 * Raw event shape returned by any provider adapter. Does NOT carry
 * attendee or responsibility metadata — that's layered on by the
 * dispatcher via the overlay tables.
 */
export interface RawEvent {
  /** Provider-native event id. Not necessarily globally unique. */
  sourceId:          string
  title:             string
  start:             string     // ISO datetime or date
  end:               string
  allDay:            boolean
  location:          string | null
  /** If this is an instance of a recurring series, the id of the series;
   *  else null. Drives overlay series lookups. */
  recurringEventId:  string | null
  /** Original scheduled start of this instance — used for a stable
   *  event_key on recurring events that get edited. */
  originalStart:     string | null
}

export interface SourceFetchContext {
  familyId:  string
  timeMin:   string            // ISO lower bound
  timeMax:   string            // ISO upper bound
  /** The assignment currently being fetched. Adapters may read their
   *  provider-specific fields (calendarId, accountEmail, etc.). */
  assignment: CalAssignment
}

export interface CalendarSourceAdapter {
  provider: CalendarSourceProvider
  /** Fetch raw events for a single assignment within the given window.
   *  Should throw on unrecoverable errors; individual calendar failures
   *  are caught and isolated by the dispatcher. */
  fetchRaw(ctx: SourceFetchContext): Promise<RawEvent[]>
}

/**
 * Compute the stable overlay lookup key for a raw event.
 *
 * Google keys stay unprefixed so overlay rows created before the
 * source-abstraction refactor keep matching. Other providers get a
 * namespaced prefix plus the assignment's calendarId (necessary for
 * ICS because feed UIDs aren't globally unique across feeds).
 *
 *   google raw        → '<sourceId>'
 *   google recurring  → '<recurringId>|<originalStart>'
 *   ics raw           → 'ics:<calendarId>:<sourceId>'
 *   ics recurring     → 'ics:<calendarId>:<recurringId>|<originalStart>'
 */
export function computeEventKey(
  provider: CalendarSourceProvider,
  calendarId: string,
  ev: RawEvent,
): string {
  const core = ev.recurringEventId
    ? `${ev.recurringEventId}|${ev.originalStart ?? ev.start}`
    : ev.sourceId

  if (provider === 'google') return core
  return `${provider}:${calendarId}:${core}`
}

export function assignmentProvider(a: CalAssignment): CalendarSourceProvider {
  return a.provider ?? 'google'
}

/**
 * Namespaced identifier for a recurring series used against
 * event_series_overlay.recurring_event_id. Same prefixing rule as
 * computeEventKey to keep Google overlay rows unchanged.
 */
export function seriesOverlayId(
  provider: CalendarSourceProvider,
  calendarId: string,
  recurringEventId: string,
): string {
  if (provider === 'google') return recurringEventId
  return `${provider}:${calendarId}:${recurringEventId}`
}
