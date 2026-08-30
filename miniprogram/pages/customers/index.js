const { customerApi, customerTagApi, memberIdentityApi } = require('../../utils/api')
const { isAreaViewOnly } = require('../../utils/record-ownership')

Page({
  data: {
    hasPagePermission: true,
    customers: [],
    groupedCustomers: [],
    loading: false,
    loadingMore: false,
    initialized: false,
    keyword: '',
    // 筛选相关
    showFilterPanel: false,
    filterCount: 0,
    // 身份
    memberTypes: [],
    memberTypeList: [],
    selectedMemberTypes: [],
    // 客户标签
    customerTags: [],
    customerTagList: [],
    selectedTagIds: [],
    tagLoading: false,
    // 引流人
    referrerList: [],
    selectedReferrers: [],
    activeCustomerNicknames: [],
    activeCustomerNamesLoaded: false,
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
    isViewOnly: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('healing-records')) {
      this.setData({ hasPagePermission: false })
      return
    }
    this.setData({ isViewOnly: isAreaViewOnly('customers') })
    this.loadMemberTypes()
    this.loadCustomerTags()
    this.loadActiveCustomerNames()
    this.loadData(true)
  },

  async loadActiveCustomerNames() {
    try {
      const customers = await customerApi.light()
      this.setData({
        activeCustomerNicknames: (customers || []).map(customer => customer.nickname).filter(Boolean),
        activeCustomerNamesLoaded: true,
      })
      this.updateReferrerList()
    } catch (e) {
      console.error('加载有效客户昵称失败:', e)
    }
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

  async loadCustomerTags() {
    if (this.data.tagLoading) return
    this.setData({ tagLoading: true })
    try {
      const tags = await customerTagApi.list()
      const customerTags = tags || []
      const visibleIds = new Set(customerTags.map(tag => tag.id))
      const selectedTagIds = this.data.selectedTagIds.filter(id => visibleIds.has(id))
      this.setData({ customerTags, selectedTagIds })
      this.updateCustomerTagList()
      this.checkActiveFilter()
    } catch (e) {
      this.setData({ customerTags: [], customerTagList: [] })
    } finally {
      this.setData({ tagLoading: false })
    }
  },

  updateCustomerTagList() {
    const selected = new Set(this.data.selectedTagIds)
    this.setData({
      customerTagList: this.data.customerTags.map(tag => Object.assign({}, tag, {
        selected: selected.has(tag.id),
      })),
    })
  },

  // 更新引流人列表（从已加载客户中提取，按人数从多到少排列）
  updateReferrerList() {
    const { customers, selectedReferrers, activeCustomerNicknames, activeCustomerNamesLoaded } = this.data
    const activeNames = new Set(activeCustomerNicknames)
    const countMap = {}
    for (const c of customers) {
      const name = (c.referrer || '').trim()
      if (name && (!activeCustomerNamesLoaded || activeNames.has(name))) {
        countMap[name] = (countMap[name] || 0) + 1
      }
    }
    const referrers = Object.keys(countMap).sort((a, b) => countMap[b] - countMap[a])
    const list = referrers.map(r => ({
      name: r,
      selected: selectedReferrers.includes(r),
    }))
    this.setData({ referrerList: list })
  },

  // 计算激活的筛选条件数量
  checkActiveFilter() {
    const { selectedMemberTypes, selectedReferrers, selectedTagIds, daysFilterMin, daysFilterMax } = this.data
    let count = 0
    if (selectedMemberTypes.length > 0) count++
    if (selectedReferrers.length > 0) count++
    if (selectedTagIds.length > 0) count++
    if (daysFilterMin > 0 || daysFilterMax < 60) count++
    this.setData({ filterCount: count })
  },

  async onShow() {
    if (!getApp().checkLogin()) return
    if (this.data.initialized) await this.loadCustomerTags()
    // 仅在有数据变更标记时重载列表，避免从详情页返回时无谓刷新导致闪屏
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadData(true)
    }
  },

  async onPullDownRefresh() {
    await this.loadCustomerTags()
    await this.loadData(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (!this._restoringScroll && this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.loadData(false)
    }
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
  },

  async loadData(reset) {
    if (this._loadingRequest || this.data.loading || this.data.loadingMore) return
    this._loadingRequest = true
    const page = reset ? 1 : this.data.page + 1
    if (reset) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const token = wx.getStorageSync('auth_token')
      console.log('[loadData] 请求前 token:', token ? token.substring(0, 20) + '...' : '无')
      const res = await customerApi.list({
        page,
        page_size: this.data.pageSize,
        nickname: this.data.keyword || undefined,
        member_types: this.data.selectedMemberTypes.length > 0 ? this.data.selectedMemberTypes.join(',') : undefined,
        referrers: this.data.selectedReferrers.length > 0 ? this.data.selectedReferrers.join(',') : undefined,
        tag_ids: this.data.selectedTagIds.length > 0 ? this.data.selectedTagIds.join(',') : undefined,
        tag_match: this.data.selectedTagIds.length > 0 ? 'any' : undefined,
        last_visit_days_min: this.data.daysFilterMin > 0 ? this.data.daysFilterMin : undefined,
        last_visit_days_max: this.data.daysFilterMax < 60 ? this.data.daysFilterMax : undefined,
      })
      console.log('[loadData] 请求成功, items数量:', res?.items?.length ?? res?.length ?? 'N/A')

      const items = (res && res.items) || (Array.isArray(res) ? res : [])
      const total = (res && res.total) || items.length
      const customers = reset ? items : (this.data.customers || []).concat(items)

      // 计算距离上次到店的天数
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      customers.forEach(c => {
        c._rowDomId = `customer-row-${String(c.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`
        if (c.last_visit_date) {
          const visitDate = new Date(c.last_visit_date)
          visitDate.setHours(0, 0, 0, 0)
          c.daysAgo = Math.floor((today - visitDate) / (1000 * 60 * 60 * 24))
        } else {
          c.daysAgo = -1
        }
        const days = c.daysAgo
        if (days < 0) {
          c.daysPillText = '未到店'
        } else {
          c.daysPillText = days + ' 天'
        }
        c.isStale = days > 30
        if (c.card_remaining === 'unlimited') {
          c.cardRemainingText = '不限次'
        } else if (typeof c.card_remaining === 'number') {
          c.cardRemainingText = '次卡余 ' + c.card_remaining + ' 次'
        } else {
          c.cardRemainingText = ''
        }
      })

      this.setData({ customers, page, total, hasMore: customers.length < total, initialized: true })
      this.updateReferrerList()
      // 下一页数据会被重新分配到各会员身份组，可能插入当前视口上方。
      // 以当前第一条可见客户作为锚点，重排后恢复其屏幕位置，避免整页跳动。
      const scrollAnchor = reset ? null : await this.captureScrollAnchor()
      this.applyFilters(scrollAnchor)
    } catch (e) {
      console.error('[loadData] 加载客户失败:', e.message, e)
      this.setData({ loading: false, loadingMore: false, initialized: true })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this._loadingRequest = false
    }
  },

  captureScrollAnchor() {
    return new Promise(resolve => {
      const query = wx.createSelectorQuery()
      query.select('.search-bar').boundingClientRect()
      query.selectAll('.c-row').boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec(results => {
        const searchRect = results && results[0]
        const rows = (results && results[1]) || []
        const viewport = (results && results[2]) || {}
        const visibleTop = searchRect && typeof searchRect.bottom === 'number'
          ? searchRect.bottom
          : 0
        const row = rows.find(item => item.bottom > visibleTop)
        if (!row || !row.id) {
          resolve(null)
          return
        }
        resolve({ id: row.id, top: row.top, scrollTop: viewport.scrollTop || 0 })
      })
    })
  },

  restoreScrollAnchor(anchor) {
    if (!anchor) {
      this._restoringScroll = false
      return
    }
    const query = wx.createSelectorQuery()
    query.selectAll('.c-row').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(results => {
      const rows = (results && results[0]) || []
      const viewport = (results && results[1]) || {}
      const row = rows.find(item => item.id === anchor.id)
      if (!row) {
        this._restoringScroll = false
        return
      }
      const delta = row.top - anchor.top
      if (Math.abs(delta) < 1) {
        this._restoringScroll = false
        return
      }
      wx.pageScrollTo({
        scrollTop: Math.max(0, (viewport.scrollTop || anchor.scrollTop) + delta),
        duration: 0,
        complete: () => { this._restoringScroll = false },
      })
    })
  },

  applyFilters(scrollAnchor) {
    const filtered = this.data.customers || []

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
      .map(t => ({ type: t, list: groupMap[t], dotClass: 'member' }))
    if (groupMap['其他'].length > 0) {
      groupedCustomers.push({ type: '其他', list: groupMap['其他'], dotClass: 'other' })
    }

    this._restoringScroll = !!scrollAnchor
    this.setData({ groupedCustomers, loading: false, loadingMore: false }, () => {
      this.restoreScrollAnchor(scrollAnchor)
    })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this.loadData(true)
    }, 300)
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.loadData(true)
  },

  // 筛选面板
  onToggleFilterPanel() {
    if (this.data.showFilterPanel) {
      this.onCloseFilterPanel()
      return
    }
    this._filterSnapshot = {
      selectedMemberTypes: this.data.selectedMemberTypes.slice(),
      selectedReferrers: this.data.selectedReferrers.slice(),
      selectedTagIds: this.data.selectedTagIds.slice(),
      rangeMin: this.data.rangeMin,
      rangeMax: this.data.rangeMax,
    }
    this.setData({ showFilterPanel: true })
  },

  onCloseFilterPanel() {
    // 关闭时恢复到快照状态
    if (this._filterSnapshot) {
      this.setData({
        showFilterPanel: false,
        selectedMemberTypes: this._filterSnapshot.selectedMemberTypes,
        selectedReferrers: this._filterSnapshot.selectedReferrers,
        selectedTagIds: this._filterSnapshot.selectedTagIds,
        rangeMin: this._filterSnapshot.rangeMin,
        rangeMax: this._filterSnapshot.rangeMax,
      })
      this.updateMemberTypeList()
      this.updateReferrerList()
      this.updateCustomerTagList()
    } else {
      this.setData({ showFilterPanel: false })
    }
    this._filterSnapshot = null
  },

  // 引流人选择
  onToggleReferrer(e) {
    const name = e.currentTarget.dataset.name
    let { selectedReferrers } = this.data
    const index = selectedReferrers.indexOf(name)
    if (index > -1) {
      selectedReferrers.splice(index, 1)
    } else {
      selectedReferrers.push(name)
    }
    this.setData({ selectedReferrers })
    this.updateReferrerList()
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

  // 客户标签选择（多选时匹配任一标签）
  onToggleCustomerTag(e) {
    const id = e.currentTarget.dataset.id
    const selectedTagIds = this.data.selectedTagIds.slice()
    const index = selectedTagIds.indexOf(id)
    if (index > -1) {
      selectedTagIds.splice(index, 1)
    } else {
      selectedTagIds.push(id)
    }
    this.setData({ selectedTagIds })
    this.updateCustomerTagList()
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

  // 重置筛选（清空所有条件，但保持面板打开，等用户点确定后再生效）
  onResetFilter() {
    this.setData({
      selectedMemberTypes: [],
      selectedReferrers: [],
      selectedTagIds: [],
      rangeMin: 0,
      rangeMax: 60,
    })
    this.updateMemberTypeList()
    this.updateReferrerList()
    this.updateCustomerTagList()
  },

  // 确认筛选
  onConfirmFilter() {
    const { rangeMin, rangeMax } = this.data
    this._filterSnapshot = null
    this.setData({
      daysFilterMin: rangeMin,
      daysFilterMax: rangeMax,
      showFilterPanel: false,
    }, () => {
      this.checkActiveFilter()
      this.loadData(true)
    })
  },

  onCustomerTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      wx.showToast({ title: '客户信息异常，请刷新后重试', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${id}` })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/customer-search/index' })
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
    wx.navigateTo({ url: '/pages/voice-chat/index?mode=customer' })
  },
})
