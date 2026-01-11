// Profile and credentials types
export interface ProfileConfig {
  account_origin?: string
  instance_origin: string
  access_token: string
  workspace?: string
  branch?: string
}

export interface CredentialsFile {
  profiles: {
    [key: string]: ProfileConfig
  }
  default?: string
}

// Common response types
export interface XanoScriptStatus {
  status: 'ok' | 'error'
  value?: string
  message?: string
}

export interface PaginatedResponse<T> {
  curPage: number
  nextPage: number | null
  prevPage: number | null
  items: T[]
}

// Table types
export interface Table {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  auth?: boolean
  tag: string[]
  xanoscript?: XanoScriptStatus
  schema?: Record<string, unknown>
  index?: Record<string, unknown>
}

// API Group types
export interface ApiGroup {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  canonical: string
  swagger: boolean
  documentation?: {
    link?: string
  }
  branch?: string
  tag: string[]
  xanoscript?: XanoScriptStatus
}

// API Endpoint types
export interface Api {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  verb: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' | 'HEAD'
  cache?: {
    active: boolean
    ttl: number
    input: boolean
    auth: boolean
    datasource: boolean
    ip?: boolean
    headers?: string[]
    env?: string[]
  }
  auth?: Record<string, unknown>
  input?: Record<string, unknown>[]
  tag: string[]
  xanoscript?: XanoScriptStatus
}

// Request body types
export interface CreateTableRequest {
  name: string
  description?: string
  docs?: string
  auth?: boolean
  schema?: Record<string, unknown>
  index?: Record<string, unknown>
  tag?: string[]
}

export interface UpdateTableRequest {
  name?: string
  description?: string
  docs?: string
  auth?: boolean
  schema?: Record<string, unknown>
  index?: Record<string, unknown>
  tag?: string[]
}

export interface CreateApiGroupRequest {
  name: string
  description: string
  swagger: boolean
  canonical?: string
  docs?: string
  tag?: string[]
  branch?: string
}

export interface UpdateApiGroupRequest {
  name?: string
  description?: string
  swagger?: boolean
  docs?: string
  tag?: string[]
}

export interface CreateApiRequest {
  name: string
  description: string
  verb: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' | 'HEAD'
  docs?: string
  tag?: string[]
  cache?: {
    active: boolean
    ttl?: number
  }
}

export interface UpdateApiRequest {
  name?: string
  description?: string
  verb?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' | 'HEAD'
  docs?: string
  tag?: string[]
  publish?: boolean
  cache?: {
    active: boolean
    ttl?: number
  }
}

// Function types
export interface Function {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  tag: string[]
  cache?: {
    active: boolean
    ttl: number
  }
  xanoscript?: XanoScriptStatus
}

// Workspace types
export interface Workspace {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  meta?: Record<string, unknown>
}

// Middleware types
export interface Middleware {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  tag: string[]
  xanoscript?: XanoScriptStatus
}

// Task (Scheduled Task) types
export interface Task {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  tag: string[]
  schedule?: string
  active?: boolean
  xanoscript?: XanoScriptStatus
}

// Addon types
export interface Addon {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  guid: string
  branch?: string
  tag: string[]
}

// Datasource types
export interface Datasource {
  label: string
  color?: string
  type?: string
}

// Trigger types (Workspace Trigger)
export interface Trigger {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  tag: string[]
  xanoscript?: XanoScriptStatus
}

// Table Trigger types
export interface TableTrigger {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  docs?: string
  guid: string
  table_id: number
  event: 'insert' | 'update' | 'delete'
  tag: string[]
  xanoscript?: XanoScriptStatus
}

// Branch types
export interface Branch {
  label: string
  is_default?: boolean
  is_live?: boolean
  created_at?: string
}

// File types
export interface FileResource {
  id: number
  created_at: string
  name: string
  path: string
  size: number
  mime?: string
}

// Security update request
export interface SecurityUpdateRequest {
  apigroup_guid?: string
}
