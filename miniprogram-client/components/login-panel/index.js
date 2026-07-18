const { wechatApi } = require('../../utils/api')

Component({
  methods: {
    onGetPhoneNumber(e) {
      if (e.detail.errMsg !== 'getPhoneNumber:ok') return

      wx.showLoading({ title: '登录中...' })
      wechatApi.customerLogin(e.detail.code)
        .then(res => {
          const app = getApp()
          app.saveLogin(res.token, res.customer)
          wx.hideLoading()
          wx.showToast({ title: '登录成功', icon: 'success' })
          // 通知宿主页面登录成功(宿主自行决定刷新状态或回跳)
          this.triggerEvent('loginsuccess', { customer: res.customer })
        })
        .catch(err => {
          wx.hideLoading()
          wx.showToast({ title: err.message || '登录失败', icon: 'none' })
        })
    },
  },
})
