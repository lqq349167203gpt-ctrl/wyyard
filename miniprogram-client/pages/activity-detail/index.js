const { clientApi } = require('../../utils/api')

Page({
  data: {
    loading: true,
    activity: null,
    signingUp: false,
    signedUp: false,
    activityId: '',
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ activityId: options.id })
      this.loadActivity(options.id)
    }
  },

  loadActivity(id) {
    this.setData({ loading: true })
    clientApi.getActivity(id)
      .then(res => {
        this.setData({ activity: res, loading: false })
        this.checkLogin()
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '活动不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
      })
  },

  checkLogin() {
    const app = getApp()
    if (app.isLoggedIn()) return

    wx.showModal({
      title: '提示',
      content: '请先登录后再查看活动详情',
      confirmText: '去登录',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/me/index' })
        } else {
          wx.navigateBack()
        }
      },
    })
  },

  onSignup() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再报名',
        confirmText: '去登录',
        success(res) {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/me/index' })
          }
        },
      })
      return
    }

    if (this.data.signingUp || this.data.signedUp) return

    this.setData({ signingUp: true })
    clientApi.signup(this.data.activity.id)
      .then(() => {
        this.setData({ signedUp: true, signingUp: false })
        wx.showToast({ title: '报名成功', icon: 'success' })
        this.loadActivity(this.data.activity.id)
      })
      .catch(err => {
        this.setData({ signingUp: false })
        if (err.message === '已报名该活动') {
          this.setData({ signedUp: true })
        }
      })
  },
})
