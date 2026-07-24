const { wechatApi } = require('../../utils/api')

Page({
  data: {
    loggingIn: false,
    redirect: '',
    agreed: false,
  },

  onLoad(options) {
    this.setData({ redirect: options.redirect ? decodeURIComponent(options.redirect) : '' })
    const app = getApp()
    if (app.isLoggedIn()) {
      this._goBack()
    }
  },

  // 点击登录按钮（先检查勾选）
  onLoginTap() {
    if (this.data.loggingIn) return
    if (!this.data.agreed) {
      wx.showModal({
        title: '服务协议与隐私政策',
        content: '登录即表示同意《无忧茶苑服务协议》与《隐私协议》',
        confirmText: '同意',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({ agreed: true })
          }
        },
      })
      return
    }
  },

  // 微信手机号授权回调
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') return
    if (this.data.loggingIn) return
    this._doLogin(e.detail.code)
  },

  _doLogin(code) {
    this.setData({ loggingIn: true })
    wechatApi.customerLogin(code)
      .then(res => {
        const app = getApp()
        app.saveLogin(res.token, res.customer)
        this.setData({ loggingIn: false })
        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => this._goBack(), 600)
      })
      .catch(() => {
        this.setData({ loggingIn: false })
      })
  },

  onSkip() {
    this._goBack()
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  onOpenService() {
    wx.navigateTo({ url: '/pages/agreement/service/index' })
  },

  onOpenPrivacy() {
    wx.navigateTo({ url: '/pages/agreement/privacy/index' })
  },

  _goBack() {
    if (this.data.redirect && getApp().isLoggedIn()) {
      wx.redirectTo({ url: this.data.redirect })
      return
    }
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/home/index' })
      },
    })
  },
})
