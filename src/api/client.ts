/**
 * Thin API client for the Talent Hunting backend.
 *
 * All requests go to the BFF (Lambda behind API Gateway), never straight to
 * the ECS backend. The base URL is injected at build time through
 * `VITE_API_BASE_URL`; in local development it falls back to the Vite dev
 * server proxy defined in `vite.config.ts`.
 */

import type {
  AccountRecord,
  ApiErrorBody,
  ConversationEvent,
  DiscoveryResponse,
  DraftResponse,
  OAuthStartResponse,
  OAuthStatus,
  SendResult,
} from './types'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** Error carrying the backend's structured error envelope. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch (cause) {
    throw new ApiError(0, 'network_error', `Could not reach the API: ${String(cause)}`)
  }

  if (!response.ok) {
    let code = 'http_error'
    let message = `Request failed with status ${response.status}`
    let details: Record<string, unknown> = {}
    try {
      const body = (await response.json()) as ApiErrorBody
      if (body?.error) {
        code = body.error.code
        message = body.error.message
        details = body.error.details ?? {}
      }
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(response.status, code, message, details)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

// --- OAuth / PKCE ---------------------------------------------------------

/** Start the PKCE flow and return the X authorization URL to open. */
export function startAuth(): Promise<OAuthStartResponse> {
  return apiFetch<OAuthStartResponse>('/auth/x/start')
}

/** Report whether a usable X token is stored. */
export function authStatus(): Promise<OAuthStatus> {
  return apiFetch<OAuthStatus>('/auth/x/status')
}

/** Delete the stored X token. */
export function disconnect(): Promise<{ detail?: string }> {
  return apiFetch<{ detail?: string }>('/auth/x/disconnect')
}

// --- Discovery ------------------------------------------------------------

export interface SearchRequest {
  target_segment: string[]
  seed_accounts: string[]
  max_accounts: number
  max_candidates?: number
  max_posts_per_account?: number
  include_bots?: boolean
  bot_score_threshold?: number
}

/** Run a discovery search for accounts matching a segment and/or seeds. */
export function searchDiscovery(request: SearchRequest): Promise<DiscoveryResponse> {
  return apiFetch<DiscoveryResponse>('/api/v1/discovery/search', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/** List accounts found by previous discovery runs. */
export function listAccounts(limit = 50): Promise<AccountRecord[]> {
  return apiFetch<AccountRecord[]>(`/api/v1/discovery/accounts?limit=${limit}`)
}

// --- Outreach -------------------------------------------------------------

export interface DraftPayload {
  x_user_id: string
  goal: string
  tone: string
  is_reply?: boolean
}

/** Draft a personalized DM and park it in PENDING_APPROVAL. */
export function createDraft(request: DraftPayload): Promise<DraftResponse> {
  return apiFetch<DraftResponse>('/api/v1/outreach/drafts', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/** Every draft awaiting a human decision. */
export function approvalQueue(): Promise<DraftResponse[]> {
  return apiFetch<DraftResponse[]>('/api/v1/outreach/queue')
}

/** Approve a draft and send it. */
export function approveDraft(recordId: string, dispatch: 'blocking' | 'queued' = 'blocking'): Promise<SendResult> {
  return apiFetch<SendResult>(`/api/v1/outreach/drafts/${recordId}/approve?dispatch=${dispatch}`, {
    method: 'POST',
  })
}

/** Reject a draft with feedback and get an improved revision. */
export function denyDraft(recordId: string, feedback: string): Promise<DraftResponse> {
  return apiFetch<DraftResponse>(`/api/v1/outreach/drafts/${recordId}/deny`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  })
}

/** The cached DM history with one recipient. */
export function conversation(xUserId: string): Promise<ConversationEvent[]> {
  return apiFetch<ConversationEvent[]>(`/api/v1/outreach/conversations/${xUserId}`)
}

/** Today's dispatch and read budget. */
export function budget(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/v1/outreach/budget')
}
