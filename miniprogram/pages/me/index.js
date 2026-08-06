Page({
  data: {
    user: null,
    role: '',
    canPayment: false,
    canCommRecords: false,
  },

  onShow() {
    const app = getApp()
    if (!app.checkLogin()) return
    const user = app.globalData.currentUser
    this.setData({
      user,
      role: user?.role || '',
      canPayment: app.checkPagePermission('payment'),
      canCommRecords: app.checkPagePermission('communication-records'),
    })
  },

  onPaymentTap() {
    wx.navigateTo({ url: '/pages/payment/index' })
  },

  onCommRecordsTap() {
    wx.navigateTo({ url: '/pages/communication-records/index' })
  },

  onDailyReportTap() {
    wx.navigateTo({ url: '/pages/daily-report/index' })
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
