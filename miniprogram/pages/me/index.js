const MENU_ICONS = {
  payment: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzk4MzhmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgOGEzIDMgMCAwIDEgMyAtM2gxMmEzIDMgMCAwIDEgMyAzdjhhMyAzIDAgMCAxIC0zIDNoLTEyYTMgMyAwIDAgMSAtMyAtM2wwIC04Ii8+PHBhdGggZD0iTTMgMTBsMTggMCIvPjxwYXRoIGQ9Ik03IDE1bC4wMSAwIi8+PHBhdGggZD0iTTExIDE1bDIgMCIvPjwvc3ZnPg==',
  expenses: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzk4MzhmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTUgMjF2LTE2YTIgMiAwIDAgMSAyIC0yaDEwYTIgMiAwIDAgMSAyIDJ2MTZsLTMgLTJsLTIgMmwtMiAtMmwtMiAybC0yIC0ybC0zIDJtNCAtMTRoNm0tNiA0aDZtLTIgNGgyIi8+PC9zdmc+',
  commRecords: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzk4MzhmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgMjBsMS4zIC0zLjljLTIuMzI0IC0zLjQzNyAtMS40MjYgLTcuODcyIDIuMSAtMTAuMzc0YzMuNTI2IC0yLjUwMSA4LjU5IC0yLjI5NiAxMS44NDUgLjQ4YzMuMjU1IDIuNzc3IDMuNjk1IDcuMjY2IDEuMDI5IDEwLjUwMWMtMi42NjYgMy4yMzUgLTcuNjE1IDQuMjE1IC0xMS41NzQgMi4yOTNsLTQuNyAxIi8+PC9zdmc+',
  dailyReport: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzk4MzhmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTkgNWgtMmEyIDIgMCAwIDAgLTIgMnYxMmEyIDIgMCAwIDAgMiAyaDEwYTIgMiAwIDAgMCAyIC0ydi0xMmEyIDIgMCAwIDAgLTIgLTJoLTIiLz48cGF0aCBkPSJNOSA1YTIgMiAwIDAgMSAyIC0yaDJhMiAyIDAgMCAxIDIgMmEyIDIgMCAwIDEgLTIgMmgtMmEyIDIgMCAwIDEgLTIgLTIiLz48cGF0aCBkPSJNOSAxMmg2Ii8+PHBhdGggZD0iTTkgMTZoNiIvPjwvc3ZnPg==',
  customerTags: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzk4MzhmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgOHY0LjE3MmEyIDIgMCAwIDAgLjU4NiAxLjQxNGw1LjcxIDUuNzFhMi40MSAyLjQxIDAgMCAwIDMuNDA4IDBsMy41OTIgLTMuNTkyYTIuNDEgMi40MSAwIDAgMCAwIC0zLjQwOGwtNS43MSAtNS43MWEyIDIgMCAwIDAgLTEuNDE0IC0uNTg2aC00LjE3MmEyIDIgMCAwIDAgLTIgMiIvPjxwYXRoIGQ9Ik0xOCAxOWwxLjU5MiAtMS41OTJhNC44MiA0LjgyIDAgMCAwIDAgLTYuODE2bC00LjU5MiAtNC41OTIiLz48cGF0aCBkPSJNNyAxMGgtLjAxIi8+PC9zdmc+',
  customAnalysis: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzk4MzhmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgM3YxOGgxOCIvPjxwYXRoIGQ9Ik03IDlhMiAyIDAgMSAwIDQgMGEyIDIgMCAxIDAgLTQgMCIvPjxwYXRoIGQ9Ik0xNyA3YTIgMiAwIDEgMCA0IDBhMiAyIDAgMSAwIC00IDAiLz48cGF0aCBkPSJNMTIgMTVhMiAyIDAgMSAwIDQgMGEyIDIgMCAxIDAgLTQgMCIvPjxwYXRoIGQ9Ik0xMC4xNiAxMC42MmwyLjM0IDIuODgiLz48cGF0aCBkPSJNMTUuMDg4IDEzLjMyOGwyLjgzNyAtNC41ODYiLz48L3N2Zz4=',
}

Page({
  data: {
    icons: MENU_ICONS,
    user: null,
    role: '',
    canPayment: false,
    canExpenses: false,
    canCommRecords: false,
    canDailyReport: false,
    canCustomerTags: false,
    canCustomAnalysis: false,
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
      canCustomAnalysis: app.checkPagePermission('custom-analysis'),
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

  onCustomAnalysisTap() {
    wx.navigateTo({ url: '/pages/custom-analysis/index' })
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
