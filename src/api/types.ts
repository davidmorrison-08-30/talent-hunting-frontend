/**
 * TypeScript mirrors of the backend Pydantic schemas in `app/schemas.py`.
 * Keep these in sync with the backend contract.
 */

export interface EvidenceItem {
  post_id: string
  url: string
  quote: string
  supports: string
}

export interface KeyInformation {
  bio: string
  occupation: string
  titles: string[]
  specializations: string[]
  interests: string[]
  milestones: string[]
  future_plans: string[]
  evidence: EvidenceItem[]
}

export interface BotAssessment {
  verdict: string
  score: number
  reasons: string[]
  llm_is_bot: boolean | null
  llm_confidence: number | null
  heuristic_signals: Record<string, unknown>[]
}

export interface DiscoveredAccount {
  x_user_id: string
  username: string
  display_name: string | null
  profile_url: string
  bio: string
  followers_count: number
  following_count: number
  created_at: string | null
  bot: BotAssessment
  key_information: KeyInformation
}

export interface AccountRecord {
  x_user_id: string
  username: string
  display_name: string | null
  bio: string
  followers_count: number
  following_count: number
  tweets_count: number
  verified: boolean
  created_at: string | null
  bot_verdict: string
  bot_score: number
  bot_reasons: string[]
  key_information: KeyInformation
  segment_tags: string[]
  source_run_id: string | null
  last_seen_at: string
}

export interface QueryUsed {
  endpoint: string
  query: string
}

export interface DiscoveryStats {
  candidates: number
  bots_filtered: number
  returned: number
  api_calls: Record<string, number>
  estimated_cost_usd: number
}

export interface DiscoveryResponse {
  run_id: string
  target_segment: string[]
  segment_rationale: string
  queries_used: QueryUsed[]
  accounts: DiscoveredAccount[]
  stats: DiscoveryStats
  capabilities: Record<string, unknown>
  warnings: string[]
}

/**
 * The acknowledgement of a search that is still running.
 *
 * A discovery run waits on the X API and on several LLM inferences, which
 * takes longer than an API Gateway integration may hold a connection open.
 * The backend therefore starts the run in the background and answers with
 * this; the client polls `poll_url` until the run leaves the running state.
 */
export interface DiscoveryAccepted {
  run_id: string
  status: string
  poll_url: string
}

/** The status of a discovery run, as reported by the poll endpoint. */
export interface DiscoveryRunSummary {
  id: string
  input_type: string
  target_segment: string[]
  seed_accounts: string[]
  status: string
  stats: Record<string, unknown>
  created_at: string
}

export interface DraftVersion {
  version: number
  text: string
  citations: EvidenceItem[]
  personalization_notes: string
  feedback: string
  created_at: string | null
}

export interface DraftResponse {
  id: string
  x_user_id: string
  handle: string | null
  status: string
  goal: string | null
  tone: string | null
  is_reply: boolean
  draft_versions: DraftVersion[]
  evidence_snapshot: Record<string, unknown>
  conversation: Record<string, unknown>[]
  error: string | null
  x_message_id: string | null
  created_at: string
  sent_at: string | null
}

export interface SendResult {
  id: string
  x_user_id: string
  status: string
  x_message_id: string | null
  error: string | null
  sent_at: string | null
  delay_applied_seconds: number
}

export interface OAuthStatus {
  connected: boolean
  x_user_id?: string
  scopes?: string[]
  expires_at?: string | null
  fresh?: boolean
  has_refresh_token?: boolean
}

export interface OAuthStartResponse {
  authorization_url: string
  state: string
  redirect_uri: string
  scopes: string[]
}

/** The single error envelope every backend route uses. */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface ConversationEvent {
  id: string
  sender_id: string | null
  text: string | null
  event_type: string
  created_at: string | null
}
