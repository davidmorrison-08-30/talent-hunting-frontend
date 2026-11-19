/**
 * Chat panel for a selected account.
 *
 * Shows the key information the discovery agent extracted, lets the operator
 * ask for a grounded draft, review it against its citations, then approve or
 * deny it. There is no global approval queue: the panel holds the one draft
 * the account is waiting on, and the operator approves it here. Nothing is
 * sent without an explicit approval.
 *
 * The conversation is the full exchange with that account — the messages the
 * operator sent and the ones the recipient wrote — and it takes up a fixed
 * quarter of the panel's height with a scrollbar for when it does not fit.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  approveDraft,
  conversation,
  createDraft,
  denyDraft,
  getCurrentDraft,
} from '../api/client'
import type { AccountRecord, ConversationEvent, DraftResponse } from '../api/types'

interface ChatPanelProps {
  account: AccountRecord | null
  /**
   * Called whenever the draft the panel is holding changes, so the parent
   * can discard it when the operator moves to a different account.
   */
  onDraftChange: (draftId: string | null) => void
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'SENT':
      return 'badge ok'
    case 'PENDING_APPROVAL':
      return 'badge warn'
    case 'BLOCKED':
    case 'FAILED':
      return 'badge err'
    default:
      return 'badge'
  }
}

export function ChatPanel({ account, onDraftChange }: ChatPanelProps) {
  if (!account) {
    return (
      <section className="panel panel-chat" aria-labelledby="chat-heading">
        <h2 id="chat-heading">Chat</h2>
        <div className="empty">Select an account from the list to start a conversation.</div>
      </section>
    )
  }

  // Keying on the account id remounts the inner panel whenever the selection
  // changes, which resets the draft state without a setState-in-effect cycle.
  return (
    <ChatPanelInner
      key={account.x_user_id}
      account={account}
      onDraftChange={onDraftChange}
    />
  )
}

