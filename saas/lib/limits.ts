import type { Plan } from '@/lib/supabase/types'

/**
 * Plan tier limits + feature flags.
 * Enforced in API routes before DB writes — don't rely solely on DB constraints.
 */
export const PLAN_LIMITS: Record<Plan, {
  maxGoogleAccounts: number
  maxKids:           number
  historyDays:       number
  maxDevices:        number
  icsFeedsMax:       number
  /** Can receive any reminders at all? */
  emailReminders:    boolean
  /** Can receive web push reminders? */
  pushReminders:     boolean
  /** Can configure quiet hours to suppress reminders overnight? */
  quietHours:        boolean
  /** Can connect Microsoft Outlook calendars? */
  outlook:           boolean
  /** Can enable write-back privacy mode (Phase 5)? */
  writeBackReminders: boolean
  rewards:           boolean
}> = {
  free: {
    maxGoogleAccounts: 1,
    maxKids:           2,
    historyDays:       14,
    maxDevices:        1,
    icsFeedsMax:       0,
    emailReminders:    false,
    pushReminders:     false,
    quietHours:        false,
    outlook:           false,
    writeBackReminders: false,
    rewards:           false,
  },
  family: {
    maxGoogleAccounts: Infinity,
    maxKids:           Infinity,
    historyDays:       90,
    maxDevices:        5,
    icsFeedsMax:       1,
    emailReminders:    true,
    pushReminders:     false,
    quietHours:        false,
    outlook:           false,
    writeBackReminders: false,
    rewards:           false,
  },
  family_plus: {
    maxGoogleAccounts: Infinity,
    maxKids:           Infinity,
    historyDays:       90,
    maxDevices:        10,
    icsFeedsMax:       Infinity,
    emailReminders:    true,
    pushReminders:     true,
    quietHours:        true,
    outlook:           true,
    writeBackReminders: true,
    rewards:           true,
  },
}

export function getLimits(plan: Plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}
