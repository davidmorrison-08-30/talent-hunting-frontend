/**
 * The human approval queue: every draft still waiting for a decision.
 */

import { useEffect, useState } from 'react'
import { ApiError, approvalQueue } from '../api/client'
import type { DraftResponse } from '../api/types'

interface QueuePanelProps {
  refreshKey: number
  onSelectDraft: (draft: DraftResponse) => void
}

export function QueuePanel({ refreshKey, onSelectDraft }: QueuePanelProps) {
  const [queue, setQueue] = useState<DraftResponse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const drafts = await approvalQueue()
        if (!ignore) {
          setQueue(drafts)
          setError(null)
        }
      } catch (cause) {
        if (!ignore) {
          setError(cause instanceof ApiError ? cause.message : String(cause))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [refreshKey])

  return (
    <section className="panel" aria-labelledby="queue-heading">
      <h2 id="queue-heading">Approval queue ({queue.length})</h2>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty">
          <span className="spinner" /> Loading…
        </div>
      ) : queue.length === 0 ? (
        <div className="empty">Nothing is waiting for a decision.</div>
      ) : (
        queue.map((draft) => {
          const latest = draft.draft_versions[draft.draft_versions.length - 1]
          return (
            <div className="queue-item" key={draft.id}>
              <div className="meta">
                <strong>@{draft.handle ?? draft.x_user_id}</strong>
                <span className="badge warn">{draft.status}</span>
              </div>
              <div className="snippet">{latest?.text ?? '(no text)'}</div>
              <div className="button-row" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => onSelectDraft(draft)}>
                  Review
                </button>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
