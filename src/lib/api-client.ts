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

  // Table Content (Data) endpoints
  async listTableContent(workspaceId: string, tableId: string, params: {
    page?: number
    per_page?: number
  } = {}) {
    return this.request('GET', `/workspace/${workspaceId}/table/${tableId}/content`, {
      queryParams: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
      },
    })
  }

  async getTableContent(workspaceId: string, tableId: string, recordId: string) {
    return this.request('GET', `/workspace/${workspaceId}/table/${tableId}/content/${recordId}`)
  }

  async createTableContent(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/content`, {
      body: data,
    })
  }

  async updateTableContent(workspaceId: string, tableId: string, recordId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/table/${tableId}/content/${recordId}`, {
      body: data,
    })
  }

  async deleteTableContent(workspaceId: string, tableId: string, recordId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/table/${tableId}/content/${recordId}`)
  }

  async searchTableContent(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/content/search`, {
      body: data,
    })
  }

  async bulkCreateTableContent(workspaceId: string, tableId: string, data: unknown[]) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/content/bulk`, {
      body: {items: data},
    })
  }

  async bulkDeleteTableContent(workspaceId: string, tableId: string, data: {ids: number[]}) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/content/bulk/delete`, {
      body: data,
    })
  }

  async bulkPatchTableContent(workspaceId: string, tableId: string, data: unknown[]) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/content/bulk/patch`, {
      body: data,
    })
  }

  async truncateTable(workspaceId: string, tableId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/table/${tableId}/truncate`)
  }

  // Table Schema endpoints
  async getTableSchema(workspaceId: string, tableId: string) {
    return this.request('GET', `/workspace/${workspaceId}/table/${tableId}/schema`)
  }

  async replaceTableSchema(workspaceId: string, tableId: string, schema: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/table/${tableId}/schema`, {
      body: schema,
    })
  }

  async getTableSchemaColumn(workspaceId: string, tableId: string, columnName: string) {
    return this.request('GET', `/workspace/${workspaceId}/table/${tableId}/schema/${columnName}`)
  }

  async deleteTableSchemaColumn(workspaceId: string, tableId: string, columnName: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/table/${tableId}/schema/${columnName}`)
  }

  async renameTableSchemaColumn(workspaceId: string, tableId: string, data: {old_name: string; new_name: string}) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/schema/rename`, {
      body: data,
    })
  }

  async addTableSchemaColumn(workspaceId: string, tableId: string, columnType: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/schema/type/${columnType}`, {
      body: data,
    })
  }

  // Table Index endpoints
  async listTableIndexes(workspaceId: string, tableId: string) {
    return this.request('GET', `/workspace/${workspaceId}/table/${tableId}/index`)
  }

  async replaceTableIndexes(workspaceId: string, tableId: string, indexes: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/table/${tableId}/index`, {
      body: indexes,
    })
  }

  async deleteTableIndex(workspaceId: string, tableId: string, indexId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/table/${tableId}/index/${indexId}`)
  }

  async createTableIndexBtree(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/index/btree`, {
      body: data,
    })
  }

  async createTableIndexUnique(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/index/unique`, {
      body: data,
    })
  }

  async createTableIndexSearch(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/index/search`, {
      body: data,
    })
  }

  async createTableIndexSpatial(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/index/spatial`, {
      body: data,
    })
  }

  async createTableIndexVector(workspaceId: string, tableId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/table/${tableId}/index/vector`, {
      body: data,
    })
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

  // ============================================
  // Phase 5: Advanced Resources
  // ============================================

  // Agent endpoints
  async listAgents(workspaceId: string, params: {branch?: string} = {}) {
    const searchParams = new URLSearchParams()
    if (params.branch) searchParams.set('branch', params.branch)
    const query = searchParams.toString()
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/agent${query ? `?${query}` : ''}`)
  }

  async getAgent(workspaceId: string, agentId: string) {
    return this.request('GET', `/workspace/${workspaceId}/agent/${agentId}`)
  }

  async createAgent(workspaceId: string, xsContent: string) {
    // Agent creation only accepts XanoScript format
    return this.request('POST', `/workspace/${workspaceId}/agent`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async updateAgent(workspaceId: string, agentId: string, xsContent: string) {
    // Agent update only accepts XanoScript format
    return this.request('PUT', `/workspace/${workspaceId}/agent/${agentId}`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async deleteAgent(workspaceId: string, agentId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/agent/${agentId}`)
  }

  // Agent Trigger endpoints
  async listAgentTriggers(workspaceId: string, agentId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/agent/${agentId}/trigger`)
  }

  async getAgentTrigger(workspaceId: string, agentId: string, triggerId: string) {
    return this.request('GET', `/workspace/${workspaceId}/agent/${agentId}/trigger/${triggerId}`)
  }

  async createAgentTrigger(workspaceId: string, agentId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/agent/${agentId}/trigger`, {
      body: data,
    })
  }

  async updateAgentTrigger(workspaceId: string, agentId: string, triggerId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/agent/${agentId}/trigger/${triggerId}`, {
      body: data,
    })
  }

  async deleteAgentTrigger(workspaceId: string, agentId: string, triggerId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/agent/${agentId}/trigger/${triggerId}`)
  }

  async updateAgentTriggerSecurity(workspaceId: string, agentId: string, triggerId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/agent/${agentId}/trigger/${triggerId}/security`, {
      body: data,
    })
  }

  // MCP Server endpoints
  async listMcpServers(workspaceId: string, params: {branch?: string} = {}) {
    const searchParams = new URLSearchParams()
    if (params.branch) searchParams.set('branch', params.branch)
    const query = searchParams.toString()
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/mcp_server${query ? `?${query}` : ''}`)
  }

  async getMcpServer(workspaceId: string, mcpServerId: string) {
    return this.request('GET', `/workspace/${workspaceId}/mcp_server/${mcpServerId}`)
  }

  async createMcpServer(workspaceId: string, xsContent: string) {
    // MCP Server creation only accepts XanoScript format
    return this.request('POST', `/workspace/${workspaceId}/mcp_server`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async updateMcpServer(workspaceId: string, mcpServerId: string, xsContent: string) {
    // MCP Server update only accepts XanoScript format
    return this.request('PUT', `/workspace/${workspaceId}/mcp_server/${mcpServerId}`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async deleteMcpServer(workspaceId: string, mcpServerId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/mcp_server/${mcpServerId}`)
  }

  // MCP Server Trigger endpoints
  async listMcpServerTriggers(workspaceId: string, mcpServerId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/mcp_server/${mcpServerId}/trigger`)
  }

  async getMcpServerTrigger(workspaceId: string, mcpServerId: string, triggerId: string) {
    return this.request('GET', `/workspace/${workspaceId}/mcp_server/${mcpServerId}/trigger/${triggerId}`)
  }

  async createMcpServerTrigger(workspaceId: string, mcpServerId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/mcp_server/${mcpServerId}/trigger`, {
      body: data,
    })
  }

  async updateMcpServerTrigger(workspaceId: string, mcpServerId: string, triggerId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/mcp_server/${mcpServerId}/trigger/${triggerId}`, {
      body: data,
    })
  }

  async deleteMcpServerTrigger(workspaceId: string, mcpServerId: string, triggerId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/mcp_server/${mcpServerId}/trigger/${triggerId}`)
  }

  async updateMcpServerTriggerSecurity(workspaceId: string, mcpServerId: string, triggerId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/mcp_server/${mcpServerId}/trigger/${triggerId}/security`, {
      body: data,
    })
  }

  // Realtime endpoints
  async getRealtime(workspaceId: string) {
    return this.request('GET', `/workspace/${workspaceId}/realtime`)
  }

  async updateRealtime(workspaceId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/realtime`, {
      body: data,
    })
  }

  // Realtime Channel endpoints
  async listRealtimeChannels(workspaceId: string, params: {branch?: string} = {}) {
    const searchParams = new URLSearchParams()
    if (params.branch) searchParams.set('branch', params.branch)
    const query = searchParams.toString()
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/realtime/channel${query ? `?${query}` : ''}`)
  }

  async getRealtimeChannel(workspaceId: string, channelId: string) {
    return this.request('GET', `/workspace/${workspaceId}/realtime/channel/${channelId}`)
  }

  async createRealtimeChannel(workspaceId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/realtime/channel`, {
      body: data,
    })
  }

  async updateRealtimeChannel(workspaceId: string, channelId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/realtime/channel/${channelId}`, {
      body: data,
    })
  }

  async deleteRealtimeChannel(workspaceId: string, channelId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/realtime/channel/${channelId}`)
  }

  // Realtime Channel Trigger endpoints
  async listRealtimeChannelTriggers(workspaceId: string, channelId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/realtime/channel/${channelId}/trigger`)
  }

  async getRealtimeChannelTrigger(workspaceId: string, channelId: string, triggerId: string) {
    return this.request('GET', `/workspace/${workspaceId}/realtime/channel/${channelId}/trigger/${triggerId}`)
  }

  async createRealtimeChannelTrigger(workspaceId: string, channelId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/realtime/channel/${channelId}/trigger`, {
      body: data,
    })
  }

  async updateRealtimeChannelTrigger(workspaceId: string, channelId: string, triggerId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/realtime/channel/${channelId}/trigger/${triggerId}`, {
      body: data,
    })
  }

  async deleteRealtimeChannelTrigger(workspaceId: string, channelId: string, triggerId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/realtime/channel/${channelId}/trigger/${triggerId}`)
  }

  async updateRealtimeChannelTriggerSecurity(workspaceId: string, channelId: string, triggerId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/realtime/channel/${channelId}/trigger/${triggerId}/security`, {
      body: data,
    })
  }

  // Tool endpoints
  async listTools(workspaceId: string, params: {branch?: string} = {}) {
    const searchParams = new URLSearchParams()
    if (params.branch) searchParams.set('branch', params.branch)
    const query = searchParams.toString()
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/tool${query ? `?${query}` : ''}`)
  }

  async getTool(workspaceId: string, toolId: string) {
    return this.request('GET', `/workspace/${workspaceId}/tool/${toolId}`)
  }

  async createTool(workspaceId: string, xsContent: string) {
    // Tool creation only accepts XanoScript format
    return this.request('POST', `/workspace/${workspaceId}/tool`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async updateTool(workspaceId: string, toolId: string, xsContent: string) {
    // Tool update only accepts XanoScript format
    return this.request('PUT', `/workspace/${workspaceId}/tool/${toolId}`, {
      body: xsContent,
      contentType: 'text/x-xanoscript',
    })
  }

  async deleteTool(workspaceId: string, toolId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/tool/${toolId}`)
  }

  async updateToolSecurity(workspaceId: string, toolId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/tool/${toolId}/security`, {
      body: data,
    })
  }

  // Workflow Test endpoints
  async listWorkflowTests(workspaceId: string, params: {branch?: string} = {}) {
    const searchParams = new URLSearchParams()
    if (params.branch) searchParams.set('branch', params.branch)
    const query = searchParams.toString()
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/workflow_test${query ? `?${query}` : ''}`)
  }

  async getWorkflowTest(workspaceId: string, workflowTestId: string) {
    return this.request('GET', `/workspace/${workspaceId}/workflow_test/${workflowTestId}`)
  }

  async createWorkflowTest(workspaceId: string, data: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/workflow_test`, {
      body: data,
    })
  }

  async updateWorkflowTest(workspaceId: string, workflowTestId: string, data: unknown) {
    return this.request('PUT', `/workspace/${workspaceId}/workflow_test/${workflowTestId}`, {
      body: data,
    })
  }

  async deleteWorkflowTest(workspaceId: string, workflowTestId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/workflow_test/${workflowTestId}`)
  }

  async updateWorkflowTestSecurity(workspaceId: string, workflowTestId: string, data: {guid: string}) {
    return this.request('PUT', `/workspace/${workspaceId}/workflow_test/${workflowTestId}/security`, {
      body: data,
    })
  }

  // Branch endpoints
  async listBranches(workspaceId: string) {
    return this.request<unknown[]>('GET', `/workspace/${workspaceId}/branch`)
  }

  async deleteBranch(workspaceId: string, branchLabel: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/branch/${encodeURIComponent(branchLabel)}`)
  }

  // File endpoints
  async listFiles(workspaceId: string, params: {page?: number; per_page?: number; search?: string} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    if (params.search) searchParams.set('search', params.search)
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/file${query ? `?${query}` : ''}`)
  }

  async uploadFile(workspaceId: string, filePath: string, fileName: string) {
    // File upload requires multipart form data - handled specially
    return this.request('POST', `/workspace/${workspaceId}/file`, {
      body: {path: filePath, name: fileName},
    })
  }

  async deleteFile(workspaceId: string, fileId: string) {
    return this.request('DELETE', `/workspace/${workspaceId}/file/${fileId}`)
  }

  async bulkDeleteFiles(workspaceId: string, fileIds: string[]) {
    return this.request('DELETE', `/workspace/${workspaceId}/file/bulk_delete`, {
      body: {ids: fileIds},
    })
  }

  // Audit Log endpoints
  async listAuditLogs(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/audit_log${query ? `?${query}` : ''}`)
  }

  async searchAuditLogs(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/audit_log/search`, {
      body: searchParams,
    })
  }

  async listGlobalAuditLogs(params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/audit_log${query ? `?${query}` : ''}`)
  }

  async searchGlobalAuditLogs(searchParams: unknown) {
    return this.request('POST', `/audit_log/search`, {
      body: searchParams,
    })
  }

  // Request History endpoints
  async listRequestHistory(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/request_history${query ? `?${query}` : ''}`)
  }

  async searchRequestHistory(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/request_history/search`, {
      body: searchParams,
    })
  }

  async listFunctionHistory(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/function_history${query ? `?${query}` : ''}`)
  }

  async searchFunctionHistory(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/function_history/search`, {
      body: searchParams,
    })
  }

  async listMiddlewareHistory(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/middleware_history${query ? `?${query}` : ''}`)
  }

  async searchMiddlewareHistory(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/middleware_history/search`, {
      body: searchParams,
    })
  }

  async listTaskHistory(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/task_history${query ? `?${query}` : ''}`)
  }

  async searchTaskHistory(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/task_history/search`, {
      body: searchParams,
    })
  }

  async listTriggerHistory(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/trigger_history${query ? `?${query}` : ''}`)
  }

  async searchTriggerHistory(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/trigger_history/search`, {
      body: searchParams,
    })
  }

  async listToolHistory(workspaceId: string, params: {page?: number; per_page?: number} = {}) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const query = searchParams.toString()
    return this.request<unknown>('GET', `/workspace/${workspaceId}/tool_history${query ? `?${query}` : ''}`)
  }

  async searchToolHistory(workspaceId: string, searchParams: unknown) {
    return this.request('POST', `/workspace/${workspaceId}/tool_history/search`, {
      body: searchParams,
    })
  }
}