function ChatPanelInner({
  account,
  onDraftChange,
}: {
  account: AccountRecord
  onDraftChange: (draftId: string | null) => void
}) {
  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState('concise and warm')
  const [draft, setDraft] = useState<DraftResponse | null>(null)
  const [events, setEvents] = useState<ConversationEvent[]>([])
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The conversation lives on the server, so it is loaded here.
  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const rows = await conversation(account.x_user_id)
        if (!ignore) {
          setEvents(rows)
        }
      } catch {
        // A missing conversation is not an error worth surfacing.
        if (!ignore) {
          setEvents([])
        }
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [account.x_user_id])

  // The account's one pending draft is loaded alongside the conversation, so
  // a draft the operator created earlier is still there after a refresh or
  // after switching back to the account.
  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const current = await getCurrentDraft(account.x_user_id)
        if (!ignore) {
          setDraft(current)
        }
      } catch (cause) {
        // No draft for this account is the normal case, not a failure.
        if (!ignore) {
          setDraft(null)
          if (cause instanceof ApiError && cause.status !== 404) {
            setError(cause.message)
          }
        }
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [account.x_user_id])

  const loadConversation = useCallback(async () => {
    try {
      setEvents(await conversation(account.x_user_id))
    } catch {
      // A missing conversation is not an error worth surfacing.
      setEvents([])
    }
  }, [account.x_user_id])

  // The parent needs to know which draft is waiting, so it can discard it
  // when the operator moves to another account.
  useEffect(() => {
    onDraftChange(draft?.id ?? null)
  }, [draft?.id, onDraftChange])

  const handleDraft = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const created = await createDraft({
        x_user_id: account.x_user_id,
        goal,
        tone,
        is_reply: false,
      })
      setDraft(created)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleApprove = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await approveDraft(draft.id)
      setDraft(null)
      setNotice(
        result.status === 'SENT'
          ? `Message sent to @${draft.handle ?? account.username}.`
          : `Message ${result.status.toLowerCase()}.`,
      )
      void loadConversation()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleDeny = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft || !feedback.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const revised = await denyDraft(draft.id, feedback.trim())
      setDraft(revised)
      setFeedback('')
      setNotice('Draft revised with your feedback. Review it again.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const latest = draft?.draft_versions.length ? draft.draft_versions[draft.draft_versions.length - 1] : null
  const info = account.key_information

  return (
    <section className="panel panel-chat" aria-labelledby="chat-heading">
      <h2 id="chat-heading">Chat</h2>

      <div className="chat-scroll">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>
            {account.display_name || account.username}{' '}
            <span style={{ color: 'var(--text-dim)' }}>@{account.username}</span>
          </div>
          {account.bio && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{account.bio}</div>
          )}
          <div className="tag-list" style={{ marginTop: 8 }}>
            {info.occupation && <span className="tag">{info.occupation}</span>}
            {info.specializations.slice(0, 4).map((item) => (
              <span className="tag" key={item}>
                {item}
              </span>
            ))}
            {info.interests.slice(0, 3).map((item) => (
              <span className="tag" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && <div className="alert success">{notice}</div>}

        <form onSubmit={handleDraft}>
          <div className="field">
            <label htmlFor="goal">Goal</label>
            <input
              id="goal"
              type="text"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Invite them to a robotics meetup in SEA"
            />
          </div>
          <div className="field">
            <label htmlFor="tone">Tone</label>
            <input
              id="tone"
              type="text"
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              placeholder="concise and warm"
            />
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? <span className="spinner" /> : null} Draft a message
          </button>
        </form>

        {draft && (
          <div className="evidence-block">
            <h3>Draft (v{draft.draft_versions.length})</h3>
            <div className="button-row" style={{ marginBottom: 10 }}>
              <span className={statusBadgeClass(draft.status)}>{draft.status}</span>
            </div>

            <div className="draft-text">{latest?.text || '(empty draft)'}</div>

            {latest?.citations && latest.citations.length > 0 && (
              <>
                <h3 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Evidence used
                </h3>
                <ul className="citations">
                  {latest.citations.map((citation, index) => (
                    <li key={`${citation.post_id}-${index}`}>
                      {citation.url ? (
                        <a href={citation.url} target="_blank" rel="noreferrer">
                          {citation.quote || citation.url}
                        </a>
                      ) : (
                        (citation.quote || citation.supports || 'evidence')
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {draft.status === 'PENDING_APPROVAL' && (
              <>
                <div className="button-row">
                  <button
                    type="button"
                    className="success"
                    onClick={() => void handleApprove()}
                    disabled={busy}
                  >
                    Approve &amp; send
                  </button>
                </div>

                <form onSubmit={handleDeny} style={{ marginTop: 10 }}>
                  <div className="field">
                    <label htmlFor="feedback">Deny with feedback</label>
                    <input
                      id="feedback"
                      type="text"
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      placeholder="Too formal, mention their open-source work"
                    />
                  </div>
                  <button type="submit" disabled={busy || !feedback.trim()}>
                    Deny &amp; revise
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <ConversationSection events={events} />
    </section>
  )
}

/**
 * The full conversation with the selected account.
 *
 * It takes up a fixed quarter of the panel's height and scrolls when the
 * exchange does not fit, so a long thread never pushes the draft out of
 * reach.
 */
function ConversationSection({ events }: { events: ConversationEvent[] }) {
  const scroller = useRef<HTMLDivElement>(null)

  // A new message should be visible without scrolling, so the view follows
  // the end of the thread whenever it changes.
  useEffect(() => {
    const element = scroller.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [events])

  return (
    <div className="conversation-block">
      <h3>Conversation</h3>
      {events.length === 0 ? (
        <div className="empty">No messages exchanged yet.</div>
      ) : (
        <div className="conversation" ref={scroller} tabIndex={0} role="log" aria-label="Conversation history">
          {events.map((event) => (
            <div
              className={event.outbound ? 'message outbound' : 'message inbound'}
              key={event.id}
            >
              <div className="who">{event.outbound ? 'You' : `@${accountHandle(event)}`}</div>
              <div>{event.text ?? ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The recipient's handle, derived from the sender id when it is unknown. */
function accountHandle(event: ConversationEvent): string {
  return event.sender_id ?? 'unknown'
}
