/**
 * Types for Xano Run API
 * Based on @xano/run-sdk types
 */

// ==================== Common ====================

export interface PaginatedResponse<T> {
  curPage?: number
  items: T[]
  itemsReceived?: number
  itemsTotal?: number
  nextPage?: null | number
  offset?: number
  pageTotal?: number
  perPage?: number
  prevPage?: null | number
}

export interface XanoRunError extends Error {
  response?: unknown
  status?: number
}

// ==================== Project ====================

export interface Project {
  access: 'private' | 'public'
  created_at: string
  description: string
  id: string
  name: string
  user_id: number
}

export interface CreateProjectInput {
  description: string
  name: string
}

export interface UpdateProjectInput {
  description?: string
  name?: string
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
  env: {
    name: string
    value: string
  }
  name: string
}

// ==================== Secrets ====================

export type SecretType = 'kubernetes.io/dockerconfigjson' | 'kubernetes.io/service-account-token'

export interface SecretMetadata {
  name: string
  repo?: string
  type: SecretType
}

export interface SecretKeysResponse {
  secrets: SecretMetadata[]
}

export interface SecretValueResponse {
  name: string
  repo?: string
  type: SecretType
  value: string
}

export interface UpdateSecretInput {
  name: string
  secret: {
    name: string
    repo?: string
    type: SecretType
    value: string
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
  args: Record<string, unknown> | unknown[]
  created_at: string
  doc: string
  id: string
  name: string
  project_id: string
  sig: string
  type: RunType
  updated_at: string
  user_id: number
}

export interface SessionExecution {
  _run: RunDefinition
  access: string
  backup: RunBackup
  batch_id: null | string
  boot_time: number
  created_at: string
  error_msg: string
  id: string
  label: string
  main_time: number
  post_time: number
  pre_time: number
  response: unknown
  run_id: string
  state: 'complete' | 'error' | string
  tenant_id: number
  total_time: number
  updated_at: string
}

export interface EndpointInput {
  default: string
  name: string
  nullable: boolean
  required: boolean
  source: string
  type: string
}

export interface Endpoint {
  input: EndpointInput[]
  url: string
  verb: string
}

export interface MetadataApi {
  url: string
}

export interface RunResult {
  logs?: unknown[]
  result?: {
    // Timing fields
    boot_time?: number
    // Service-specific fields
    endpoints?: Endpoint[]
    main_time?: number
    metadata_api?: MetadataApi
    post_time?: number
    pre_result?: unknown
    pre_time?: number
    response?: unknown
    state?: 'complete'
    total_time?: number
  }
  run?: {
    debug?: string[]
    id?: number | string
    problems?: Array<{
      message?: string
      severity?: string
    }>
    result?: {
      boot_time?: number
      main_time?: number
      post_time?: number
      pre_time?: number
      response?: unknown
      total_time?: number
    }
    session?: SessionExecution
  }
  // Service-specific fields
  service?: {
    id: number
    run: {
      id: number
    }
  }
}

export interface DocInfoResult {
  env?: string[]
  input?: Record<string, unknown>
  type: RunType
}

// ==================== Sessions ====================

export type SessionStatus = 'error' | 'running' | 'stopped'

export interface Session {
  created_at: string
  id: string
  project_id: string
  state: string
  updated_at: string
}

export interface SessionDetail {
  access: 'private' | 'public'
  backupResource: null | string
  createdAt: string
  doc: string
  id: string
  name: string
  projectId: null | string
  status: SessionStatus
  uptime: null | number
  url?: string
}

export interface UpdateSessionInput {
  access?: 'private' | 'public'
  name?: string
}

// ==================== Sink ====================

export interface TableColumn {
  description?: string
  isPrimaryKey: boolean
  name: string
  type: string
}

export interface RunLogEntry {
  created_at: string
  duration: number
  error_msg: string
  function_name?: string
  id: number
  input?: unknown[]
  log_object: object
  log_type: string
  output?: Record<string, unknown> | string
  stack?: unknown[]
  value_store?: Record<string, unknown>
}

export interface SinkTable {
  columns: TableColumn[]
  content: Record<string, unknown>[]
  guid: string
  name: string
}

export interface SinkData {
  logs: RunLogEntry[]
  tables: SinkTable[]
}
