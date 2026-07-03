Page({
  data: {
    user: null,
    role: '',
  },

  onShow() {
    const app = getApp()
    if (!app.checkLogin()) return
    const user = app.globalData.currentUser
    this.setData({
      user,
      role: user?.role || '',
    })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: (res) => {
        if (res.confirm) {
          getApp().logout()
        }
      },
    })
  },
})
