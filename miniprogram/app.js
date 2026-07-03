console.log('[app.js] 文件已加载')

App({
  globalData: {
    token: '',
    currentUser: null,
    permissions: [],
    devMode: false,
    _selectedActivity: null,
    _loginReady: null, // Promise，登录完成后 resolve
  },

  onLaunch() {
    if (this.globalData.devMode) {
      // devMode 始终重新登录，获取有效 JWT
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
