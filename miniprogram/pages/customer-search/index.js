const { customerApi, customerTagApi, memberIdentityApi } = require('../../utils/api')

function decorateCustomers(items) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return items.map(item => {
    const customer = Object.assign({}, item)
    if (customer.last_visit_date) {
      const visitDate = new Date(customer.last_visit_date)
      visitDate.setHours(0, 0, 0, 0)
      customer.daysAgo = Math.floor((today - visitDate) / (1000 * 60 * 60 * 24))
    } else {
      customer.daysAgo = -1
    }
    customer.daysPillText = customer.daysAgo < 0 ? '未到店' : `${customer.daysAgo} 天`
    customer.isStale = customer.daysAgo > 30
    if (customer.card_remaining === 'unlimited') {
      customer.cardRemainingText = '不限次'
    } else if (typeof customer.card_remaining === 'number') {
      customer.cardRemainingText = `次卡余 ${customer.card_remaining} 次`
    } else {
      customer.cardRemainingText = ''
    }
    return customer
  })
}

Page({
  data: {
    hasPagePermission: true,
    keyword: '',
    customers: [],
    loading: false,
    loadingMore: false,
    hasSearched: false,
    page: 1,
    pageSize: 50,
    total: 0,
    hasMore: false,
    showFilterPanel: false,
    filterCount: 0,
    filterOptionsLoading: false,
    memberTypes: [],
    memberTypeList: [],
    selectedMemberTypes: [],
    customerTags: [],
    customerTagList: [],
    selectedTagIds: [],
    referrerNames: [],
    referrerList: [],
    selectedReferrers: [],
    rangeMin: 0,
    rangeMax: 60,
    daysFilterMin: 0,
    daysFilterMax: 60,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('healing-records')) {
      this.setData({ hasPagePermission: false })
      return
    }
    this.loadFilterOptions()
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh && this.data.hasSearched) {
      this._needRefresh = false
      this.loadData(true)
    }
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
  },

  async onPullDownRefresh() {
    if (!getApp().checkLogin()) return
    await this.loadFilterOptions()
    if (this.data.hasSearched) await this.loadData(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.loadData(false)
    }
  },

  async loadFilterOptions() {
    if (this.data.filterOptionsLoading) return
    this.setData({ filterOptionsLoading: true })
    try {
      const [identities, tags, customerResult] = await Promise.all([
        memberIdentityApi.list().catch(() => []),
        customerTagApi.list().catch(() => []),
        customerApi.list({ page: 1, page_size: 100 }).catch(() => ({ items: [] })),
      ])
      const sourceCustomers = (customerResult && customerResult.items) || (Array.isArray(customerResult) ? customerResult : [])
      const referrerCount = {}
      sourceCustomers.forEach(customer => {
        const name = (customer.referrer || '').trim()
        if (name) referrerCount[name] = (referrerCount[name] || 0) + 1
      })
      const memberTypes = identities.map(item => item.name).filter(Boolean)
      const customerTags = tags || []
      const referrerNames = Object.keys(referrerCount).sort((a, b) => referrerCount[b] - referrerCount[a])
      this.setData({ memberTypes, customerTags, referrerNames })
      this.updateOptionLists()
    } finally {
      this.setData({ filterOptionsLoading: false })
    }
  },

  updateOptionLists() {
    const selectedMemberTypes = new Set(this.data.selectedMemberTypes)
    const selectedTagIds = new Set(this.data.selectedTagIds)
    const selectedReferrers = new Set(this.data.selectedReferrers)
    this.setData({
      memberTypeList: this.data.memberTypes.map(name => ({ name, selected: selectedMemberTypes.has(name) })),
      customerTagList: this.data.customerTags.map(tag => Object.assign({}, tag, { selected: selectedTagIds.has(tag.id) })),
      referrerList: this.data.referrerNames.map(name => ({ name, selected: selectedReferrers.has(name) })),
    })
  },

  hasActiveFilters() {
    return this.data.selectedMemberTypes.length > 0 ||
      this.data.selectedReferrers.length > 0 ||
      this.data.selectedTagIds.length > 0 ||
      this.data.daysFilterMin > 0 ||
      this.data.daysFilterMax < 60
  },

  updateFilterCount() {
    let count = 0
    if (this.data.selectedMemberTypes.length > 0) count++
    if (this.data.selectedReferrers.length > 0) count++
    if (this.data.selectedTagIds.length > 0) count++
    if (this.data.daysFilterMin > 0 || this.data.daysFilterMax < 60) count++
    this.setData({ filterCount: count })
  },

  async loadData(reset) {
    const keyword = this.data.keyword.trim()
    if (!keyword && !this.hasActiveFilters()) {
      this._searchRequestVersion = (this._searchRequestVersion || 0) + 1
      this.setData({ customers: [], total: 0, hasMore: false, hasSearched: false, loading: false, loadingMore: false })
      return
    }
    if (!reset && (this.data.loading || this.data.loadingMore)) return

    const page = reset ? 1 : this.data.page + 1
    const requestVersion = reset
      ? (this._searchRequestVersion = (this._searchRequestVersion || 0) + 1)
      : this._searchRequestVersion
    this.setData(reset ? { loading: true, hasSearched: true } : { loadingMore: true })
    try {
      const result = await customerApi.list({
        page,
        page_size: this.data.pageSize,
        nickname: keyword || undefined,
        member_types: this.data.selectedMemberTypes.length ? this.data.selectedMemberTypes.join(',') : undefined,
        referrers: this.data.selectedReferrers.length ? this.data.selectedReferrers.join(',') : undefined,
        tag_ids: this.data.selectedTagIds.length ? this.data.selectedTagIds.join(',') : undefined,
        tag_match: this.data.selectedTagIds.length ? 'any' : undefined,
        last_visit_days_min: this.data.daysFilterMin > 0 ? this.data.daysFilterMin : undefined,
        last_visit_days_max: this.data.daysFilterMax < 60 ? this.data.daysFilterMax : undefined,
      })
      if (requestVersion !== this._searchRequestVersion) return
      const items = decorateCustomers((result && result.items) || (Array.isArray(result) ? result : []))
      const customers = reset ? items : this.data.customers.concat(items)
      const total = (result && result.total) == null ? customers.length : result.total
      this.setData({
        customers,
        page,
        total,
        hasMore: customers.length < total,
        loading: false,
        loadingMore: false,
      })
    } catch (error) {
      if (requestVersion !== this._searchRequestVersion) return
      this.setData({ loading: false, loadingMore: false, hasSearched: true })
      wx.showToast({ title: (error && error.message) || '搜索失败', icon: 'none' })
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (!e.detail.value.trim() && !this.hasActiveFilters()) {
      this._searchRequestVersion = (this._searchRequestVersion || 0) + 1
      this.setData({ customers: [], total: 0, hasMore: false, hasSearched: false, loading: false, loadingMore: false })
      return
    }
    this._searchTimer = setTimeout(() => this.loadData(true), 300)
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.loadData(true)
  },

  onClearKeyword() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({ keyword: '' })
    if (this.hasActiveFilters()) this.loadData(true)
    else {
      this._searchRequestVersion = (this._searchRequestVersion || 0) + 1
      this.setData({ customers: [], total: 0, hasMore: false, hasSearched: false, loading: false, loadingMore: false })
    }
  },

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
    const snapshot = this._filterSnapshot
    if (snapshot) {
      this.setData(Object.assign({ showFilterPanel: false }, snapshot))
      this.updateOptionLists()
    } else {
      this.setData({ showFilterPanel: false })
    }
    this._filterSnapshot = null
  },

  onToggleMemberType(e) {
    this.toggleArrayValue('selectedMemberTypes', e.currentTarget.dataset.type)
  },

  onToggleCustomerTag(e) {
    this.toggleArrayValue('selectedTagIds', e.currentTarget.dataset.id)
  },

  onToggleReferrer(e) {
    this.toggleArrayValue('selectedReferrers', e.currentTarget.dataset.name)
  },

  toggleArrayValue(field, value) {
    const values = this.data[field].slice()
    const index = values.indexOf(value)
    if (index >= 0) values.splice(index, 1)
    else values.push(value)
    this.setData({ [field]: values })
    this.updateOptionLists()
  },

  onRangeTouchStart(e) {
    this._rangeType = e.currentTarget.dataset.type
  },

  onRangeTouchMove(e) {
    const touch = e.touches[0]
    wx.createSelectorQuery().select('.range-track').boundingClientRect(rect => {
      if (!rect) return
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
      let value = Math.round(ratio * 60)
      if (this._rangeType === 'min') value = Math.min(value, this.data.rangeMax)
      else value = Math.max(value, this.data.rangeMin)
      this.setData({ [this._rangeType === 'min' ? 'rangeMin' : 'rangeMax']: value })
    }).exec()
  },

  onRangeTouchEnd() {
    this._rangeType = null
  },

  onResetFilter() {
    this.setData({
      selectedMemberTypes: [],
      selectedReferrers: [],
      selectedTagIds: [],
      rangeMin: 0,
      rangeMax: 60,
    })
    this.updateOptionLists()
  },

  onConfirmFilter() {
    this._filterSnapshot = null
    this.setData({
      daysFilterMin: this.data.rangeMin,
      daysFilterMax: this.data.rangeMax,
      showFilterPanel: false,
    }, () => {
      this.updateFilterCount()
      this.loadData(true)
    })
  },

  onCustomerTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${id}` })
  },
})
