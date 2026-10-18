const { authApi, organizationApi, saveLoginState } = require('../../utils/api')
const { DEV } = require('../../utils/config')

const DEV_ACCOUNTS = [
  { username: 'admin', label: '管理员' },
  { username: 'tingting', label: '婷婷' },
]

Page({
  data: {
    loading: false,
    error: '',
    loginMode: 'phone', // 'phone' | 'password' | 'dev'
    username: '',
    password: '',
    showPassword: false,
    focusedField: '',
    saveAccount: false,
    savePassword: false,
    devAccounts: DEV_ACCOUNTS,
    devIndex: 0,
    isDev: DEV, // 「开发模式」入口由 DEV 总开关控制，提审前切 false 自动隐藏
    checkingLogin: false, // 冷启动时先看本地登录态是否还能用，能用就直接进主页
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
        loginMode: 'password',
      })
    }
    this._trySkipLogin()
  },

  // 本地已有登录态就探测一次：能用直接进主页；过期但微信已绑定会自动无感续登；
  // 都不行才留在登录页（账号密码已回填，点一下即可）
  _trySkipLogin() {
    const token = wx.getStorageSync('auth_token')
    const user = wx.getStorageSync('currentUser')
    if (!token || !user) return
    this.setData({ checkingLogin: true })
    // 用一个轻量且所有角色都能访问的接口探活，避免"页面进来了、第一个请求才发现登录失效"
    const memberOnly = user.role === 'customer'
    Promise.resolve(memberOnly ? authApi.memberData('home') : organizationApi.list())
      .then(async result => {
        if (memberOnly && result.can_manage) saveLoginState(await authApi.switchToManagement())
        getApp().enterDefaultView()
      })
      .catch(() => { this.setData({ checkingLogin: false }) })
  },

  // ---------- 模式切换 ----------

  onToggleDev() {
    // 双保险：非开发环境禁止进入 dev 登录（入口已隐藏，此处兜底）
    if (!this.data.isDev) return
    this.setData({
      loginMode: this.data.loginMode === 'dev' ? 'phone' : 'dev',
      error: '',
    })
  },

  onToggleLoginMode() {
    if (this.data.loading) return
    this.setData({ loginMode: this.data.loginMode === 'password' ? 'phone' : 'password', error: '' })
  },

  async onGetPhoneNumber(event) {
    if (this.data.loading) return
    if (!event.detail.code || event.detail.errMsg !== 'getPhoneNumber:ok') {
      this.setData({ error: '请授权手机号后登录' })
      return
    }
    this.setData({ loading: true, error: '' })
    try {
      const loginCode = await new Promise((resolve, reject) => wx.login({
        success: result => result.code ? resolve(result.code) : reject(new Error('微信登录失败，请重试')),
        fail: () => reject(new Error('微信登录失败，请重试')),
      }))
      const result = await authApi.entryLogin(event.detail.code, loginCode)
      this._saveLogin(result)
      getApp().enterDefaultView()
    } catch (error) {
      this.setData({ error: error.message || '登录失败，请重试' })
    } finally {
      this.setData({ loading: false })
    }
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

  onTogglePasswordVisibility() {
    this.setData({ showPassword: !this.data.showPassword })
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
      getApp().enterDefaultView()
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
      getApp().enterDefaultView()
    }).catch((err) => {
      this.setData({ error: err.message || '登录失败' })
    }).finally(() => {
      this.setData({ loading: false })
    })
  },

  // ---------- 通用 ----------

  _saveLogin(data) {
    if (!saveLoginState(data)) throw new Error('登录信息不完整，请重试')

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

  },
})
