const TOKEN_STORAGE_KEY = 'client_token'
const CUSTOMER_STORAGE_KEY = 'client_customer'

function decodeTokenPayload(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const bytes = wx.base64ToArrayBuffer(base64)
    const payload = decodeURIComponent(
      Array.from(new Uint8Array(bytes))
        .map(byte => `%${byte.toString(16).padStart(2, '0')}`)
        .join('')
    )
    return JSON.parse(payload)
  } catch (e) {
    return null
  }
}

function restoreCustomerFromToken(token) {
  const payload = decodeTokenPayload(token)
  if (!payload || payload.role !== 'customer') return null
  const id = payload.customer_id || payload.sub || ''
  const nickname = payload.username || ''
  if (!id || !nickname) return null
  return { id, nickname, member_type: '' }
}

App({
  globalData: {
    token: '',
    customer: null,
  },

  onLaunch() {
    const token = wx.getStorageSync(TOKEN_STORAGE_KEY)
    if (!token) return

    const cachedCustomer = wx.getStorageSync(CUSTOMER_STORAGE_KEY)
    const customer = cachedCustomer || restoreCustomerFromToken(token)
    if (!customer) {
      this.clearLogin()
      return
    }

    this.globalData.token = token
    this.globalData.customer = customer
    if (!cachedCustomer) wx.setStorageSync(CUSTOMER_STORAGE_KEY, customer)
  },

  // 检查登录状态
  isLoggedIn() {
    return !!(this.globalData.token && this.globalData.customer)
  },

  // 保存登录信息
  saveLogin(token, customer) {
    this.globalData.token = token
    this.globalData.customer = customer
    wx.setStorageSync(TOKEN_STORAGE_KEY, token)
    wx.setStorageSync(CUSTOMER_STORAGE_KEY, customer)
  },

  // 后端滑动续期时只更新 token，保留当前客户资料
  updateToken(token) {
    if (!token) return
    this.globalData.token = token
    wx.setStorageSync(TOKEN_STORAGE_KEY, token)
  },

  clearLogin() {
    this.globalData.token = ''
    this.globalData.customer = null
    wx.removeStorageSync(TOKEN_STORAGE_KEY)
    wx.removeStorageSync(CUSTOMER_STORAGE_KEY)
  },

  // 退出登录
  logout() {
    this.clearLogin()
  },
})
