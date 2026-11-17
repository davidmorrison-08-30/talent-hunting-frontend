/**
 * PKCE connection panel.
 *
 * Drives the whole OAuth 2.0 PKCE user-context flow:
 *   1. "Connect" asks the backend for an authorization URL.
 *   2. The operator opens that URL and authorizes the human account on X.
 *   3. X redirects back; the operator then refreshes the status.
 */

import { useCallback, useEffect, useState } from 'react'
import { ApiError, authStatus, disconnect, startAuth } from '../api/client'
import type { OAuthStatus } from '../api/types'

interface AuthPanelProps {
  status: OAuthStatus | null
  onStatusChange: (status: OAuthStatus) => void
}

export function AuthPanel({ status, onStatusChange }: AuthPanelProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const refreshStatus = useCallback(async () => {
    setChecking(true)
    try {
      const next = await authStatus()
      onStatusChange(next)
      if (next.connected) {
        setAuthorizationUrl(null)
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setChecking(false)
    }
  }, [onStatusChange])

  // Poll the status once the operator has been sent to X, so the panel
  // reflects the connected account when they come back.
  useEffect(() => {
    if (!authorizationUrl) {
      return
    }
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [authorizationUrl, refreshStatus])

  const handleConnect = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await startAuth()
      setAuthorizationUrl(result.authorization_url)
      window.open(result.authorization_url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await disconnect()
      onStatusChange({ connected: false })
      setAuthorizationUrl(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const connected = status?.connected ?? false

  return (
    <section className="panel" aria-labelledby="auth-heading">
      <h2 id="auth-heading">X Account</h2>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <div className="button-row" style={{ marginBottom: 12 }}>
        {connected ? (
          <span className="badge ok">● Connected</span>
        ) : (
          <span className="badge warn">● Not connected</span>
        )}
        {status?.x_user_id && <span className="badge">{status.x_user_id}</span>}
      </div>

      {connected && status?.scopes && status.scopes.length > 0 && (
        <div className="tag-list" style={{ marginBottom: 12 }}>
          {status.scopes.map((scope) => (
            <span className="tag" key={scope}>
              {scope}
            </span>
          ))}
        </div>
      )}

      <div className="button-row">
        <button
          type="button"
          className="primary"
          onClick={handleConnect}
          disabled={busy || connected}
        >
          {busy ? <span className="spinner" /> : null} Connect X account
        </button>

        <button type="button" onClick={() => void refreshStatus()} disabled={checking}>
          {checking ? <span className="spinner" /> : null} Refresh status
        </button>

        <button
          type="button"
          className="danger"
          onClick={() => void handleDisconnect()}
          disabled={busy || !connected}
        >
          Disconnect
        </button>
      </div>

      {authorizationUrl && (
        <div className="alert info" style={{ marginTop: 12 }}>
          <strong>Authorize in X.</strong> The window opened automatically; if it did not, use
          this link and then press <em>Refresh status</em>.
          <br />
          <a className="auth-url" href={authorizationUrl} target="_blank" rel="noreferrer">
            {authorizationUrl}
          </a>
        </div>
      )}
    </section>
  )
}
