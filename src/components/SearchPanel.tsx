/**
 * Discovery search panel.
 *
 * Collects the target segment and/or seed accounts and kicks off
 * `POST /api/v1/discovery/search`.
 */

import { useState } from 'react'
import { ApiError, MINIMAL_DISCOVERY_LIMITS, searchDiscovery } from '../api/client'
import type { DiscoveryResponse } from '../api/types'

interface SearchPanelProps {
  onResults: (response: DiscoveryResponse) => void
  disabled: boolean
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function SearchPanel({ onResults, disabled }: SearchPanelProps) {
  const [segment, setSegment] = useState('')
  const [seeds, setSeeds] = useState('')
  const [maxAccounts, setMaxAccounts] = useState(MINIMAL_DISCOVERY_LIMITS.max_accounts)
  const [maxCandidates, setMaxCandidates] = useState(MINIMAL_DISCOVERY_LIMITS.max_candidates)
  const [maxPosts, setMaxPosts] = useState(MINIMAL_DISCOVERY_LIMITS.max_posts_per_account)
  const [includeBots, setIncludeBots] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const targetSegment = parseList(segment)
    const seedAccounts = parseList(seeds)

    if (targetSegment.length === 0 && seedAccounts.length === 0) {
      setError('Provide at least one target segment keyword or one seed account.')
      return
    }

    setBusy(true)
    try {
      const response = await searchDiscovery({
        target_segment: targetSegment,
        seed_accounts: seedAccounts,
        max_accounts: maxAccounts,
        max_candidates: maxCandidates,
        max_posts_per_account: maxPosts,
        include_bots: includeBots,
      })
      onResults(response)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="search-heading">
      <h2 id="search-heading">Find Talent</h2>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="segment">Target segment</label>
          <textarea
            id="segment"
            value={segment}
            onChange={(event) => setSegment(event.target.value)}
            placeholder="robotics engineer, embodied AI"
            disabled={disabled}
          />
          <div className="hint">Separate multiple keywords with commas or new lines.</div>
        </div>

        <div className="field">
          <label htmlFor="seeds">Seed accounts</label>
          <textarea
            id="seeds"
            value={seeds}
            onChange={(event) => setSeeds(event.target.value)}
            placeholder="https://x.com/someone"
            disabled={disabled}
          />
          <div className="hint">X profile URLs. Their posts are analysed to refine the segment.</div>
        </div>

        <div className="field">
          <div className="field-row">
            <div>
              <label htmlFor="max-accounts">Max accounts</label>
              <input
                id="max-accounts"
                type="number"
                min={1}
                max={200}
                value={maxAccounts}
                onChange={(event) => setMaxAccounts(Number(event.target.value))}
                disabled={disabled}
              />
            </div>
            <div>
              <label htmlFor="include-bots">Bots</label>
              <select
                id="include-bots"
                value={includeBots ? 'include' : 'exclude'}
                onChange={(event) => setIncludeBots(event.target.value === 'include')}
                disabled={disabled}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                  padding: '8px 10px',
                }}
              >
                <option value="exclude">Filter out</option>
                <option value="include">Include</option>
              </select>
            </div>
          </div>
        </div>

        <details className="field">
          <summary>Budget limits</summary>
          <div className="hint">
            These bound how much of the X API budget one run may spend. Keep them
            low while testing.
          </div>
          <div className="field-row">
            <div>
              <label htmlFor="max-candidates">Max candidates</label>
              <input
                id="max-candidates"
                type="number"
                min={1}
                max={500}
                value={maxCandidates}
                onChange={(event) => setMaxCandidates(Number(event.target.value))}
                disabled={disabled}
              />
            </div>
            <div>
              <label htmlFor="max-posts">Max posts per account</label>
              <input
                id="max-posts"
                type="number"
                min={0}
                max={100}
                value={maxPosts}
                onChange={(event) => setMaxPosts(Number(event.target.value))}
                disabled={disabled}
              />
            </div>
          </div>
        </details>

        <button type="submit" className="primary" disabled={busy || disabled}>
          {busy ? <span className="spinner" /> : null} Search accounts
        </button>
        {disabled && <div className="hint">Connect an X account first.</div>}
      </form>
    </section>
  )
}
