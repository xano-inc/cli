/**
 * HTTP client for Xano Run API
 * Based on @xano/run-sdk HttpClient
 */

import type {XanoRunError} from './run-types.js'

export const DEFAULT_RUN_BASE_URL = 'https://app.dev.xano.com/'

export interface RunHttpClientConfig {
  baseUrl: string
  authToken: string
  projectId?: string
  verbose?: boolean
  logger?: (message: string) => void
}

export class RunHttpClient {
  private readonly config: RunHttpClientConfig

  constructor(config: RunHttpClientConfig) {
    this.config = config
  }

  /**
   * Get the project ID
   */
  getProjectId(): string | undefined {
    return this.config.projectId
  }

  /**
   * Build headers for a request
   */
  getHeaders(contentType: string = 'application/json'): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': contentType,
      'Authorization': `Bearer ${this.config.authToken}`,
    }
    return headers
  }

  /**
   * Build a URL with optional query parameters
   */
  buildUrl(path: string, queryParams?: Record<string, unknown>): string {
    const baseUrl = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl.slice(0, -1)
      : this.config.baseUrl
    const url = new URL(`${baseUrl}/api:run${path}`)

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object') {
            url.searchParams.set(key, JSON.stringify(value))
          } else {
            url.searchParams.set(key, String(value))
          }
        }
      }
    }

    return url.toString()
  }

  /**
   * Build a URL scoped to the current project
   */
  buildProjectUrl(path: string, queryParams?: Record<string, unknown>): string {
    const projectId = this.config.projectId
    if (!projectId) {
      throw new Error('Project ID is required. Set it in your profile.')
    }
    return this.buildUrl(`/project/${projectId}${path}`, queryParams)
  }

  /**
   * Build a URL scoped to a specific session
   */
  buildSessionUrl(sessionId: string, path: string = '', queryParams?: Record<string, unknown>): string {
    return this.buildUrl(`/session/${sessionId}${path}`, queryParams)
  }

  /**
   * Log a message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.config.verbose && this.config.logger) {
      this.config.logger(message)
    }
  }

  /**
   * Make an HTTP request
   */
  async request<T>(url: string, options: RequestInit): Promise<T> {
    const method = options.method || 'GET'
    const contentType = (options.headers as Record<string, string>)?.['Content-Type'] || 'application/json'

    // Log request details
    this.log(`\n${'─'.repeat(60)}`)
    this.log(`→ ${method} ${url}`)
    this.log(`  Content-Type: ${contentType}`)
    if (options.body) {
      const bodyPreview = typeof options.body === 'string'
        ? options.body.length > 500 ? options.body.slice(0, 500) + '...' : options.body
        : JSON.stringify(options.body)
      this.log(`  Body: ${bodyPreview}`)
    }

    const startTime = Date.now()
    const response = await fetch(url, options)
    const elapsed = Date.now() - startTime

    // Log response details
    this.log(`← ${response.status} ${response.statusText} (${elapsed}ms)`)

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as XanoRunError
      error.status = response.status
      try {
        error.response = await response.json()
        this.log(`  Response: ${JSON.stringify(error.response, null, 2)}`)
      } catch {
        error.response = await response.text()
        this.log(`  Response: ${error.response}`)
      }
      this.log(`${'─'.repeat(60)}\n`)
      throw error
    }

    const text = await response.text()
    if (!text) {
      this.log(`  Response: (empty)`)
      this.log(`${'─'.repeat(60)}\n`)
      return undefined as T
    }

    const parsed = JSON.parse(text)
    if (this.config.verbose) {
      const responsePreview = text.length > 1000 ? text.slice(0, 1000) + '...' : text
      this.log(`  Response: ${responsePreview}`)
    }
    this.log(`${'─'.repeat(60)}\n`)

    return parsed
  }

  /**
   * Make a GET request
   */
  async get<T>(url: string): Promise<T> {
    return this.request<T>(url, {
      method: 'GET',
      headers: this.getHeaders(),
    })
  }

  /**
   * Make a POST request with JSON body
   */
  async post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  /**
   * Make a POST request with XanoScript body
   */
  async postXanoScript<T>(url: string, code: string): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: this.getHeaders('text/x-xanoscript'),
      body: code,
    })
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
  }
}
