/**
 * Talent Hunting web app.
 *
 * Three-column layout:
 *   left   - X account connection + discovery search
 *   middle - discovered accounts
 *   right  - chat with the selected account
 *
 * The approval queue sits under the search column, because it is where the
 * human-in-the-loop work happens.
 */

import { useCallback, useEffect, useState } from 'react'
import { AccountList } from './components/AccountList'
import { AuthPanel } from './components/AuthPanel'
import { ChatPanel } from './components/ChatPanel'
import { QueuePanel } from './components/QueuePanel'
import { SearchPanel } from './components/SearchPanel'
import { ApiError, authStatus, listAccounts } from './api/client'
import type { AccountRecord, DiscoveryRunSummary, DraftResponse, OAuthStatus } from './api/types'

const TITLE = 'AN APP TO HELP TA TEAM REACH OUT TO TALENTS ON X'

export default function App() {
  const [status, setStatus] = useState<OAuthStatus | null>(null)
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [selected, setSelected] = useState<AccountRecord | null>(null)
  const [queueKey, setQueueKey] = useState(0)
  const [lastRun, setLastRun] = useState<DiscoveryRunSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const connected = status?.connected ?? false

  const refreshAccounts = useCallback(async () => {
    try {
      const rows = await listAccounts(50)
      setAccounts(rows)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    }
  }, [])

  // Initial load: connection status and whatever discovery already found.
  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const next = await authStatus()
        if (!ignore) {
          setStatus(next)
        }
        if (next.connected) {
          await refreshAccounts()
        }
      } catch (cause) {
        if (!ignore) {
          setError(cause instanceof ApiError ? cause.message : String(cause))
        }
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [refreshAccounts])

  const handleResults = (run: DiscoveryRunSummary) => {
    setLastRun(run)
    setError(null)
    // The canonical list lives on the server; re-read it so the middle
    // column reflects exactly what the backend stored.
    void refreshAccounts()
  }

  // A new search removes the previous accounts from the server, so the chat
  // panel is emptied as soon as the search starts rather than when it ends.
  const handleSearchStarted = () => {
    setSelected(null)
  }

  const handleSelectDraft = (draft: DraftResponse) => {
    const match = accounts.find((account) => account.x_user_id === draft.x_user_id)
    if (match) {
      setSelected(match)
    }
  }

  const refreshQueue = () => setQueueKey((key) => key + 1)

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>{TITLE}</h1>
          <p className="subtitle">
            Find real people on X, review evidence-backed drafts, and reach out with human approval.
          </p>
        </div>
        <div className="header-actions">
          {connected ? (
            <span className="badge ok">● X connected</span>
          ) : (
            <span className="badge warn">● X not connected</span>
          )}
          <span className="badge">{accounts.length} accounts</span>
        </div>
      </header>

      <main className="app-main">
        <div>
          <AuthPanel status={status} onStatusChange={setStatus} />
          <SearchPanel
            onRunComplete={handleResults}
            onSearchStarted={handleSearchStarted}
            disabled={!connected}
          />
          <QueuePanel refreshKey={queueKey} onSelectDraft={handleSelectDraft} />
        </div>

        <div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          {lastRun && (
            <section className="panel">
              <h2>Last run</h2>
              <div className="account-meta" style={{ marginBottom: 8 }}>
                <span>{Number(lastRun.stats.candidates ?? 0)} candidates</span>
                <span>{Number(lastRun.stats.bots_filtered ?? 0)} bots filtered</span>
                <span>{Number(lastRun.stats.returned ?? 0)} returned</span>
                <span>${Number(lastRun.stats.estimated_cost_usd ?? 0).toFixed(4)}</span>
                {Number(lastRun.stats.humans_bypassed ?? 0) > 0 && (
                  <span>{Number(lastRun.stats.humans_bypassed)} known humans</span>
                )}
              </div>
              {lastRun.target_segment.length > 0 && (
                <div className="account-meta" style={{ marginBottom: 8 }}>
                  <span>segment: {lastRun.target_segment.join(', ')}</span>
                </div>
              )}
              {typeof lastRun.stats.warnings === 'string' && (
                <div className="alert info">{lastRun.stats.warnings}</div>
              )}
              {Array.isArray(lastRun.stats.warnings) && (
                <div className="alert info">
                  {(lastRun.stats.warnings as string[]).map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}
            </section>
          )}

          <AccountList accounts={accounts} selectedId={selected?.x_user_id ?? null} onSelect={setSelected} />
        </div>

        <div>
          <ChatPanel account={selected} onQueueChanged={refreshQueue} />
        </div>
      </main>
    </div>
  )
}