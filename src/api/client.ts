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
  DiscoveryAccepted,
  DiscoveryRunSummary,
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
  known_human_accounts: string[]
  max_accounts: number
  max_candidates?: number
  max_posts_per_account?: number
  include_bots?: boolean
  bot_score_threshold?: number
}

/**
 * The discovery limits, as sent to the backend.
 *
 * Every one of these drives how much of the X API budget a run may spend:
 * `max_candidates` bounds the number of profiles fetched, and
 * `max_posts_per_account` bounds the timeline reads per profile. They are
 * always sent explicitly (never left to the backend default) so a run's
 * cost is predictable and can be kept minimal.
 */
export interface DiscoveryLimits {
  max_accounts: number
  max_candidates: number
  max_posts_per_account: number
}

/** The cheapest limits that still satisfy the backend schema. */
export const MINIMAL_DISCOVERY_LIMITS: DiscoveryLimits = {
  max_accounts: 1,
  max_candidates: 1,
  max_posts_per_account: 0,
}

/** Run a discovery search for accounts matching a segment and/or seeds. */
export function searchDiscovery(request: SearchRequest): Promise<DiscoveryAccepted> {
  return apiFetch<DiscoveryAccepted>('/api/v1/discovery/search', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/** The status of a discovery run. */
export function getDiscoveryRun(runId: string): Promise<DiscoveryRunSummary> {
  return apiFetch<DiscoveryRunSummary>(`/api/v1/discovery/runs/${runId}`)
}

/**
 * Wait for a discovery run to finish and report how it ended.
 *
 * The run works in the background because it waits on the X API and on
 * several LLM inferences, which takes far longer than the gateway may hold
 * a connection open. The poll interval is generous because each poll is a
 * round trip to the API.
 */
export async function waitForDiscoveryRun(
  runId: string,
  options: { timeoutMs?: number; intervalMs?: number; onTick?: () => void } = {},
): Promise<DiscoveryRunSummary> {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000
  const intervalMs = options.intervalMs ?? 3000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const run = await getDiscoveryRun(runId)
    options.onTick?.()
    if (run.status !== 'RUNNING' && run.status !== 'PENDING') {
      return run
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new ApiError(0, 'poll_timeout', `The search did not finish within ${Math.round(timeoutMs / 1000)}s.`)
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

/**
 * The one draft an account is waiting for a decision on.
 *
 * There is no global approval queue: each account has at most one unapproved
 * draft, and the chat panel asks for it when an account is selected.
 */
export function getCurrentDraft(xUserId: string): Promise<DraftResponse> {
  return apiFetch<DraftResponse>(
    `/api/v1/outreach/drafts/current?x_user_id=${encodeURIComponent(xUserId)}`,
  )
}

/** Discard an unapproved draft, for example when the operator switches away. */
export function deleteDraft(recordId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/outreach/drafts/${recordId}`, {
    method: 'DELETE',
  })
}

/** Approve a draft and send it. */
export function approveDraft(recordId: string): Promise<SendResult> {
  return apiFetch<SendResult>(`/api/v1/outreach/drafts/${recordId}/approve`, {
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
