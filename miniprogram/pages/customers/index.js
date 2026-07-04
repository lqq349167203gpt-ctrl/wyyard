const { customerApi, memberIdentityApi, request } = require('../../utils/api')

Page({
  data: {
    customers: [],
    groupedCustomers: [],
    loading: false,
    initialized: false,
    keyword: '',
    showVoicePopup: false,
    // 筛选相关
    showFilterPanel: false,
    filterCount: 0,
    // 身份
    memberTypes: [],
    memberTypeList: [],
    selectedMemberTypes: [],
    // 到店间隔
    rangeMin: 0,
    rangeMax: 60,
    daysFilterMin: 0,
    daysFilterMax: 60,
    // 分页
    page: 1,
    pageSize: 100,
    total: 0,
    hasMore: true,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    this.loadMemberTypes()
    this.loadData(true)
  },

  async loadMemberTypes() {
    try {
      const identities = await memberIdentityApi.list()
      const types = identities.map(i => i.name)
      this.setData({
        memberTypes: types,
        memberTypeList: types.map(t => ({ name: t, selected: false })),
      })
    } catch (e) {
      console.error('加载会员类型失败:', e)
      this.setData({ memberTypes: [], memberTypeList: [] })
    }
  },

  // 更新身份列表的选中状态
  updateMemberTypeList() {
    const { memberTypes, selectedMemberTypes } = this.data
    const list = memberTypes.map(t => ({
      name: t,
      selected: selectedMemberTypes.includes(t),
    }))
    this.setData({ memberTypeList: list })
  },

  // 计算激活的筛选条件数量
  checkActiveFilter() {
    const { selectedMemberTypes, daysFilterMin, daysFilterMax } = this.data
    let count = 0
    if (selectedMemberTypes.length > 0) count++
    if (daysFilterMin > 0 || daysFilterMax < 60) count++
    this.setData({ filterCount: count })
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this.data.initialized && !this.data.loading) {
      this.loadData(true)
    }
  },

  onPullDownRefresh() {
    this.loadData(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false)
    }
  },

  async loadData(reset) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })

    try {
      const token = wx.getStorageSync('auth_token')
      console.log('[loadData] 请求前 token:', token ? token.substring(0, 20) + '...' : '无')
      const res = await customerApi.list({
        page,
        page_size: this.data.pageSize,
        nickname: this.data.keyword || undefined,
      })
      console.log('[loadData] 请求成功, items数量:', res?.items?.length ?? res?.length ?? 'N/A')

      const items = (res && res.items) || (Array.isArray(res) ? res : [])
      const total = (res && res.total) || items.length
      const customers = reset ? items : [...(this.data.customers || []), ...items]

      // 计算距离上次到店的天数
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      customers.forEach(c => {
        if (c.last_visit_date) {
          const visitDate = new Date(c.last_visit_date)
          visitDate.setHours(0, 0, 0, 0)
          c.daysAgo = Math.floor((today - visitDate) / (1000 * 60 * 60 * 24))
        } else {
          c.daysAgo = -1
        }
      })

      this.setData({ customers, page, total, hasMore: customers.length < total, initialized: true })
      this.applyFilters()
    } catch (e) {
      console.error('[loadData] 加载客户失败:', e.message, e)
      this.setData({ loading: false, initialized: true })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  applyFilters() {
    let filtered = this.data.customers || []

    // 按身份筛选（多选）
    const { selectedMemberTypes } = this.data
    if (selectedMemberTypes && selectedMemberTypes.length > 0) {
      filtered = filtered.filter(c => selectedMemberTypes.includes(c.member_type || ''))
    }

    // 按到店间隔区间筛选
    const { daysFilterMin, daysFilterMax } = this.data
    if (daysFilterMin > 0 || daysFilterMax < 60) {
      filtered = filtered.filter(c => {
        if (c.daysAgo < 0) return false
        if (c.daysAgo < daysFilterMin) return false
        if (daysFilterMax < 60 && c.daysAgo > daysFilterMax) return false
        return true
      })
    }

    // 按会员身份分组（反向排列）
    const identities = this.data.memberTypes.filter(t => t).reverse()
    const groupMap = {}
    identities.forEach(t => { groupMap[t] = [] })
    groupMap['其他'] = []
    filtered.forEach(c => {
      const type = c.member_type || ''
      if (groupMap[type]) {
        groupMap[type].push(c)
      } else {
        groupMap['其他'].push(c)
      }
    })
    const groupedCustomers = identities
      .filter(t => groupMap[t].length > 0)
      .map(t => ({ type: t, list: groupMap[t] }))
    if (groupMap['其他'].length > 0) {
      groupedCustomers.push({ type: '其他', list: groupMap['其他'] })
    }

    this.setData({ groupedCustomers, loading: false })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm() {
    this.loadData(true)
  },

  // 筛选面板
  onToggleFilterPanel() {
    const show = !this.data.showFilterPanel
    if (show) {
      // 打开时保存当前状态快照
      this._filterSnapshot = {
        selectedMemberTypes: [...this.data.selectedMemberTypes],
        rangeMin: this.data.rangeMin,
        rangeMax: this.data.rangeMax,
      }
    }
    this.setData({ showFilterPanel: show })
  },

  onCloseFilterPanel() {
    // 关闭时恢复到快照状态
    if (this._filterSnapshot) {
      this.setData({
        showFilterPanel: false,
        selectedMemberTypes: this._filterSnapshot.selectedMemberTypes,
        rangeMin: this._filterSnapshot.rangeMin,
        rangeMax: this._filterSnapshot.rangeMax,
      })
      this.updateMemberTypeList()
    } else {
      this.setData({ showFilterPanel: false })
    }
  },

  // 身份选择
  onToggleMemberType(e) {
    const type = e.currentTarget.dataset.type
    let { selectedMemberTypes } = this.data
    const index = selectedMemberTypes.indexOf(type)
    if (index > -1) {
      selectedMemberTypes.splice(index, 1)
    } else {
      selectedMemberTypes.push(type)
    }
    this.setData({ selectedMemberTypes })
    this.updateMemberTypeList()
  },

  // 到店间隔
  onRangeTouchStart(e) {
    const type = e.currentTarget.dataset.type
    this._rangeType = type
    this._trackWidth = 0
    wx.createSelectorQuery().select('.range-track').boundingClientRect(rect => {
      if (rect) this._trackWidth = rect.width
    }).exec()
  },

  onRangeTouchMove(e) {
    if (!this._trackWidth) return
    const touch = e.touches[0]
    wx.createSelectorQuery().select('.range-track').boundingClientRect(rect => {
      if (!rect) return
      let ratio = (touch.clientX - rect.left) / rect.width
      ratio = Math.max(0, Math.min(1, ratio))
      let val = Math.round(ratio * 60)
      val = Math.max(0, Math.min(60, val))

      const { rangeMin, rangeMax } = this.data
      if (this._rangeType === 'min') {
        val = Math.min(val, rangeMax)
        this.setData({ rangeMin: val })
      } else {
        val = Math.max(val, rangeMin)
        this.setData({ rangeMax: val })
      }
    }).exec()
  },

  onRangeTouchEnd() {
    this._rangeType = null
  },

  // 重置筛选
  onResetFilter() {
    this._filterSnapshot = null
    this.setData({
      selectedMemberTypes: [],
      rangeMin: 0,
      rangeMax: 60,
      daysFilterMin: 0,
      daysFilterMax: 60,
      showFilterPanel: false,
      filterCount: 0,
    })
    this.updateMemberTypeList()
    this.applyFilters()
  },

  // 确认筛选
  onConfirmFilter() {
    const { rangeMin, rangeMax } = this.data
    this._filterSnapshot = null
    this.setData({
      daysFilterMin: rangeMin,
      daysFilterMax: rangeMax,
      showFilterPanel: false,
    })
    this.checkActiveFilter()
    this.applyFilters()
  },

  onCustomerTap(e) {
    const customer = e.currentTarget.dataset.customer
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${customer.id}` })
  },

  onEditTap(e) {
    const customer = e.currentTarget.dataset.customer
    wx.navigateTo({ url: `/pages/customer-form/index?id=${customer.id}` })
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/customer-form/index' })
  },

  // ---------- 语音录入 ----------

  onFabLongPress() {
    this.setData({ showVoicePopup: true })
  },

  onVoiceClose() {
    this.setData({ showVoicePopup: false })
    this.loadData(true)
  },

  async onVoiceChat(e) {
    const { message, history } = e.detail
    try {
      const res = await request('/api/voice/customer-chat', {
        method: 'POST',
        data: { message, history: history || [] },
      })
      const popup = this.selectComponent('.voice-popup')
      if (popup) popup.setReply(res.reply || '操作完成')
    } catch (err) {
      console.error('[onVoiceChat] 错误:', err)
      const popup = this.selectComponent('.voice-popup')
      if (popup) popup.setError(err.message || '请求失败')
    }
  },
})
