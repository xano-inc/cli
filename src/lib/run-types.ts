/**
 * Types for Xano Run API
 * Based on @xano/run-sdk types
 */

// ==================== Common ====================

export interface PaginatedResponse<T> {
  items: T[]
  itemsReceived?: number
  curPage?: number
  nextPage?: number | null
  prevPage?: number | null
  offset?: number
  perPage?: number
  itemsTotal?: number
  pageTotal?: number
}

export interface XanoRunError extends Error {
  status?: number
  response?: unknown
}

// ==================== Project ====================

export interface Project {
  id: string
  created_at: string
  name: string
  description: string
  user_id: number
  access: 'private' | 'public'
}

export interface CreateProjectInput {
  name: string
  description: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string
}

// ==================== Environment Variables ====================

export interface EnvKeysResponse {
  env: string[]
}

export interface EnvValueResponse {
  name: string
  value: string
}

export interface UpdateEnvInput {
  name: string
  env: {
    name: string
    value: string
  }
}

// ==================== Secrets ====================

export type SecretType = 'kubernetes.io/dockerconfigjson' | 'kubernetes.io/service-account-token'

export interface SecretMetadata {
  name: string
  type: SecretType
  repo?: string
}

export interface SecretKeysResponse {
  secrets: SecretMetadata[]
}

export interface SecretValueResponse {
  name: string
  type: SecretType
  repo?: string
  value: string
}

export interface UpdateSecretInput {
  name: string
  secret: {
    name: string
    type: SecretType
    value: string
    repo?: string
  }
}

// ==================== Run Execution ====================

export type RunType = 'job' | 'service'

export interface RunOptions {
  args?: Record<string, unknown>
  env?: Record<string, string>
}

export interface RunBackup {
  resource: string
  size: number
}

export interface RunDefinition {
  id: string
  created_at: string
  updated_at: string
  name: string
  user_id: number
  project_id: string
  sig: string
  type: RunType
  args: unknown[] | Record<string, unknown>
  doc: string
}

export interface SessionExecution {
  id: string
  created_at: string
  updated_at: string
  run_id: string
  batch_id: string | null
  state: 'complete' | 'error' | string
  error_msg: string
  response: unknown
  label: string
  boot_time: number
  pre_time: number
  main_time: number
  post_time: number
  total_time: number
  tenant_id: number
  access: string
  backup: RunBackup
  _run: RunDefinition
}

export interface EndpointInput {
  source: string
  name: string
  type: string
  nullable: boolean
  default: string
  required: boolean
}

export interface Endpoint {
  url: string
  verb: string
  input: EndpointInput[]
}

export interface MetadataApi {
  url: string
}

export interface RunResult {
  run?: {
    id?: string | number
    session?: SessionExecution
    result?: {
      response?: unknown
      boot_time?: number
      main_time?: number
      pre_time?: number
      post_time?: number
      total_time?: number
    }
    debug?: string[]
    problems?: Array<{
      message?: string
      severity?: string
    }>
  }
  // Service-specific fields
  service?: {
    id: number
    run: {
      id: number
    }
  }
  logs?: unknown[]
  result?: {
    state?: 'complete'
    response?: unknown
    // Timing fields
    boot_time?: number
    pre_time?: number
    main_time?: number
    post_time?: number
    total_time?: number
    pre_result?: unknown
    // Service-specific fields
    endpoints?: Endpoint[]
    metadata_api?: MetadataApi
  }
}

export interface DocInfoResult {
  type: RunType
  input?: Record<string, unknown>
  env?: string[]
}

// ==================== Sessions ====================

export type SessionStatus = 'running' | 'stopped' | 'error'

export interface Session {
  id: string
  created_at: string
  updated_at: string
  project_id: string
  state: string
}

export interface SessionDetail {
  id: string
  name: string
  status: SessionStatus
  uptime: number | null
  url?: string
  doc: string
  createdAt: string
  access: 'private' | 'public'
  projectId: string | null
  backupResource: string | null
}

export interface UpdateSessionInput {
  name?: string
  access?: 'private' | 'public'
}

// ==================== Sink ====================

export interface TableColumn {
  name: string
  type: string
  description?: string
  isPrimaryKey: boolean
}

export interface RunLogEntry {
  id: number
  created_at: string
  log_type: string
  duration: number
  function_name?: string
  error_msg: string
  log_object: object
  output?: string | Record<string, unknown>
  input?: unknown[]
  stack?: unknown[]
  value_store?: Record<string, unknown>
}

export interface SinkTable {
  guid: string
  name: string
  columns: TableColumn[]
  content: Record<string, unknown>[]
}

export interface SinkData {
  tables: SinkTable[]
  logs: RunLogEntry[]
}
