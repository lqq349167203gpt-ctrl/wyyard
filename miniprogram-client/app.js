App({
  globalData: {
    token: '',
    customer: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('client_token')
    if (token) {
      this.globalData.token = token
    }
  },

  // 检查登录状态
  isLoggedIn() {
    return !!this.globalData.token
  },

  // 保存登录信息
  saveLogin(token, customer) {
    this.globalData.token = token
    this.globalData.customer = customer
    wx.setStorageSync('client_token', token)
  },

  // 退出登录
  logout() {
    this.globalData.token = ''
    this.globalData.customer = null
    wx.removeStorageSync('client_token')
  },
})
