// API 请求封装
// 后端地址由 utils/config.js 的 DEV 总开关决定（上线/提审前切为 false 即指向生产）
const { BASE_URL } = require('./config')

// 独立于 app.globalData._loginReady 的登录 promise，防止旧代码立即 resolve 干扰
let _loginPromise = null

// base64 字符表（JWT 使用 base64url，解码前需先替换 -/_ 并补齐 padding）
const _B64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// base64url 解码为字符串：纯 JS 实现，不依赖 atob / wx.base64ToArrayBuffer（小程序 JSCore 通用）
function _base64UrlDecode(input) {
  // base64url -> base64：恢复标准字符集
  let b64 = String(input).replace(/-/g, '+').replace(/_/g, '/')
  // 补齐 padding；长度 mod 4 === 1 在 base64 中不可能出现，直接判非法
  const remainder = b64.length % 4
  if (remainder === 1) return null
  if (remainder === 2) b64 += '=='
  else if (remainder === 3) b64 += '='

  // 每 4 个字符解出最多 3 个字节
  const bytes = []
  for (let i = 0; i < b64.length; i += 4) {
    const c1 = _B64_TABLE.indexOf(b64[i])
    const c2 = _B64_TABLE.indexOf(b64[i + 1])
    const c3 = b64[i + 2] === '=' ? -1 : _B64_TABLE.indexOf(b64[i + 2])
    const c4 = b64[i + 3] === '=' ? -1 : _B64_TABLE.indexOf(b64[i + 3])
    if (c1 < 0 || c2 < 0) return null
    const n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4)
    bytes.push((n >> 16) & 0xff)
    if (c3 >= 0) bytes.push((n >> 8) & 0xff)
    if (c4 >= 0) bytes.push(n & 0xff)
  }

  // 按 UTF-8 还原字符串（payload 可能含中文用户名等非 ASCII 字符）
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]
    if (byte < 0x80) {
      str += String.fromCharCode(byte)
    } else if (byte < 0xe0) {
      str += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++i] & 0x3f))
    } else if (byte < 0xf0) {
      str += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f))
    } else {
      // 4 字节序列（如 emoji），转为 UTF-16 代理对
      let code = ((byte & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)
      code -= 0x10000
      str += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff))
    }
  }
  return str
}

// 校验 JWT 是否仍在有效期内：解析 payload 的 exp（秒级时间戳），
// 解析失败、无 exp 或已过期一律视为无效，触发重新登录
function _isTokenValid(token) {
  try {
    if (!token || typeof token !== 'string') return false
    const parts = token.split('.')
    if (parts.length !== 3) return false // JWT 固定三段结构
    const payloadStr = _base64UrlDecode(parts[1])
    if (!payloadStr) return false
    const payload = JSON.parse(payloadStr)
    if (typeof payload.exp !== 'number') return false // 无 exp 视为无效
    // 预留 30 秒缓冲，避免请求到达后端时刚好过期造成间歇性 401
    return payload.exp * 1000 > Date.now() + 30 * 1000
  } catch (e) {
    console.warn('[request] token 解析失败，视为无效:', e)
    return false
  }
}

// dev-login 只是开发便利：任何时候它失败都不允许阻断业务请求，
// 降级为无 token 直连（后端返回 401 时走统一的重新登录流程）。
// 因此本函数永不 reject——历史上的驳回报错文案已随之从代码中物理删除。
function _ensureLogin() {
  const app = getApp()
  if (!app || !app.globalData.devMode) return Promise.resolve()
  if (app.globalData._loggingIn && _loginPromise) return _loginPromise

  const token = wx.getStorageSync('auth_token')
  if (_isTokenValid(token)) return Promise.resolve() // JWT 未过期

  // 需要登录：尝试 dev-login，失败仅降级放行，不影响正常登录流程
  console.log('[request] token 无效，尝试 devAutoLogin（失败将降级放行）...')
  wx.removeStorageSync('auth_token')
  wx.removeStorageSync('currentUser')
  wx.removeStorageSync('userPermissions')
  _loginPromise = Promise.resolve(app._devAutoLogin())
    .catch((err) => {
      console.warn('[request] devAutoLogin 失败，本次请求降级为无 token 直连:', err)
    })
    .finally(() => { _loginPromise = null })
  return _loginPromise
}

async function request(path, options = {}) {
  const app = getApp()
  // devMode 下：先尽力确保有有效 JWT（skipAuth 的请求跳过，如登录类请求）。
  // _ensureLogin 设计上永不 reject；等待超时也只是放行——dev-login 任何异常都不得阻断业务请求。
  if (app && app.globalData.devMode && !options.skipAuth) {
    await Promise.race([
      _ensureLogin(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ])
  }

  return new Promise((resolve, reject) => {
    // skipAuth（登录类）请求不附带 token：建立会话不需要已有会话，
    // 也避免过期 token 触发后端 AuthMiddleware 误拒登录请求
    const token = options.skipAuth ? '' : wx.getStorageSync('auth_token')
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
// 结构性保险：所有「建立会话」的登录类请求一律 skipAuth。
// 登录请求本身不需要 token，因此绝不等待/依赖 dev-login——
// 即使 devMode 判断失灵，dev-login 失败也永远无法阻断账号密码登录。
const authApi = {
  login: (code) => request('/api/wechat/login', { method: 'POST', data: { code }, skipAuth: true }),
  phoneLogin: (code) => request('/api/wechat/phone-login', { method: 'POST', data: { code }, skipAuth: true }),
  devLogin: (username) => request('/api/wechat/dev-login', { method: 'POST', data: { username }, skipAuth: true }),
  passwordLogin: (username, password) => request('/api/accounts/login', { method: 'POST', data: { username, password }, skipAuth: true }),
  bind: (token, username, password) => request('/api/wechat/bind', { method: 'POST', data: { token, username, password }, skipAuth: true }),
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

// 沟通记录
const communicationRecordApi = {
  list: (customerNickname) => {
    const qs = customerNickname ? `?customer_nickname=${encodeURIComponent(customerNickname)}` : ''
    return request(`/api/communication-records${qs}`)
  },
  create: (data) => request('/api/communication-records', { method: 'POST', data }),
  update: (id, data) => request(`/api/communication-records/${id}`, { method: 'PUT', data }),
  delete: (id) => request(`/api/communication-records/${id}`, { method: 'DELETE' }),
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
  communicationRecordApi,
}
