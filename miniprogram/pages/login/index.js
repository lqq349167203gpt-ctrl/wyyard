const { authApi } = require('../../utils/api')

const DEV_ACCOUNTS = [
  { username: 'tingting', label: '婷婷 (管理员)' },
  { username: 'juanjuan', label: '娟娟 (管理员)' },
  { username: 'baiyang', label: '白羊 (承接部)' },
  { username: 'weiwei', label: '薇薇 (课程部)' },
  { username: 'panpan', label: '潘潘 (承接部)' },
]

Page({
  data: {
    loading: false,
    error: '',
    devMode: false,
    devAccounts: DEV_ACCOUNTS,
    devIndex: 0,
  },

  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      this.setData({ error: '授权失败: ' + e.detail.errMsg })
      return
    }

    this.setData({ loading: true, error: '' })
    const code = e.detail.code

    authApi.phoneLogin(code).then((data) => {
      this._saveLogin(data)
      wx.switchTab({ url: '/pages/customers/index' })
    }).catch((err) => {
      this.setData({ error: err.message || '登录失败' })
    }).finally(() => {
      this.setData({ loading: false })
    })
  },

  onToggleDev() {
    this.setData({ devMode: !this.data.devMode, error: '' })
  },

  onDevAccountChange(e) {
    this.setData({ devIndex: e.detail.value })
  },

  onDevLogin() {
    const account = DEV_ACCOUNTS[this.data.devIndex]
    this.setData({ loading: true, error: '' })

    authApi.devLogin(account.username).then((data) => {
      this._saveLogin(data)
      wx.switchTab({ url: '/pages/customers/index' })
    }).catch((err) => {
      this.setData({ error: err.message || '登录失败' })
    }).finally(() => {
      this.setData({ loading: false })
    })
  },

  _saveLogin(data) {
    wx.setStorageSync('auth_token', data.token)
    wx.setStorageSync('currentUser', data.account)
    wx.setStorageSync('userPermissions', data.permissions)

    const app = getApp()
    if (app) {
      app.globalData.token = data.token
      app.globalData.currentUser = data.account
      app.globalData.permissions = data.permissions || []
    }
  },
})
