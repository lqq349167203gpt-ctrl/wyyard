const { wechatApi } = require('../../utils/api')

Page({
  data: {
    isLoggedIn: false,
    customer: null,
  },

  onShow() {
    const app = getApp()
    this.setData({
      isLoggedIn: app.isLoggedIn(),
      customer: app.globalData.customer,
    })
  },

  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') return

    wx.showLoading({ title: '登录中...' })
    wechatApi.customerLogin(e.detail.code)
      .then(res => {
        const app = getApp()
        app.saveLogin(res.token, res.customer)
        this.setData({
          isLoggedIn: true,
          customer: res.customer,
        })
        wx.hideLoading()
        wx.showToast({ title: '登录成功', icon: 'success' })
      })
      .catch(err => {
        wx.hideLoading()
        wx.showToast({ title: err.message || '登录失败', icon: 'none' })
      })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.logout()
          this.setData({ isLoggedIn: false, customer: null })
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      },
    })
  },
})
