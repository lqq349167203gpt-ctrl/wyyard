const { authApi } = require('../../utils/api')
const { APP_VERSION, BUILD_TAG } = require('../../utils/version')
const { DEV } = require('../../utils/config')

const DEV_ACCOUNTS = [
  { username: 'admin', label: '管理员' },
  { username: 'tingting', label: '婷婷' },
]

Page({
  data: {
    loading: false,
    error: '',
    loginMode: 'password', // 'password' | 'dev'
    username: '',
    password: '',
    saveAccount: false,
    devAccounts: DEV_ACCOUNTS,
    devIndex: 0,
    isDev: DEV, // 「开发模式」入口由 DEV 总开关控制，提审前切 false 自动隐藏
    versionTag: `v${APP_VERSION} (${BUILD_TAG})`, // 构建标记，用于核对审核包内容
  },

  onLoad() {
    // 恢复保存的账号
    const savedAccount = wx.getStorageSync('login_save_account')
    if (savedAccount) {
      this.setData({
        username: savedAccount,
        saveAccount: true,
      })
    }
  },

  // ---------- 模式切换 ----------

  onToggleDev() {
    // 双保险：非开发环境禁止进入 dev 登录（入口已隐藏，此处兜底）
    if (!this.data.isDev) return
    this.setData({
      loginMode: this.data.loginMode === 'dev' ? 'password' : 'dev',
      error: '',
    })
  },

  // ---------- 保存账号密码 ----------

  onToggleSaveAccount() {
    const newVal = !this.data.saveAccount
    this.setData({ saveAccount: newVal })
    if (!newVal) {
      wx.removeStorageSync('login_save_account')
    }
  },

  // ---------- 输入 ----------

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
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
      if (data && data.success === false) {
        throw new Error(data.message || '用户名或密码错误')
      }
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
    wx.setStorageSync('userEditPermissions', data.edit_permissions || { visits: 'own', activities: 'own' })

    // 保存/清除账号
    if (this.data.saveAccount) {
      wx.setStorageSync('login_save_account', this.data.username)
    } else {
      wx.removeStorageSync('login_save_account')
    }

    const app = getApp()
    if (app) {
      app.globalData.token = data.token
      app.globalData.currentUser = data.account
      app.globalData.permissions = data.permissions || []
      app.globalData.editPermissions = data.edit_permissions || { visits: 'own', activities: 'own' }
      if (app.scheduleUsageTracking) app.scheduleUsageTracking()
      else if (app.startUsageTracking) app.startUsageTracking()
    }
  },
})
