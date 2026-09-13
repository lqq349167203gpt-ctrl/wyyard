console.log('[app.js] 文件已加载')

// 开发模式总开关：由 utils/config.js 的 DEV 决定。
// 提审前 DEV 切为 false 后，dev 自动登录等全部调试逻辑随之关闭。
const { DEV } = require('./utils/config')

// 页面权限别名（与 PC 端 page-permissions.ts 保持一致）
var PERMISSION_ALIASES = {
  'daily-report': ['statistics'],
  'class-records': ['class-records-visitors', 'class-records-activities', 'class-records-arrival'],
  'daily-activities': ['class-records-activities'],
  'payment': ['membership-cards', 'group-cases', 'emotional-releases', 'oh-card-readings', 'energy-knots', 'internal-courses', 'tea-seat-fees', 'offline-courses', 'other-projects'],
  'payment-deductions': ['membership-cards', 'group-cases', 'emotional-releases', 'energy-knots', 'internal-courses', 'other-projects'],
  'payment-refunds': ['membership-cards', 'group-cases', 'emotional-releases', 'oh-card-readings', 'energy-knots', 'internal-courses', 'tea-seat-fees', 'other-projects'],
}

App({
  globalData: {
    token: '',
    currentUser: null,
    permissions: [],
    editPermissions: { customers: 'all', visits: 'own', activities: 'own', activity_teachers: 'own', activity_participants: 'all', activity_lock: false, visit_lock: false, payments: 'all' },
    // 开发模式开关：手动维护，提审前必须为 false（check-release.sh 强制拦截）
    devMode: DEV,
    _selectedActivity: null,
    _loginReady: null, // Promise，登录完成后 resolve
    _usageTimer: null,
    _usageStartTimer: null,
    _usageSessionId: '',
    _usagePagePath: '',
    _usageActive: false,
  },

  onLaunch() {
    // 启动只恢复本地登录态；开发版的自动登录已移除（它会清掉使用者自己登录的 token）。
    // 免登录由登录页的登录态探测负责，失效时回落到账号密码（记住密码）。
    // 数据源换了（本地 ↔ 正式服务器）就清掉登录态，避免一直弹「网络不稳定」
    if (require('./utils/api').ensureAuthSource()) return
    const token = wx.getStorageSync('auth_token')
    const user = wx.getStorageSync('currentUser')
    if (token && user) {
      this.globalData.token = token
      this.globalData.currentUser = user
      this.globalData.permissions = wx.getStorageSync('userPermissions') || []
      this.globalData.editPermissions = wx.getStorageSync('userEditPermissions') || { customers: 'all', visits: 'own', activities: 'own', activity_teachers: 'own', activity_participants: 'all', activity_lock: false, visit_lock: false, payments: 'all' }
    }
    this.globalData._loginReady = Promise.resolve()
  },

  onShow() {
    Promise.resolve(this.globalData._loginReady).catch(() => {}).then(() => {
      if (!this.globalData.devMode && this.globalData.token) {
        this.refreshPermissions().catch(() => {})
      }
      if (this.globalData.token) this.scheduleUsageTracking()
    })
  },

  onHide() {
    this.stopUsageTracking()
  },

  _currentPagePath() {
    const pages = getCurrentPages()
    const current = pages && pages.length ? pages[pages.length - 1] : null
    return current && current.route ? '/' + current.route : ''
  },

  _newUsageSessionId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
  },

  _sendUsageHeartbeat(active) {
    if (!this.globalData.token || !this.globalData._usageSessionId) return Promise.resolve()
    const { usageTrackingApi } = require('./utils/api')
    const currentPagePath = this._currentPagePath()
    if (currentPagePath && currentPagePath !== '/pages/login/index') {
      this.globalData._usagePagePath = currentPagePath
    }
    const pagePath = this.globalData._usagePagePath
    return usageTrackingApi.heartbeat(this.globalData._usageSessionId, pagePath, active).catch(() => {})
  },

  scheduleUsageTracking(attempt) {
    const retryCount = Number(attempt) || 0
    if (this.globalData._usageStartTimer) clearTimeout(this.globalData._usageStartTimer)
    this.globalData._usageStartTimer = setTimeout(() => {
      this.globalData._usageStartTimer = null
      if (!this.globalData.token || this.globalData._usageActive) return
      const started = this.startUsageTracking()
      if (!started && retryCount < 10) this.scheduleUsageTracking(retryCount + 1)
    }, retryCount === 0 ? 0 : 200)
  },

  startUsageTracking(pagePath) {
    if (!this.globalData.token) return false
    const activePagePath = pagePath || this._currentPagePath()
    if (!activePagePath || activePagePath === '/pages/login/index') return false
    if (!this.globalData._usageSessionId) this.globalData._usageSessionId = this._newUsageSessionId()
    this.globalData._usagePagePath = activePagePath
    this.globalData._usageActive = true
    this._sendUsageHeartbeat(true)
    if (!this.globalData._usageTimer) {
      this.globalData._usageTimer = setInterval(() => this._sendUsageHeartbeat(true), 30000)
    }
    return true
  },

  trackUsagePage(pagePath) {
    if (!pagePath || pagePath === '/pages/login/index') return
    if (!this.globalData._usageActive) {
      this.globalData._usagePagePath = pagePath
      this.startUsageTracking(pagePath)
      return
    }
    if (pagePath === this.globalData._usagePagePath) return
    this.globalData._usagePagePath = pagePath
    setTimeout(() => this._sendUsageHeartbeat(true), 0)
  },

  stopUsageTracking() {
    if (this.globalData._usageStartTimer) {
      clearTimeout(this.globalData._usageStartTimer)
      this.globalData._usageStartTimer = null
    }
    if (this.globalData._usageTimer) {
      clearInterval(this.globalData._usageTimer)
      this.globalData._usageTimer = null
    }
    if (this.globalData._usageActive) this._sendUsageHeartbeat(false)
    this.globalData._usageActive = false
    this.globalData._usageSessionId = ''
    this.globalData._usagePagePath = ''
  },

  async refreshPermissions() {
    const user = this.globalData.currentUser
    if (!user || !user.role || user.role === '超级管理员') {
      return this.globalData.permissions || []
    }
    const { positionPermissionApi } = require('./utils/api')
    const result = await positionPermissionApi.getMine()
    const permissions = (result && result.pages) || []
    const editPermissions = (result && result.edit_permissions) || { customers: 'all', visits: 'own', activities: 'own', activity_teachers: 'own', activity_participants: 'all', activity_lock: false, visit_lock: false, payments: 'all' }
    this.globalData.permissions = permissions
    this.globalData.editPermissions = editPermissions
    wx.setStorageSync('userPermissions', permissions)
    wx.setStorageSync('userEditPermissions', editPermissions)
    return permissions
  },

  checkLogin() {
    // 开发模式跳过登录检查
    if (this.globalData.devMode) {
      return true
    }
    if (!this.globalData.token) {
      wx.reLaunch({ url: '/pages/login/index' })
      return false
    }
    return true
  },

  // 检查页面权限（与 PC 端 hasPagePermission 逻辑一致）
  checkPagePermission(pageKey) {
    var user = this.globalData.currentUser
    if (user && user.role === '超级管理员') return true
    var permissions = this.globalData.permissions || []
    if (permissions.indexOf(pageKey) !== -1) return true
    var aliases = PERMISSION_ALIASES[pageKey] || []
    for (var i = 0; i < aliases.length; i++) {
      if (permissions.indexOf(aliases[i]) !== -1) return true
    }
    return false
  },

  logout() {
    this.stopUsageTracking()
    wx.removeStorageSync('auth_token')
    wx.removeStorageSync('currentUser')
    wx.removeStorageSync('userPermissions')
    wx.removeStorageSync('userEditPermissions')
    this.globalData.token = ''
    this.globalData.currentUser = null
    this.globalData.permissions = []
    this.globalData.editPermissions = { customers: 'all', visits: 'own', activities: 'own', activity_teachers: 'own', activity_participants: 'all', activity_lock: false, visit_lock: false, payments: 'all' }
    wx.reLaunch({ url: '/pages/login/index' })
  },
})
