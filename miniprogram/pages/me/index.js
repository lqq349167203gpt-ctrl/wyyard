Page({
  data: {
    user: null,
    role: '',
    canPayment: false,
    canExpenses: false,
    canCommRecords: false,
    canDailyReport: false,
    canCustomerTags: false,
  },

  async onShow() {
    if (!getApp().checkLogin()) return
    const app = getApp()
    if (app.trackUsagePage) app.trackUsagePage('/pages/me/index')
    try {
      await app.refreshPermissions()
    } catch (e) {
      // 同步失败时保留上次登录缓存，避免网络波动导致入口全部消失
    }
    const user = app.globalData.currentUser
    this.setData({
      user,
      role: user?.role || '',
      canPayment: app.checkPagePermission('payment'),
      canExpenses: app.checkPagePermission('expenses'),
      canCommRecords: app.checkPagePermission('communication-records'),
      canDailyReport: app.checkPagePermission('daily-report'),
      canCustomerTags: app.checkPagePermission('customer-tags'),
    })
  },

  onPaymentTap() {
    wx.navigateTo({ url: '/pages/payment/index' })
  },

  onExpensesTap() {
    wx.navigateTo({ url: '/pages/expenses/index' })
  },

  onCommRecordsTap() {
    wx.navigateTo({ url: '/pages/communication-records/index' })
  },

  onDailyReportTap() {
    wx.navigateTo({ url: '/pages/daily-report/index' })
  },

  onCustomerTagsTap() {
    wx.navigateTo({ url: '/pages/customer-tags/index' })
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
