/**
 * Back-compat shim. The real implementation moved to
 * lib/calendar-sources/ as part of Phase 4 so ICS, Outlook, and other
 * providers can plug in behind a shared dispatcher.
 */

export { fetchFamilyEvents } from './calendar-sources'
export type { CalendarEvent } from '@/lib/supabase/types'
