import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type {CredentialsFile, ProfileConfig} from './types.js'

export class XanoApiClient {
  private profile: ProfileConfig
  private profileName: string

  constructor(profile: ProfileConfig, profileName: string) {
    this.profile = profile
    this.profileName = profileName
  }

  static loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      throw new Error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    const fileContent = fs.readFileSync(credentialsPath, 'utf8')
    const parsed = yaml.load(fileContent) as CredentialsFile

    if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
      throw new Error('Credentials file has invalid format.')
    }

    return parsed
  }

  static getDefaultProfile(): string {
    try {
      const configDir = path.join(os.homedir(), '.xano')
      const credentialsPath = path.join(configDir, 'credentials.yaml')

      if (!fs.existsSync(credentialsPath)) {
        return 'default'
      }

      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (parsed && typeof parsed === 'object' && 'default' in parsed && parsed.default) {
        return parsed.default
      }

      return 'default'
    } catch {
      return 'default'
    }
  }

  static fromProfile(profileName: string): XanoApiClient {
    const credentials = XanoApiClient.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      throw new Error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      throw new Error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      throw new Error(`Profile '${profileName}' is missing access_token`)
    }

    return new XanoApiClient(profile, profileName)
  }

  getWorkspaceId(flagWorkspace?: string): string {
    if (flagWorkspace) {
      return flagWorkspace
    }

    if (this.profile.workspace) {
      return this.profile.workspace
    }

    throw new Error(
      `Workspace ID is required. Either:\n` +
      `  1. Provide it as a flag: -w <workspace_id>\n` +
      `  2. Set it in your profile using: xano profile:edit ${this.profileName} -w <workspace_id>`,
    )
  }

  private getBaseUrl(): string {
    return `${this.profile.instance_origin}/api:meta`
  }

  private getHeaders(contentType: string = 'application/json'): Record<string, string> {
    return {
      'accept': 'application/json',
      'Content-Type': contentType,
      'Authorization': `Bearer ${this.profile.access_token}`,
    }
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    options: {
      body?: unknown
      contentType?: string
      queryParams?: Record<string, string | boolean | number>
    } = {},
  ): Promise<T> {
    const {body, contentType = 'application/json', queryParams} = options

    let url = `${this.getBaseUrl()}${endpoint}`

    if (queryParams) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      }
      const queryString = params.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: this.getHeaders(contentType),
    }

    if (body !== undefined) {
      if (contentType === 'text/x-xanoscript') {
        fetchOptions.body = body as string
      } else {
        fetchOptions.body = JSON.stringify(body)
      }
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
      )
    }

    // Handle empty responses (like DELETE)
    const text = await response.text()
    if (!text) {
      return {} as T
    }

    return JSON.parse(text) as T
  }

  async requestRaw(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    options: {
      body?: unknown
      contentType?: string
      queryParams?: Record<string, string | boolean | number>
      accept?: string
    } = {},
  ): Promise<{data: Buffer; contentType: string}> {
    const {body, contentType = 'application/json', queryParams, accept = '*/*'} = options

    let url = `${this.getBaseUrl()}${endpoint}`

    if (queryParams) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      }
      const queryString = params.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const headers: Record<string, string> = {
      'accept': accept,
      'Content-Type': contentType,
      'Authorization': `Bearer ${this.profile.access_token}`,
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (body !== undefined) {
      if (contentType === 'text/x-xanoscript') {
        fetchOptions.body = body as string
      } else {
        fetchOptions.body = JSON.stringify(body)
      }
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const responseContentType = response.headers.get('content-type') || 'application/octet-stream'

    return {
      data: Buffer.from(arrayBuffer),
      contentType: responseContentType,
    }
  }

  async requestText(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    options: {
      body?: unknown
      contentType?: string
      queryParams?: Record<string, string | boolean | number>
    } = {},
  ): Promise<string> {
    const {body, contentType = 'application/json', queryParams} = options

    let url = `${this.getBaseUrl()}${endpoint}`

    if (queryParams) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      }
      const queryString = params.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: this.getHeaders(contentType),
    }

    if (body !== undefined) {
      if (contentType === 'text/x-xanoscript') {
        fetchOptions.body = body as string
      } else {
        fetchOptions.body = JSON.stringify(body)
      }
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
      )
    }

    return response.text()
  }

  // Table endpoints
  async listTables(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    sort?: string
    order?: string
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/table`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        sort: params.sort ?? 'name',
        order: params.order ?? 'asc',
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getTable(workspaceId: string, tableId: string, includeXanoscript = false) {
    return this.request('GET', `/workspace/${workspaceId}/table/${tableId}`, {
      queryParams: {include_xanoscript: includeXanoscript},
    })
  }

  async createTable(workspaceId: string, data: unknown, useXanoscript = false) {
    return this.request('POST', `/workspace/${workspaceId}/table`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {include_xanoscript: false},
    })
  }

  async updateTable(workspaceId: string, tableId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/table/${tableId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {include_xanoscript: false},
    })
  }

  async deleteTable(workspaceId: string, tableId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/table/${tableId}`)
  }

  // API Group endpoints
  async listApiGroups(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    sort?: string
    order?: string
    branch?: string
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]}>('GET', `/workspace/${workspaceId}/apigroup`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        sort: params.sort ?? 'created_at',
        order: params.order ?? 'desc',
        branch: params.branch ?? '',
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getApiGroup(workspaceId: string, apiGroupId: string, includeXanoscript = false) {
    return this.request('GET', `/workspace/${workspaceId}/apigroup/${apiGroupId}`, {
      queryParams: {include_xanoscript: includeXanoscript},
    })
  }

  async createApiGroup(workspaceId: string, data: unknown, useXanoscript = false, branch?: string) {
    return this.request('POST', `/workspace/${workspaceId}/apigroup`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {
        branch: branch ?? '',
        include_xanoscript: false,
      },
    })
  }

  async updateApiGroup(workspaceId: string, apiGroupId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/apigroup/${apiGroupId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {include_xanoscript: false},
    })
  }

  async deleteApiGroup(workspaceId: string, apiGroupId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/apigroup/${apiGroupId}`)
  }

  // API Endpoint endpoints
  async listApis(workspaceId: string, apiGroupId: string, params: {
    page?: number
    per_page?: number
    search?: string
    sort?: string
    order?: string
    include_draft?: boolean
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]}>('GET', `/workspace/${workspaceId}/apigroup/${apiGroupId}/api`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        sort: params.sort ?? 'created_at',
        order: params.order ?? 'desc',
        include_draft: params.include_draft ?? false,
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getApi(workspaceId: string, apiGroupId: string, apiId: string, params: {
    include_draft?: boolean
    include_xanoscript?: boolean
  } = {}) {
    return this.request('GET', `/workspace/${workspaceId}/apigroup/${apiGroupId}/api/${apiId}`, {
      queryParams: {
        include_draft: params.include_draft ?? false,
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async createApi(workspaceId: string, apiGroupId: string, data: unknown, useXanoscript = false, branch?: string) {
    return this.request('POST', `/workspace/${workspaceId}/apigroup/${apiGroupId}/api`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {
        branch: branch ?? '',
        include_xanoscript: false,
      },
    })
  }

  async updateApi(
    workspaceId: string,
    apiGroupId: string,
    apiId: string,
    data: unknown,
    useXanoscript = false,
    publish = true,
  ) {
    return this.request('PUT', `/workspace/${workspaceId}/apigroup/${apiGroupId}/api/${apiId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {
        publish,
        include_xanoscript: false,
      },
    })
  }

  async deleteApi(workspaceId: string, apiGroupId: string, apiId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/apigroup/${apiGroupId}/api/${apiId}`)
  }

  // Function endpoints
  async listFunctions(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    sort?: string
    order?: string
    include_draft?: boolean
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/function`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        sort: params.sort ?? 'created_at',
        order: params.order ?? 'desc',
        include_draft: params.include_draft ?? false,
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getFunction(workspaceId: string, functionId: string, params: {
    include_draft?: boolean
    include_xanoscript?: boolean
  } = {}) {
    return this.request('GET', `/workspace/${workspaceId}/function/${functionId}`, {
      queryParams: {
        include_draft: params.include_draft ?? false,
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async createFunction(workspaceId: string, data: unknown, useXanoscript = false) {
    return this.request('POST', `/workspace/${workspaceId}/function`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {include_xanoscript: false},
    })
  }

  async updateFunction(workspaceId: string, functionId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/function/${functionId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
      queryParams: {include_xanoscript: false},
    })
  }

  async deleteFunction(workspaceId: string, functionId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/function/${functionId}`)
  }

  async updateFunctionSecurity(workspaceId: string, functionId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/function/${functionId}/security`, {
      body: data,
    })
  }

  // Workspace endpoints
  async listWorkspaces() {
    return this.request<unknown[]>('GET', '/workspace')
  }

  async getWorkspace(workspaceId: string) {
    return this.request('GET', `/workspace/${workspaceId}`)
  }

  async getWorkspaceContext(workspaceId: string) {
    // Context endpoint returns text format, not JSON
    return this.requestText('GET', `/workspace/${workspaceId}/context`)
  }

  async getWorkspaceOpenApi(workspaceId: string) {
    return this.request('GET', `/workspace/${workspaceId}/openapi`)
  }

  async exportWorkspace(workspaceId: string) {
    // Export returns a binary archive file
    return this.requestRaw('POST', `/workspace/${workspaceId}/export`)
  }

  async importWorkspace(workspaceId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/import`, {
      body: data,
    })
  }

  async exportWorkspaceSchema(workspaceId: string) {
    // Export-schema returns a binary archive file
    return this.requestRaw('POST', `/workspace/${workspaceId}/export-schema`)
  }

  async importWorkspaceSchema(workspaceId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/import-schema`, {
      body: data,
    })
  }

  // Middleware endpoints
  async listMiddleware(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/middleware`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getMiddleware(workspaceId: string, middlewareId: string, includeXanoscript = false) {
    return this.request('GET', `/workspace/${workspaceId}/middleware/${middlewareId}`, {
      queryParams: {include_xanoscript: includeXanoscript},
    })
  }

  async createMiddleware(workspaceId: string, data: unknown, useXanoscript = false) {
    return this.request('POST', `/workspace/${workspaceId}/middleware`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async updateMiddleware(workspaceId: string, middlewareId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/middleware/${middlewareId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async deleteMiddleware(workspaceId: string, middlewareId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/middleware/${middlewareId}`)
  }

  async updateMiddlewareSecurity(workspaceId: string, middlewareId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/middleware/${middlewareId}/security`, {
      body: data,
    })
  }

  // Task (Scheduled Task) endpoints
  async listTasks(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/task`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getTask(workspaceId: string, taskId: string, includeXanoscript = false) {
    return this.request('GET', `/workspace/${workspaceId}/task/${taskId}`, {
      queryParams: {include_xanoscript: includeXanoscript},
    })
  }

  async createTask(workspaceId: string, data: unknown, useXanoscript = false) {
    return this.request('POST', `/workspace/${workspaceId}/task`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async updateTask(workspaceId: string, taskId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/task/${taskId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async deleteTask(workspaceId: string, taskId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/task/${taskId}`)
  }

  async updateTaskSecurity(workspaceId: string, taskId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/task/${taskId}/security`, {
      body: data,
    })
  }

  // Addon endpoints
  async listAddons(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/addon`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
      },
    })
  }

  async getAddon(workspaceId: string, addonId: string) {
    return this.request('GET', `/workspace/${workspaceId}/addon/${addonId}`)
  }

  async createAddon(workspaceId: string, xsContent: string) {
    // Addon creation only accepts XanoScript format
    return this.request('POST', `/workspace/${workspaceId}/addon`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async updateAddon(workspaceId: string, addonId: string, xsContent: string) {
    // Addon update only accepts XanoScript format
    return this.request('PUT', `/workspace/${workspaceId}/addon/${addonId}`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async deleteAddon(workspaceId: string, addonId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/addon/${addonId}`)
  }

  async updateAddonSecurity(workspaceId: string, addonId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/addon/${addonId}/security`, {
      body: data,
    })
  }

  // Datasource endpoints
  async listDatasources(workspaceId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/datasource`)
  }

  async createDatasource(workspaceId: string, data: {label: string; color?: string}) {
    return this.request('POST', `/workspace/${workspaceId}/datasource`, {
      body: data,
    })
  }

  async updateDatasource(workspaceId: string, label: string, data: {label?: string; color?: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/datasource/${label}`, {
      body: data,
    })
  }

  async deleteDatasource(workspaceId: string, label: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/datasource/${label}`)
  }

  // Trigger (Workspace Trigger) endpoints
  async listTriggers(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/trigger`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getTrigger(workspaceId: string, triggerId: string, includeXanoscript = false) {
    return this.request('GET', `/workspace/${workspaceId}/trigger/${triggerId}`, {
      queryParams: {include_xanoscript: includeXanoscript},
    })
  }

  async createTrigger(workspaceId: string, data: unknown, useXanoscript = false) {
    return this.request('POST', `/workspace/${workspaceId}/trigger`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async updateTrigger(workspaceId: string, triggerId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/trigger/${triggerId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async deleteTrigger(workspaceId: string, triggerId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/trigger/${triggerId}`)
  }

  async updateTriggerSecurity(workspaceId: string, triggerId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/trigger/${triggerId}/security`, {
      body: data,
    })
  }

  // Table Trigger endpoints
  async listTableTriggers(workspaceId: string, params: {
    page?: number
    per_page?: number
    search?: string
    include_xanoscript?: boolean
  } = {}) {
    return this.request<{items: unknown[]} | unknown[]>('GET', `/workspace/${workspaceId}/table/trigger`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
        search: params.search ?? '',
        include_xanoscript: params.include_xanoscript ?? false,
      },
    })
  }

  async getTableTrigger(workspaceId: string, triggerId: string, includeXanoscript = false) {
    return this.request('GET', `/workspace/${workspaceId}/table/trigger/${triggerId}`, {
      queryParams: {include_xanoscript: includeXanoscript},
    })
  }

  async createTableTrigger(workspaceId: string, data: unknown, useXanoscript = false) {
    return this.request('POST', `/workspace/${workspaceId}/table/trigger`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async updateTableTrigger(workspaceId: string, triggerId: string, data: unknown, useXanoscript = false) {
    return this.request('PUT', `/workspace/${workspaceId}/table/trigger/${triggerId}`, {
      body: data,
      contentType: useXanoscript ? 'text/x-xanoscript' : 'application/json',
    })
  }

  async deleteTableTrigger(workspaceId: string, triggerId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/table/trigger/${triggerId}`)
  }

  async updateTableTriggerSecurity(workspaceId: string, triggerId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/table/trigger/${triggerId}/security`, {
      body: data,
    })
  }

  // Branch endpoints
  async listBranches(workspaceId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/branch`)
  }

  async deleteBranch(workspaceId: string, branchLabel: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/branch/${branchLabel}`)
  }

  // Static Host endpoints
  async listStaticHosts(workspaceId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/static_host`)
  }

  async listStaticHostBuilds(workspaceId: string, staticHost: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/static_host/${staticHost}/build`)
  }

  async getStaticHostBuild(workspaceId: string, staticHost: string, buildId: string) {
    return this.request('GET', `/workspace/${workspaceId}/static_host/${staticHost}/build/${buildId}`)
  }

  async createStaticHostBuild(workspaceId: string, staticHost: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/static_host/${staticHost}/build`, {
      body: data,
    })
  }

  async deleteStaticHostBuild(workspaceId: string, staticHost: string, buildId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/static_host/${staticHost}/build/${buildId}`)
  }

  async updateStaticHostBuildEnv(workspaceId: string, staticHost: string, buildId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/static_host/${staticHost}/build/${buildId}/env`, {
      body: data,
    })
  }
}
