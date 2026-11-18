/**
 * List of discovered accounts. Selecting one opens it in the chat panel.
 */

import type { AccountRecord } from '../api/types'

interface AccountListProps {
  accounts: AccountRecord[]
  selectedId: string | null
  onSelect: (account: AccountRecord) => void
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export function AccountList({ accounts, selectedId, onSelect }: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <section className="panel" aria-labelledby="accounts-heading">
        <h2 id="accounts-heading">Accounts</h2>
        <div className="empty">No accounts yet. Run a search to discover talent on X.</div>
      </section>
    )
  }

  return (
    <section className="panel" aria-labelledby="accounts-heading">
      <h2 id="accounts-heading">Accounts ({accounts.length})</h2>
      <div className="account-list">
        {accounts.map((account) => {
          const selected = account.x_user_id === selectedId
          return (
            <div
              key={account.x_user_id}
              className={`account-card${selected ? ' selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(account)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(account)
                }
              }}
            >
              <div className="name">
                <span>
                  {account.display_name || account.username}
                  {account.verified ? ' ✓' : ''}
                </span>
                {account.bot_verdict === 'human' && <span className="badge ok">human</span>}
                {account.bot_verdict === 'likely_bot' && <span className="badge err">bot</span>}
                {account.segment_tags.includes('known_human') && (
                  <span className="badge ok">known human</span>
                )}
              </div>
              <div className="handle">@{account.username}</div>
              {account.bio && <div className="bio">{account.bio}</div>}
              <div className="account-meta">
                <span>{formatCount(account.followers_count)} followers</span>
                <span>{formatCount(account.tweets_count)} posts</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
