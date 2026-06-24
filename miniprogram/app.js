App({
  globalData: {
    token: '',
    currentUser: null,
    permissions: [],
    devMode: true, // 开发模式，跳过登录检查
  },

  onLaunch() {
    const token = wx.getStorageSync('auth_token')
    const user = wx.getStorageSync('currentUser')
    if (token && user) {
      this.globalData.token = token
      this.globalData.currentUser = user
      this.globalData.permissions = wx.getStorageSync('userPermissions') || []
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
