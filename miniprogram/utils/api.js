// API 请求封装
// 本地开发: http://localhost:8000
// 生产环境: 需要替换为实际域名

// ⚠️ 上线前必须替换为生产域名
const BASE_URL = 'http://localhost:8000'

// 独立于 app.globalData._loginReady 的登录 promise，防止旧代码立即 resolve 干扰
let _loginPromise = null

function _ensureLogin() {
  const app = getApp()
  if (!app || !app.globalData.devMode) return Promise.resolve()
  if (app.globalData._loggingIn && _loginPromise) return _loginPromise

  const token = wx.getStorageSync('auth_token')
  if (token && token.includes('.')) return Promise.resolve() // JWT 有效

  // 需要登录
  console.log('[request] token 无效，触发 devAutoLogin...')
  wx.removeStorageSync('auth_token')
  wx.removeStorageSync('currentUser')
  wx.removeStorageSync('userPermissions')
  _loginPromise = Promise.resolve(app._devAutoLogin())
    .then(() => {
      // 登录后检查 token 是否真的拿到了
      const newToken = wx.getStorageSync('auth_token')
      if (!newToken) {
        return Promise.reject(new Error('登录未返回 token'))
      }
    })
    .finally(() => { _loginPromise = null })
  return _loginPromise
}

async function request(path, options = {}) {
  const app = getApp()
  // devMode 下：确保有有效 JWT（skipAuth 的请求跳过，如 dev-login 本身）
  if (app && app.globalData.devMode && !options.skipAuth) {
    const loginP = _ensureLogin()
    if (loginP) {
      try {
        await Promise.race([
          loginP,
          new Promise((_, reject) => setTimeout(() => reject(new Error('登录超时')), 15000)),
        ])
      } catch (e) {
        console.error('登录失败:', e.message)
        wx.showToast({ title: '登录失败，请检查服务是否启动', icon: 'none', duration: 3000 })
        return Promise.reject(new Error('登录失败: ' + e.message))
      }
    }
  }

  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('auth_token')
    const req = wx.request({
      url: `${BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || 60000,
      header: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { 'Authorization': 'Bearer ' + token } : {}
      ),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          _loginPromise = null
          wx.removeStorageSync('auth_token')
          wx.removeStorageSync('currentUser')
          wx.removeStorageSync('userPermissions')
          const app = getApp()
          if (app) {
            app.globalData.token = ''
            app.globalData.currentUser = null
            app.globalData.permissions = []
          }
          wx.showToast({ title: '登录已过期', icon: 'none' })
          setTimeout(() => wx.reLaunch({ url: '/pages/login/index' }), 1500)
          reject(new Error('登录已过期'))
        } else {
          const msg = res.data?.detail || res.data?.message || res.data?.error || '请求失败'
          console.error('[request] 请求失败:', path, 'status:', res.statusCode, 'msg:', msg)
          if (!options.silent) wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
        }
      },
      fail: (err) => {
        console.error('[request] 网络错误:', path, err)
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
  reorder: (ids) => request('/api/visits/reorder', { method: 'POST', data: { ids } }),
}

// 活动 API
const classRecordApi = {
  dashboard: (date, spaceId) => {
    const params = [`date=${date}`]
    if (spaceId) params.push(`space_id=${spaceId}`)
    return request(`/api/class-records/dashboard?${params.join('&')}`)
  },
  create: (data) => request('/api/class-records', { method: 'POST', data }),
  update: (id, data) => request(`/api/class-records/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/class-records/${id}`, { method: 'DELETE' }),
}

// 课程类型 API
const courseTypeApi = {
  list: () => request('/api/course-types'),
}

// 觉醒游戏 API
const groupCaseSessionApi = {
  create: (data) => request('/api/group-case-sessions', { method: 'POST', data }),
  update: (id, data) => request(`/api/group-case-sessions/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/group-case-sessions/${id}`, { method: 'DELETE' }),
}

// 情绪释放 API
const emotionalReleaseSessionApi = {
  create: (data) => request('/api/emotional-release-sessions', { method: 'POST', data }),
  update: (id, data) => request(`/api/emotional-release-sessions/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/emotional-release-sessions/${id}`, { method: 'DELETE' }),
}

// 能量结 API
const energyKnotSessionApi = {
  create: (data) => request('/api/energy-knot-sessions', { method: 'POST', data }),
  update: (id, data) => request(`/api/energy-knot-sessions/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/energy-knot-sessions/${id}`, { method: 'DELETE' }),
}

// 内部课程 API
const internalCourseSessionApi = {
  create: (data) => request('/api/internal-course-sessions', { method: 'POST', data }),
  update: (id, data) => request(`/api/internal-course-sessions/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/internal-course-sessions/${id}`, { method: 'DELETE' }),
}

// OH卡 API
const ohCardReadingSessionApi = {
  create: (data) => request('/api/oh-card-reading-sessions', { method: 'POST', data }),
  update: (id, data) => request(`/api/oh-card-reading-sessions/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/oh-card-reading-sessions/${id}`, { method: 'DELETE' }),
}

// 分组 API
const dailyGroupingApi = {
  get: (date) => request(`/api/daily-groupings?date=${date}`),
  upsert: (data) => request('/api/daily-groupings', { method: 'PUT', data }),
}

// 客户 API
const customerApi = {
  light: (limit) => request(`/api/customers/light${limit ? '?limit=' + limit : ''}`),
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
  delete: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),
}

// 空间 API
const spaceApi = {
  list: () => request('/api/spaces'),
}

// 组织 API
const organizationApi = {
  list: () => request('/api/organizations'),
}

// 会员身份 API
const memberIdentityApi = {
  list: () => request('/api/member-identities'),
}

// 登录 API
const authApi = {
  login: (code) => request('/api/wechat/login', { method: 'POST', data: { code } }),
  phoneLogin: (code) => request('/api/wechat/phone-login', { method: 'POST', data: { code } }),
  devLogin: (username) => request('/api/wechat/dev-login', { method: 'POST', data: { username }, skipAuth: true }),
  passwordLogin: (username, password) => request('/api/accounts/login', { method: 'POST', data: { username, password } }),
  bind: (token, username, password) => request('/api/wechat/bind', { method: 'POST', data: { token, username, password } }),
}

// ---- 付费项目 API ----

// 项目类型常量（列表 Tab、销卡、退费统一使用）
const PAYMENT_PROJECT_TYPES = [
  { key: 'membership_card', label: '会员卡', apiPath: 'membership-cards' },
  { key: 'group_case', label: '觉醒游戏', apiPath: 'group-cases' },
  { key: 'emotional_release', label: '情绪释放', apiPath: 'emotional-releases' },
  { key: 'oh_card_reading', label: 'OH卡梳理', apiPath: 'oh-card-readings' },
  { key: 'energy_knot', label: '能量结', apiPath: 'energy-knots' },
  { key: 'internal_course', label: '内部课程', apiPath: 'internal-courses' },
  { key: 'other', label: '其他项目', apiPath: 'other-projects' },
]

// 通用项目 CRUD 工厂
function _projectApi(basePath) {
  return {
    get: (id) => request(`${basePath}/${id}`),
    list: (params = {}) => {
      const qs = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&')
      return request(`${basePath}${qs ? '?' + qs : ''}`)
    },
    listPaginated: (page = 1, pageSize = 20, params = {}) => {
      const qs = [`page=${page}`, `page_size=${pageSize}`]
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.push(`${k}=${encodeURIComponent(v)}`)
      })
      return request(`${basePath}?${qs.join('&')}`)
    },
    create: (data) => request(basePath, { method: 'POST', data }),
    update: (id, data) => request(`${basePath}/${id}`, { method: 'PATCH', data }),
    delete: (id) => request(`${basePath}/${id}`, { method: 'DELETE' }),
    searchCustomers: (q) => request(`${basePath}/search-customers?q=${encodeURIComponent(q)}`),
  }
}

const paymentApi = {
  membershipCards: _projectApi('/api/membership-cards'),
  groupCases: _projectApi('/api/group-cases'),
  emotionalReleases: _projectApi('/api/emotional-releases'),
  ohCardReadings: _projectApi('/api/oh-card-readings'),
  energyKnots: _projectApi('/api/energy-knots'),
  internalCourses: _projectApi('/api/internal-courses'),
  otherProjects: Object.assign(_projectApi('/api/other-projects'), {
    getAvailableProjects: (customerId) => request(`/api/other-projects/${customerId}/available-projects`),
    deduct: (data) => request('/api/other-projects/deductions', { method: 'POST', data }),
    listDeductions: (customerId) => {
      const qs = customerId ? `?customer_id=${customerId}` : ''
      return request(`/api/other-projects/deductions${qs}`)
    },
  }),

  // 项目类型 → API 映射
  getByType(type) {
    const map = {
      membership_card: this.membershipCards,
      group_case: this.groupCases,
      emotional_release: this.emotionalReleases,
      oh_card_reading: this.ohCardReadings,
      energy_knot: this.energyKnots,
      internal_course: this.internalCourses,
      other: this.otherProjects,
    }
    return map[type]
  },

  // 销卡
  deductions: {
    list: (params = {}) => {
      const qs = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&')
      return request(`/api/project-deductions${qs ? '?' + qs : ''}`)
    },
    create: (data) => {
      const user = getApp()?.globalData?.currentUser
      if (!data.created_by && user) data.created_by = user.owner ?? user.username ?? ''
      return request('/api/project-deductions', { method: 'POST', data })
    },
    update: (id, data) => request(`/api/project-deductions/${id}`, { method: 'PATCH', data }),
    delete: (id) => request(`/api/project-deductions/${id}`, { method: 'DELETE' }),
    availableItems: (customerId, projectType) =>
      request(`/api/project-deductions/available-items?customer_id=${customerId}&project_type=${projectType}`),
  },

  // 退费
  refunds: {
    list: (params = {}) => {
      const qs = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&')
      return request(`/api/project-refunds${qs ? '?' + qs : ''}`)
    },
    create: (data) => {
      const user = getApp()?.globalData?.currentUser
      if (!data.created_by && user) data.created_by = user.owner ?? user.username ?? ''
      return request('/api/project-refunds', { method: 'POST', data })
    },
    update: (id, data) => request(`/api/project-refunds/${id}`, { method: 'PATCH', data }),
    delete: (id) => request(`/api/project-refunds/${id}`, { method: 'DELETE' }),
    availableItems: (customerId, projectType) =>
      request(`/api/project-refunds/available-items?customer_id=${customerId}&project_type=${projectType}`),
  },
}

module.exports = {
  request,
  visitApi,
  classRecordApi,
  customerApi,
  spaceApi,
  organizationApi,
  memberIdentityApi,
  authApi,
  dailyGroupingApi,
  courseTypeApi,
  PAYMENT_PROJECT_TYPES,
  groupCaseSessionApi,
  emotionalReleaseSessionApi,
  energyKnotSessionApi,
  internalCourseSessionApi,
  ohCardReadingSessionApi,
  paymentApi,
}
