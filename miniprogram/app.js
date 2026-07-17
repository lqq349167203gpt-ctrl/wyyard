console.log('[app.js] 文件已加载')

// devMode 环境守卫：仅当小程序环境版本为 develop（开发者工具/开发版）时派生为 true，
// 体验版（trial）/正式版（release）自动关闭，避免调试逻辑随提审包发布
let DEV_MODE = false
try {
  DEV_MODE = wx.getAccountInfoSync().miniProgram.envVersion === 'develop'
} catch (e) {
  // 基础库 < 2.2.2 无 wx.getAccountInfoSync，兜底保持关闭
  console.warn('[app.js] 无法获取小程序环境版本，devMode 保持关闭:', e)
}

App({
  globalData: {
    token: '',
    currentUser: null,
    permissions: [],
    // 开发模式开关：由上方环境版本派生，仅开发版生效，体验版/正式版自动关闭
    devMode: DEV_MODE,
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
