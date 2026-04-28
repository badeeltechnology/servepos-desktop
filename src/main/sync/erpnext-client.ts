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
    if (options?.limit !== undefined) params.set('limit_page_length', options.limit === 0 ? '0' : String(options.limit))
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

  // ---------------------------------------------------------------------
  // Registry-backed convenience methods.
  // All list APIs below call servepos.api.registry.* — the single source of
  // truth for POS Profile filtering. Do NOT bypass with raw getList().
  // ---------------------------------------------------------------------

  private requireProfile(profile?: string): string {
    const p = profile || getConfig('pos_profile') || ''
    if (!p) throw new Error('pos_profile is required. Configure the device POS Profile first.')
    return p
  }

  async getItems(lastSync?: string, posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    const args: any = { pos_profile }
    if (lastSync) args.modified_after = lastSync
    return this.callMethod('servepos.api.registry.get_items', args)
  }

  async getItemGroups(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_item_groups', { pos_profile })
  }

  async getPaymentMethods(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_payment_methods', { pos_profile })
  }

  async getTables(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_tables', { pos_profile })
  }

  async getRooms(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_rooms', { pos_profile })
  }

  async getModifierGroups(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_modifier_groups', { pos_profile })
  }

  async getItemModifiers(itemCode: string): Promise<any[]> {
    return this.callMethod('servepos.api.pos_session.get_item_modifiers', { item_code: itemCode })
  }

  async getKitchenStations(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_kitchen_stations', { pos_profile })
  }

  async getPromos(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_promos', { pos_profile })
  }

  async getVoidReasons(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_void_reasons', { pos_profile })
  }

  async getPendingWaiterOrders(posProfile?: string): Promise<any[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_active_orders', {
      pos_profile,
      statuses: 'Pending',
    })
  }

  async getPosBundle(posProfile?: string): Promise<any> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_pos_bundle', { pos_profile })
  }

  async acceptWaiterOrder(orderName: string, posOrderId: string): Promise<any> {
    return this.callMethod('servepos.api.waiter.accept_order', { order_name: orderName, pos_order_id: posOrderId })
  }

  async getTaxTemplates(company: string): Promise<any[]> {
    return this.getList('Sales Taxes and Charges Template', {
      fields: ['name'],
      filters: { company },
      limit: 100
    })
  }
}
