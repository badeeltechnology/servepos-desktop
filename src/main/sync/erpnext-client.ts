import { getConfig } from '../database/queries'

interface FrappeResponse<T = any> {
  message?: T
  data?: T
  exc?: string
  _server_messages?: string
}

// Track which URL is currently working so we try it first
let activeUrlIndex = 0

function getUrls(): string[] {
  const primary = getConfig('erpnext_url') || ''
  const fallback = getConfig('erpnext_url_fallback') || ''
  const urls = [primary]
  if (fallback && fallback !== primary) urls.push(fallback)
  return urls
}

function isNetworkError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase()
  return err?.name === 'TypeError' ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('dns') ||
    msg.includes('socket')
}

// Exported for direct fetch calls outside ERPNextClient
export function getActiveUrl(): string {
  const urls = getUrls()
  return urls[activeUrlIndex] || urls[0] || ''
}

export class ERPNextClient {
  private apiKey: string
  private apiSecret: string

  constructor() {
    this.apiKey = getConfig('api_key') || ''
    this.apiSecret = getConfig('api_secret') || ''
  }

  private get baseUrl(): string {
    return getActiveUrl()
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `token ${this.apiKey}:${this.apiSecret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  }

  private async fetchWithFallback(path: string, init?: RequestInit): Promise<Response> {
    const urls = getUrls()
    // Try the active URL first, then fallback
    const order = urls.length > 1
      ? [urls[activeUrlIndex], urls[1 - activeUrlIndex]]
      : urls

    for (let i = 0; i < order.length; i++) {
      const url = order[i]
      try {
        const res = await fetch(`${url}${path}`, { ...init, headers: this.headers, signal: init?.signal || AbortSignal.timeout(15000) })
        // If this wasn't the active URL, switch to it
        if (i > 0) {
          activeUrlIndex = urls.indexOf(url)
          console.log(`[ERPNext] Switched to fallback URL: ${url}`)
        }
        return res
      } catch (err: any) {
        if (isNetworkError(err) && i < order.length - 1) {
          console.warn(`[ERPNext] ${url} unreachable, trying fallback...`)
          continue
        }
        throw err
      }
    }
    throw new Error('No ERPNext URL configured')
  }

  async testConnection(): Promise<{ success: boolean; user?: string; error?: string }> {
    try {
      const res = await this.fetchWithFallback('/api/method/frappe.auth.get_logged_user')
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

    const res = await this.fetchWithFallback(`/api/resource/${doctype}?${params}`)
    if (!res.ok) throw new Error(`Failed to fetch ${doctype}: ${res.status}`)
    const data: FrappeResponse = await res.json()
    return data.data || []
  }

  async getDoc(doctype: string, name: string): Promise<any> {
    const res = await this.fetchWithFallback(`/api/resource/${doctype}/${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error(`Failed to fetch ${doctype}/${name}: ${res.status}`)
    const data: FrappeResponse = await res.json()
    return data.data
  }

  async callMethod(method: string, args?: Record<string, any>): Promise<any> {
    const res = await this.fetchWithFallback(`/api/method/${method}`, {
      method: 'POST',
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
    const res = await this.fetchWithFallback(`/api/resource/${doctype}`, {
      method: 'POST',
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
    const res = await this.fetchWithFallback(`/api/resource/${doctype}/${encodeURIComponent(name)}`, {
      method: 'PUT',
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

  /** Item codes this profile may sell right now (servepos.api.registry.get_active_item_codes). */
  async getActiveItemCodes(posProfile?: string): Promise<string[]> {
    const pos_profile = this.requireProfile(posProfile)
    return this.callMethod('servepos.api.registry.get_active_item_codes', { pos_profile })
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
