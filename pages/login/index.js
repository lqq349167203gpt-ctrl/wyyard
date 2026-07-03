const { authApi } = require('../../utils/api')

const DEV_ACCOUNTS = [
  { username: 'admin', label: '管理员' },
  { username: 'tingting', label: '婷婷' },
]

Page({
  data: {
    loading: false,
    error: '',
    loginMode: 'wechat', // 'wechat' | 'password' | 'dev'
    username: '',
    password: '',
    devAccounts: DEV_ACCOUNTS,
    devIndex: 0,
  },

  // ---------- 模式切换 ----------

  switchToPassword() {
    this.setData({ loginMode: 'password', error: '' })
  },

  switchToWechat() {
    this.setData({ loginMode: 'wechat', error: '' })
  },

  onToggleDev() {
    this.setData({
      loginMode: this.data.loginMode === 'dev' ? 'wechat' : 'dev',
      error: '',
    })
  },

  // ---------- 输入 ----------

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  // ---------- 微信手机号登录 ----------

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

  // ---------- 账号密码登录 ----------

  onPasswordLogin() {
    const { username, password } = this.data
    if (!username || !password) {
      this.setData({ error: '请输入用户名和密码' })
      return
    }

    this.setData({ loading: true, error: '' })

    authApi.passwordLogin(username, password).then((data) => {
      this._saveLogin(data)
      wx.switchTab({ url: '/pages/customers/index' })
    }).catch((err) => {
      this.setData({ error: err.message || '用户名或密码错误' })
    }).finally(() => {
      this.setData({ loading: false })
    })
  },

  // ---------- 开发模式 ----------

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

  // ---------- 通用 ----------

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
