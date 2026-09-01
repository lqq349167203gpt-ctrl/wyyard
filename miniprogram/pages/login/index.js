const { authApi } = require('../../utils/api')
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
    focusedField: '',
    saveAccount: false,
    savePassword: false,
    devAccounts: DEV_ACCOUNTS,
    devIndex: 0,
    isDev: DEV, // 「开发模式」入口由 DEV 总开关控制，提审前切 false 自动隐藏
  },

  onLoad() {
    // 恢复仅保存在当前微信设备中的账号密码
    const savedAccount = wx.getStorageSync('login_save_account')
    const savedPassword = savedAccount ? wx.getStorageSync('login_save_password') : ''
    if (savedAccount) {
      this.setData({
        username: savedAccount,
        password: savedPassword || '',
        saveAccount: true,
        savePassword: !!savedPassword,
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
    this.setData({
      saveAccount: newVal,
      savePassword: newVal ? this.data.savePassword : false,
    })
    if (!newVal) {
      wx.removeStorageSync('login_save_account')
      wx.removeStorageSync('login_save_password')
    }
  },

  onToggleSavePassword() {
    const newVal = !this.data.savePassword
    this.setData({
      savePassword: newVal,
      saveAccount: newVal ? true : this.data.saveAccount,
    })
    if (!newVal) {
      wx.removeStorageSync('login_save_password')
    }
  },

  // ---------- 输入 ----------

  onFieldFocus(e) {
    this.setData({ focusedField: e.currentTarget.dataset.field || '' })
  },

  onFieldBlur(e) {
    if (this.data.focusedField === e.currentTarget.dataset.field) {
      this.setData({ focusedField: '' })
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  // ---------- 账号密码登录 ----------

  onPasswordLogin() {
    if (this.data.loading) return
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
      this._silentBindWechat()
      wx.switchTab({ url: '/pages/customers/index' })
    }).catch((err) => {
      this.setData({ error: err.message || '用户名或密码错误' })
    }).finally(() => {
      this.setData({ loading: false })
    })
  },

  _silentBindWechat() {
    // 静默绑定当前微信 openid：token 过期后可用 openid 无感续登，失败不影响登录
    wx.login({
      success: (res) => {
        if (!res.code) return
        authApi.bindWechat(res.code).catch(() => {})
      },
      fail: () => {},
    })
  },

  // ---------- 开发模式 ----------

  onDevAccountChange(e) {
    this.setData({ devIndex: e.detail.value })
  },

  onDevLogin() {
    if (this.data.loading) return
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
    wx.setStorageSync('userEditPermissions', data.edit_permissions || { customers: 'all', visits: 'own', activities: 'own', activity_participants: 'all', payments: 'all' })

    // 开发模式登录不改动用户保存的账号密码
    if (this.data.loginMode === 'password') {
      if (this.data.saveAccount) {
        wx.setStorageSync('login_save_account', this.data.username)
      } else {
        wx.removeStorageSync('login_save_account')
      }
      if (this.data.savePassword) {
        wx.setStorageSync('login_save_password', this.data.password)
      } else {
        wx.removeStorageSync('login_save_password')
      }
    }

    const app = getApp()
    if (app) {
      app.globalData.token = data.token
      app.globalData.currentUser = data.account
      app.globalData.permissions = data.permissions || []
      app.globalData.editPermissions = data.edit_permissions || { customers: 'all', visits: 'own', activities: 'own', activity_participants: 'all', payments: 'all' }
      if (app.scheduleUsageTracking) app.scheduleUsageTracking()
      else if (app.startUsageTracking) app.startUsageTracking()
    }
  },
})
