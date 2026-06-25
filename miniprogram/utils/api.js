// API 请求封装
// 本地开发: http://localhost:8000
// 生产环境: 需要替换为实际域名

const BASE_URL = 'http://localhost:8000'

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('auth_token')
    const req = wx.request({
      url: `${BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: 30000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('auth_token')
          wx.removeStorageSync('currentUser')
          wx.removeStorageSync('userPermissions')
          const app = getApp()
          if (app) {
            app.globalData.token = ''
            app.globalData.currentUser = null
          }
          wx.showToast({ title: '登录已过期', icon: 'none' })
          reject(new Error('登录已过期'))
        } else {
          const msg = res.data?.detail || res.data?.message || '请求失败'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络错误', icon: 'none' })
        reject(err)
      },
    })
  })
}

// 访客 API
const visitApi = {
  list: (date, spaceId) => {
    const params = []
    if (date) params.push(`date=${date}`)
    if (spaceId) params.push(`space_id=${spaceId}`)
    return request(`/api/visits${params.length ? '?' + params.join('&') : ''}`)
  },
  listLight: (date, spaceId) => {
    const params = []
    if (date) params.push(`date=${date}`)
    if (spaceId) params.push(`space_id=${spaceId}`)
    return request(`/api/visits/light${params.length ? '?' + params.join('&') : ''}`)
  },
  get: (id) => request(`/api/visits/${id}`),
  create: (data) => request('/api/visits', { method: 'POST', data }),
  update: (id, data) => request(`/api/visits/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/visits/${id}`, { method: 'DELETE' }),
  counts: (params = {}) => {
    const qs = Object.entries(params)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return request(`/api/visits/counts${qs ? '?' + qs : ''}`)
  },
  searchCustomers: (q) => request(`/api/visits/search-customers?q=${encodeURIComponent(q)}`),
}

// 活动 API
const classRecordApi = {
  dashboard: (date, spaceId) => {
    const params = [`date=${date}`]
    if (spaceId) params.push(`space_id=${spaceId}`)
    return request(`/api/class-records/dashboard?${params.join('&')}`)
  },
}

// 分组 API
const dailyGroupingApi = {
  get: (date) => request(`/api/daily-groupings?date=${date}`),
  upsert: (data) => request('/api/daily-groupings', { method: 'PUT', data }),
}

// 客户 API
const customerApi = {
  light: () => request('/api/customers/light'),
  detail: (id) => request(`/api/customer-detail/${id}`),
  list: (params = {}) => {
    const qs = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return request(`/api/customers${qs ? '?' + qs : ''}`)
  },
  create: (data) => request('/api/customers', { method: 'POST', data }),
  update: (id, data) => request(`/api/customers/${id}`, { method: 'PATCH', data }),
}

// 空间 API
const spaceApi = {
  list: () => request('/api/spaces'),
}

// 会员身份 API
const memberIdentityApi = {
  list: () => request('/api/member-identities'),
}

// 登录 API
const authApi = {
  login: (code) => request('/api/wechat/login', { method: 'POST', data: { code } }),
  phoneLogin: (code) => request('/api/wechat/phone-login', { method: 'POST', data: { code } }),
  devLogin: (username) => request('/api/wechat/dev-login', { method: 'POST', data: { username } }),
  bind: (token, username, password) => request('/api/wechat/bind', { method: 'POST', data: { token, username, password } }),
}

module.exports = {
  request,
  visitApi,
  classRecordApi,
  customerApi,
  spaceApi,
  memberIdentityApi,
  authApi,
  dailyGroupingApi,
}
