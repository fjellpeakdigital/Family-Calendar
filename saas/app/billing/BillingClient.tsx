'use client'

import { useState } from 'react'
import { PLAN_DETAILS, type PlanId, type BillingInterval } from '@/lib/stripe'
import type { Plan } from '@/lib/supabase/types'

interface Props {
  currentPlan: Plan
  hasStripeCustomer: boolean
  successMessage: string | null
  cancelMessage: string | null
}

export default function BillingClient({ currentPlan, hasStripeCustomer, successMessage, cancelMessage }: Props) {
  const [interval, setInterval]   = useState<BillingInterval>('yearly')
  const [loading, setLoading]     = useState<string | null>(null)

  async function startCheckout(plan: PlanId) {
    setLoading(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  async function openPortal() {
    setLoading('portal')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="mb-10 text-center">
          <a href="/dashboard" className="mb-6 inline-block text-sm text-gray-500 hover:text-gray-300">
            ← Back to dashboard
          </a>
          <h1 className="text-3xl font-bold">Plans &amp; Billing</h1>
          <p className="mt-2 text-gray-400">Simple pricing. Cancel any time.</p>
        </div>

        {/* Toast messages */}
        {successMessage && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-3 text-center text-sm text-green-400">
            ✓ {successMessage}
          </div>
        )}
        {cancelMessage && (
          <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-5 py-3 text-center text-sm text-yellow-400">
            {cancelMessage}
          </div>
        )}

        {/* Interval toggle */}
        <div className="mb-8 flex justify-center">
          <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(['monthly', 'yearly'] as BillingInterval[]).map(i => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`rounded-lg px-5 py-1.5 text-sm font-semibold transition-all ${
                  interval === i
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {i === 'monthly' ? 'Monthly' : 'Yearly'}
                {i === 'yearly' && (
                  <span className="ml-1.5 rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs text-green-400">
                    Save ~20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {(['free', 'family', 'family_plus'] as Plan[]).map(planId => {
            const details   = PLAN_DETAILS[planId]
            const isCurrent = currentPlan === planId
            const price     = interval === 'yearly'
              ? details.price.yearly
              : details.price.monthly

            return (
              <div
                key={planId}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                  isCurrent
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : planId === 'family'
                    ? 'border-white/20 bg-white/5'
                    : 'border-white/10 bg-white/3'
                }`}
              >
                {planId === 'family' && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-3 py-0.5 text-xs font-bold text-white">
                    Most Popular
                  </div>
                )}

                <div className="mb-4">
                  <h2 className="text-lg font-bold">{details.name}</h2>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-bold">
                      {price === 0 ? 'Free' : `$${price}`}
                    </span>
                    {price > 0 && (
                      <span className="mb-1 text-sm text-gray-500">
                        /{interval === 'yearly' ? 'yr' : 'mo'}
                      </span>
                    )}
                  </div>
                  {price > 0 && interval === 'yearly' && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      ${(price / 12).toFixed(2)}/mo billed annually
                    </p>
                  )}
                </div>

                <ul className="mb-6 flex-1 space-y-2">
                  {details.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="mt-0.5 text-green-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 py-2 text-center text-sm font-semibold text-blue-400">
                    Current plan
                  </div>
                ) : planId === 'free' ? (
                  <div className="rounded-xl border border-white/10 py-2 text-center text-sm text-gray-600">
                    Default
                  </div>
                ) : (
                  <button
                    onClick={() => startCheckout(planId as PlanId)}
                    disabled={loading === planId}
                    className="rounded-xl bg-blue-500 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50"
                  >
                    {loading === planId ? 'Redirecting…' : `Upgrade to ${details.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Manage existing subscription */}
        {hasStripeCustomer && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-1 font-semibold">Manage your subscription</h3>
            <p className="mb-4 text-sm text-gray-400">
              Update payment method, view invoices, or cancel your subscription.
            </p>
            <button
              onClick={openPortal}
              disabled={loading === 'portal'}
              className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
            >
              {loading === 'portal' ? 'Opening portal…' : 'Open billing portal →'}
            </button>
          </div>
        )}

        {/* Privacy note */}
        <p className="mt-8 text-center text-xs text-gray-600">
          Payments processed by Stripe. We never store your card details.
          <br />
          Cancel any time — no questions asked.
        </p>
      </div>
    </div>
  )
}
