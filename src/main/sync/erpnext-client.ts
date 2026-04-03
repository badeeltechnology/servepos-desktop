import { getConfig } from '../database/queries'

interface FrappeResponse<T = any> {
  message?: T
  data?: T
  exc?: string
  _server_messages?: string
}

export class ERPNextClient {
  private baseUrl: string
  private apiKey: string
  private apiSecret: string

  constructor() {
    this.baseUrl = getConfig('erpnext_url') || ''
    this.apiKey = getConfig('api_key') || ''
    this.apiSecret = getConfig('api_secret') || ''
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `token ${this.apiKey}:${this.apiSecret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  }

  async testConnection(): Promise<{ success: boolean; user?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        headers: this.headers
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const data: FrappeResponse<string> = await res.json()
      return { success: true, user: data.message }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async getList(doctype: string, options?: {
    fields?: string[]
    filters?: Record<string, any>
    limit?: number
    orderBy?: string
  }): Promise<any[]> {
    const params = new URLSearchParams()
    if (options?.fields) params.set('fields', JSON.stringify(options.fields))
    if (options?.filters) params.set('filters', JSON.stringify(options.filters))
    if (options?.limit) params.set('limit_page_length', String(options.limit))
    if (options?.orderBy) params.set('order_by', options.orderBy)

    const res = await fetch(`${this.baseUrl}/api/resource/${doctype}?${params}`, {
      headers: this.headers
    })
    if (!res.ok) throw new Error(`Failed to fetch ${doctype}: ${res.status}`)
    const data: FrappeResponse = await res.json()
    return data.data || []
  }

  async getDoc(doctype: string, name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/resource/${doctype}/${encodeURIComponent(name)}`, {
      headers: this.headers
    })
    if (!res.ok) throw new Error(`Failed to fetch ${doctype}/${name}: ${res.status}`)
    const data: FrappeResponse = await res.json()
    return data.data
  }

  async callMethod(method: string, args?: Record<string, any>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/method/${method}`, {
      method: 'POST',
      headers: this.headers,
      body: args ? JSON.stringify(args) : undefined
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Method ${method} failed: ${res.status} - ${text}`)
    }
    const data: FrappeResponse = await res.json()
    return data.message
  }

  async createDoc(doctype: string, doc: Record<string, any>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/resource/${doctype}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(doc)
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Create ${doctype} failed: ${res.status} - ${text}`)
    }
    const data: FrappeResponse = await res.json()
    return data.data
  }

  async submitDoc(doctype: string, name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/resource/${doctype}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ docstatus: 1 })
    })
    if (!res.ok) throw new Error(`Submit ${doctype}/${name} failed: ${res.status}`)
    const data: FrappeResponse = await res.json()
    return data.data
  }

  // ==================== Convenience methods ====================

  async getCompanies(): Promise<string[]> {
    const list = await this.getList('Company', { fields: ['name'], limit: 100 })
    return list.map((c: any) => c.name)
  }

  async getPosProfiles(company?: string): Promise<any[]> {
    const filters: any = {}
    if (company) filters.company = company
    return this.getList('POS Profile', {
      fields: ['name', 'company', 'warehouse', 'currency'],
      filters,
      limit: 100
    })
  }

  async getItems(lastSync?: string): Promise<any[]> {
    const filters: any = { disabled: 0 }
    if (lastSync) filters.modified = ['>', lastSync]
    return this.getList('Item', {
      fields: [
        'name', 'item_name', 'item_group', 'standard_rate',
        'stock_uom', 'image', 'has_variants', 'variant_of',
        'servepos_kitchen_station', 'servepos_preparation_time',
        'servepos_is_available'
      ],
      filters,
      limit: 0
    })
  }

  async getItemGroups(): Promise<any[]> {
    return this.getList('Item Group', {
      fields: ['name', 'parent_item_group', 'image'],
      limit: 0
    })
  }

  async getPaymentMethods(posProfile: string): Promise<any[]> {
    const doc = await this.getDoc('POS Profile', posProfile)
    return doc?.payments || []
  }

  async getTables(): Promise<any[]> {
    return this.getList('ServePOS Table', {
      fields: ['name', 'table_name', 'room', 'capacity', 'is_active'],
      limit: 0
    })
  }

  async getRooms(): Promise<any[]> {
    return this.getList('ServePOS Room', {
      fields: ['name', 'room_name', 'description', 'is_active'],
      limit: 0
    })
  }

  async getTaxTemplates(company: string): Promise<any[]> {
    return this.getList('Sales Taxes and Charges Template', {
      fields: ['name'],
      filters: { company },
      limit: 100
    })
  }
}
