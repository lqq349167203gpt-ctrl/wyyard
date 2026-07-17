console.log('[app.js] 文件已加载')

// 开发模式总开关：由 utils/config.js 的 DEV 决定。
// 提审前 DEV 切为 false 后，dev 自动登录等全部调试逻辑随之关闭。
const { DEV } = require('./utils/config')

App({
  globalData: {
    token: '',
    currentUser: null,
    permissions: [],
    // 开发模式开关：手动维护，提审前必须为 false（check-release.sh 强制拦截）
    devMode: DEV,
    _selectedActivity: null,
    _loginReady: null, // Promise，登录完成后 resolve
  },

  onLaunch() {
    if (this.globalData.devMode) {
      // 开发模式下始终重新登录，获取有效 JWT（仅开发版生效，体验版/正式版不会进入此分支）
      this.globalData._loginReady = this._devAutoLogin()
    } else {
      const token = wx.getStorageSync('auth_token')
      const user = wx.getStorageSync('currentUser')
      if (token && user) {
        this.globalData.token = token
        this.globalData.currentUser = user
        this.globalData.permissions = wx.getStorageSync('userPermissions') || []
      }
      this.globalData._loginReady = Promise.resolve()
    }
  },

  async _devAutoLogin() {
    try {
      this.globalData._loggingIn = true
      // 清除旧 token，避免 AuthMiddleware 拒绝 dev-login 请求
      wx.removeStorageSync('auth_token')
      wx.removeStorageSync('currentUser')
      wx.removeStorageSync('userPermissions')
      this.globalData.token = ''
      this.globalData.currentUser = null
      const { authApi } = require('./utils/api')
      console.log('[dev-login] 开始自动登录...')
      // 硬编码账号 'tingting' 仅为开发便利：devMode 仅开发版生效，体验版/正式版自动关闭，不会执行到本函数
      const data = await authApi.devLogin('tingting')
      console.log('[dev-login] 登录成功, token长度:', data.token?.length)
      this.globalData.token = data.token
      this.globalData.currentUser = data.account
      this.globalData.permissions = data.permissions || []
      wx.setStorageSync('auth_token', data.token)
      wx.setStorageSync('currentUser', data.account)
      wx.setStorageSync('userPermissions', data.permissions)
      console.log('[dev-login] token 已存入 storage')
    } catch (err) {
      console.error('[dev-login] 登录失败:', err)
      this.globalData._loginReady = null
    } finally {
      this.globalData._loggingIn = false
    }
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

  logout() {
    wx.removeStorageSync('auth_token')
    wx.removeStorageSync('currentUser')
    wx.removeStorageSync('userPermissions')
    this.globalData.token = ''
    this.globalData.currentUser = null
    this.globalData.permissions = []
    wx.reLaunch({ url: '/pages/login/index' })
  },
})
