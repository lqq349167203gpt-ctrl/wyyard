const { paymentApi, organizationApi, PAYMENT_PROJECT_TYPES, downloadFile } = require('../../utils/api')
const { canEditRecord } = require('../../utils/record-ownership')
const { beginRead, disposeReads } = require('../../utils/read-scope')

const TABS = [
  PAYMENT_PROJECT_TYPES[0],
  { key: 'coarse_door_card', label: '粗门次卡', special: true },
  ...PAYMENT_PROJECT_TYPES.slice(1),
]

const now = new Date()
const TODAY = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-')
const CURRENT_MONTH = TODAY.slice(0, 7)
const CURRENT_YEAR = TODAY.slice(0, 4)

const EXPORT_RANGE_OPTIONS = [
  { value: 'day', label: '按天' },
  { value: 'month', label: '按月' },
  { value: 'year', label: '按年' },
  { value: 'custom', label: '自定义' },
]

function getMonthEnd(month) {
  const parts = month.split('-')
  const year = Number(parts[0])
  const monthNumber = Number(parts[1])
  if (!year || !monthNumber) return ''
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return month + '-' + String(lastDay).padStart(2, '0')
}

function formatDate(d) {
  if (!d) return ''
  return d.slice(0, 10)
}

function calcOfflineExpiry(item) {
  if (!item.effective_date || !item.validity_value) return ''
  var eff = new Date(item.effective_date.slice(0, 10))
  eff.setMonth(eff.getMonth() + item.validity_value)
  eff.setDate(eff.getDate() - 1)
  var y = eff.getFullYear()
  var m = String(eff.getMonth() + 1).padStart(2, '0')
  var d = String(eff.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function calcStatus(item, type, expiry) {
  var today = new Date()
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  var eff = item.effective_date ? item.effective_date.slice(0, 10) : ''
  var exp = expiry || (item.expiry_date ? item.expiry_date.slice(0, 10) : '')
  if (eff && eff > todayStr) return { text: '未开始', color: '#646a73', bg: '#f2f3f5' }
  if (exp && exp < todayStr) return { text: '已过期', color: '#c4506a', bg: '#faeef1' }
  if (eff || exp) return { text: '生效中', color: '#3370ff', bg: '#eef3ff' }
  if (type === 'tea_seat_fee' || type === 'oh_card_reading') return { text: '已完结', color: '#8f959e', bg: '#f2f3f5' }
  return { text: '', color: '', bg: '' }
}

function formatDuration(halfHours) {
  if (!halfHours) return ''
  const totalHours = halfHours * 0.5
  return totalHours + '小时'
}

function buildDetail(item, type) {
  if (type === 'membership_card') {
    return item.card_type || ''
  }
  if (type === 'internal_course') {
    return item.course_type || ''
  }
  if (type === 'other') {
    return item.project_name || item.category || ''
  }
  if (type === 'oh_card_reading') {
    return formatDuration(item.diagnosis_duration)
  }
  if (type === 'tea_seat_fee') {
    const qty = item.quantity || 1
    return `${qty}位`
  }
  if (type === 'offline_course') {
    return `${item.validity_value || 1} 个月`
  }
  // group_case, emotional_release, energy_knot
  const count = item.purchase_count
  return count != null ? `${count}次` : ''
}

function buildPrice(item, type) {
  if (type === 'membership_card' || type === 'internal_course') return item.price
  if (type === 'other') return item.fee
  if (type === 'tea_seat_fee' || type === 'offline_course') return item.amount
  return item.amount
}

function formatPrice(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value == null ? '0' : String(value)
  const text = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.?0+$/, '')
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function buildMetaPrimary(item, type, detail) {
  if (type === 'membership_card' || type === 'internal_course' || type === 'other') return detail
  if (type === 'oh_card_reading') {
    const parts = []
    if (item.diagnosis_teacher) parts.push('诊断：' + item.diagnosis_teacher)
    if (item.diagnosis_duration) parts.push('时长：' + formatDuration(item.diagnosis_duration))
    return parts.join(' · ')
  }
  if (type === 'tea_seat_fee') return '数量：' + (item.quantity || 1) + '位'
  if (type === 'offline_course') return '有效期：' + (item.validity_value || 1) + '个月'
  return ''
}

function getSubtypeConfig(type) {
  const configs = {
    membership_card: { field: 'card_type', label: '会员卡类型' },
    internal_course: { field: 'course_type', label: '课程类型' },
    other: { field: 'project_name', label: '项目名称' },
  }
  return configs[type] || null
}

function decorateItems(raw, type, organizations) {
  const isHealing = ['group_case', 'emotional_release', 'energy_knot'].includes(type)
  const isOhCard = type === 'oh_card_reading'
  const isTeaSeat = type === 'tea_seat_fee'
  const isOffline = type === 'offline_course'
  const isCountProject = isHealing || type === 'membership_card' || type === 'other'

  return raw.map(function(item) {
    var expiry = isOffline ? calcOfflineExpiry(item) : (item.expiry_date ? item.expiry_date.slice(0, 10) : '')
    var status = calcStatus(item, type, expiry)
    var detail = buildDetail(item, type)
    var price = buildPrice(item, type)
    var purchaseCount = ''
    if (isHealing) {
      purchaseCount = item.purchase_count != null ? item.purchase_count : ''
    } else if (type === 'membership_card' || type === 'other') {
      purchaseCount = item.total_count === null ? '不限' : (item.total_count != null ? item.total_count : '')
    }
    return Object.assign({}, item, {
      _detail: detail,
      _organizationName: (organizations.find(org => org.id === item.organization_id) || {}).name || '',
      _price: price,
      _priceText: formatPrice(price),
      _metaPrimary: buildMetaPrimary(item, type, detail),
      _creator: item.created_by || '',
      _closerNames: (item.closers || []).map(closer => closer.name).filter(Boolean).join('、') || item.closer_name || '',
      _agreementStatus: type === 'membership_card' && item.card_type && !['次卡', '体验会员', '粗门次卡'].includes(item.card_type)
        ? (item.agreement_status === 'signed' ? '已签' : '未签') : '',
      _effective: (isOhCard || isTeaSeat) ? '' : formatDate(item.effective_date),
      _expiry: (isOhCard || isTeaSeat) ? '' : expiry,
      _diagnosisTeacher: isOhCard ? (item.diagnosis_teacher || '') : '',
      _purchaseCount: isCountProject ? purchaseCount : '',
      _remaining: (isOhCard || isTeaSeat || isOffline || type === 'internal_course') ? '' : (isHealing
        ? (item.effective_remaining != null ? item.effective_remaining : '')
        : (item.remaining_count === null ? '不限' : (item.remaining_count != null ? item.remaining_count : ''))),
      _status: status.text,
      _statusColor: status.color,
      _statusBg: status.bg,
      _validity: isOffline ? '有效期：' + (item.validity_value || 1) + '个月' : '',
      _quantity: isTeaSeat ? '数量：' + (item.quantity || 1) + '位' : '',
      _duration: isOhCard ? '时长：' + formatDuration(item.diagnosis_duration) : '',
    })
  })
}

Page({
  data: {
    hasPagePermission: true,
    tabs: TABS,
    activeTab: 0,
    tabScrollIntoView: 'payment-tab-membership_card',
    items: [],
    loading: false,
    searchMode: false,
    hasSearched: true,
    total: 0,
    page: 1,
    hasMore: false,
    loadingMore: false,
    keyword: '',
    showFilterPanel: false,
    filterCount: 0,
    creatorList: [],
    selectedCreators: [],
    subtypeLabel: '',
    subtypeField: '',
    subtypeList: [],
    selectedSubtypes: [],
    exporting: false,
    exportDialogVisible: false,
    exportRangeOptions: EXPORT_RANGE_OPTIONS,
    exportRangeType: 'month',
    exportDate: TODAY,
    exportMonth: CURRENT_MONTH,
    exportYear: CURRENT_YEAR,
    exportDateFrom: CURRENT_MONTH + '-01',
    exportDateTo: TODAY,
    exportRangeSummary: CURRENT_MONTH + '-01 至 ' + getMonthEnd(CURRENT_MONTH),
    isCoarseDoorTab: false,
    coarseRecords: [],
    coarseDeletingId: '',
    coarseEntryVisible: false,
    coarseEditData: null,
    coarseEntryPickerOpen: false,
  },

  onLoad(options = {}) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('payment')) {
      this.setData({ hasPagePermission: false })
      return
    }
    const requestedType = options.type || ''
    const requestedIndex = TABS.findIndex(tab => tab.key === requestedType)
    const activeTab = requestedIndex >= 0 ? requestedIndex : 0
    const searchMode = options.search === '1'
    const subtypeConfig = getSubtypeConfig(TABS[activeTab].key)
    this.setData({
      activeTab,
      tabScrollIntoView: `payment-tab-${TABS[activeTab].key}`,
      searchMode,
      hasSearched: !searchMode,
      subtypeLabel: subtypeConfig ? subtypeConfig.label : '',
      subtypeField: subtypeConfig ? subtypeConfig.field : '',
      isCoarseDoorTab: TABS[activeTab].key === 'coarse_door_card',
    }, () => this.loadItems())
    if (searchMode) wx.setNavigationBarTitle({ title: '搜索付费项目' })
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadItems()
    }
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) this.loadItems(false)
  },

  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.activeTab) return
    const subtypeConfig = getSubtypeConfig(TABS[index].key)
    this._filterSnapshot = null
    this.setData({
      activeTab: index,
      tabScrollIntoView: `payment-tab-${TABS[index].key}`,
      items: [],
      hasSearched: !this.data.searchMode,
      total: 0,
      hasMore: false,
      showFilterPanel: false,
      selectedSubtypes: [],
      subtypeLabel: subtypeConfig ? subtypeConfig.label : '',
      subtypeField: subtypeConfig ? subtypeConfig.field : '',
      subtypeList: [],
      isCoarseDoorTab: TABS[index].key === 'coarse_door_card',
      coarseEntryVisible: false,
      coarseEntryPickerOpen: false,
    }, () => {
      this.updateFilterCount()
      this.loadItems()
    })
  },

  async loadItems(reset = true) {
    if (!reset && (this.data.loading || this.data.loadingMore)) return
    const page = reset ? 1 : this.data.page + 1
    const requestVersion = (this._loadRequestVersion || 0) + 1
    this._loadRequestVersion = requestVersion
    this.setData({ loading: reset, loadingMore: !reset, loadError: '' })

    try {
      const type = TABS[this.data.activeTab].key
      if (type === 'coarse_door_card') {
        await this.loadCoarseDoorData(reset)
        if (requestVersion === this._loadRequestVersion) this.setData({ loading: false, loadingMore: false })
        return
      }
      const api = paymentApi.getByType(type)
      const hasConditions = Boolean(this.data.keyword.trim() || this.data.selectedCreators.length || this.data.selectedSubtypes.length)
      const metadataOnly = this.data.searchMode && !hasConditions
      const [res, organizations] = await Promise.all([
        api.listPaginated(page, metadataOnly ? 1 : 20, {
          keyword: this.data.keyword.trim(),
          creator_names: JSON.stringify(this.data.selectedCreators),
          subtypes: JSON.stringify(this.data.selectedSubtypes),
          include_filter_options: true,
        }),
        organizationApi.list(),
      ])
      if (requestVersion !== this._loadRequestVersion) return
      const raw = res.items || res.data || res || []
      const sourceItems = decorateItems(Array.isArray(raw) ? raw : [], type, Array.isArray(organizations) ? organizations : (organizations.items || []))
      this._filterOptions = res
      const items = metadataOnly ? [] : (reset ? sourceItems : Array.from(new Map(this.data.items.concat(sourceItems).map(item => [item.id, item])).values()))
      this._failedLoadReset = undefined
      this.setData({ items, total: metadataOnly ? 0 : res.total, page: res.page || page, hasMore: !metadataOnly && items.length < res.total, hasSearched: !metadataOnly, loading: false, loadingMore: false })
      this.updateFilterOptions()
    } catch (e) {
      if (requestVersion !== this._loadRequestVersion) return
      console.error('加载付费项目失败:', e)
      this._failedLoadReset = reset
      this.setData({ loading: false, loadingMore: false, loadError: e.message || '付费记录加载失败，请重试' })
    }
  },

  async loadCoarseDoorData(reset = true) {
    const isCurrent = beginRead(this, 'coarseRecords', () => TABS[this.data.activeTab].key === 'coarse_door_card')
    const page = reset ? 1 : this.data.page + 1
    const records = await paymentApi.deductions.list({ project_type: 'membership-cards', card_type: '粗门次卡', page, page_size: 20 })
    if (!isCurrent()) return
    const items = (records.items || []).map(record => Object.assign({}, record, { _canDelete: !record.cancelled && canEditRecord(record, 'payments') }))
    const coarseRecords = reset ? items : Array.from(new Map(this.data.coarseRecords.concat(items).map(item => [item.id, item])).values())
    this.setData({
      coarseRecords, page: records.page || page, total: records.total || 0,
      hasMore: coarseRecords.length < (records.total || 0),
    })
  },

  onUnload() {
    disposeReads(this)
    clearTimeout(this._searchTimer)
    this._loadRequestVersion = (this._loadRequestVersion || 0) + 1
  },

  retryLoad() { return this.loadItems(this._failedLoadReset !== false) },

  onCoarseEntryOpen() {
    this.setData({ coarseEntryVisible: true, coarseEntryPickerOpen: false, coarseEditData: null })
  },

  onCoarseEditTap(e) {
    const record = this.data.coarseRecords.find(item => item.id === e.currentTarget.dataset.id)
    if (!record || !record._canDelete) return
    this.setData({ coarseEditData: record, coarseEntryVisible: true, coarseEntryPickerOpen: false })
  },

  onCoarseEntryClose() {
    if (this.data.coarseEntryPickerOpen) return
    this.setData({ coarseEntryVisible: false, coarseEntryPickerOpen: false })
  },

  onCoarseEntryPickerState(e) {
    this.setData({ coarseEntryPickerOpen: Boolean(e.detail && e.detail.open) })
  },

  onCoarseEntrySuccess() {
    this.setData({ coarseEntryVisible: false, coarseEntryPickerOpen: false })
    this.loadCoarseDoorData()
  },

  onCoarseDeleteTap(e) {
    const deductionId = e.currentTarget.dataset.id
    const record = this.data.coarseRecords.find(item => item.id === deductionId)
    if (!record || !canEditRecord(record, 'payments') || this.data.coarseDeletingId) return
    const courseName = record.source_activity_name || '所选课程'
    wx.showModal({
      title: '确认删除抵扣记录？',
      content: `删除后，${record.nickname}的“${courseName}”将重新按原规则扣除会员卡${record.count}次；没有可用会员卡时会恢复为欠卡。`,
      confirmText: '删除',
      confirmColor: '#c4506a',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ coarseDeletingId: deductionId })
        try {
          await paymentApi.deductions.delete(deductionId)
          await this.loadCoarseDoorData()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '删除失败', icon: 'none' })
        } finally {
          this.setData({ coarseDeletingId: '' })
        }
      },
    })
  },

  updateFilterOptions() {
    const metadata = this._filterOptions || {}
    const subtypeConfig = getSubtypeConfig(TABS[this.data.activeTab].key)
    const creatorOptions = metadata.creator_options || []
    const validCreators = new Set(creatorOptions.map(item => item.name))
    const selectedCreators = this.data.selectedCreators.filter(name => validCreators.has(name))
    const creatorList = creatorOptions.map(item => ({ ...item, selected: selectedCreators.includes(item.name) }))

    let selectedSubtypes = []
    let subtypeList = []
    if (subtypeConfig) {
      const subtypeOptions = metadata.subtype_options || []
      const validSubtypes = new Set(subtypeOptions.map(item => item.name))
      selectedSubtypes = this.data.selectedSubtypes.filter(name => validSubtypes.has(name))
      subtypeList = subtypeOptions.map(item => ({ ...item, selected: selectedSubtypes.includes(item.name) }))
    }

    this.setData({
      creatorList,
      selectedCreators,
      subtypeLabel: subtypeConfig ? subtypeConfig.label : '',
      subtypeField: subtypeConfig ? subtypeConfig.field : '',
      subtypeList,
      selectedSubtypes,
    }, () => {
      this.updateFilterCount()
    })
  },

  refreshOptionSelections() {
    const selectedCreators = new Set(this.data.selectedCreators)
    const selectedSubtypes = new Set(this.data.selectedSubtypes)
    this.setData({
      creatorList: this.data.creatorList.map(item => Object.assign({}, item, { selected: selectedCreators.has(item.name) })),
      subtypeList: this.data.subtypeList.map(item => Object.assign({}, item, { selected: selectedSubtypes.has(item.name) })),
    })
  },

  updateFilterCount() {
    let count = 0
    if (this.data.selectedCreators.length) count++
    if (this.data.selectedSubtypes.length) count++
    this.setData({ filterCount: count })
  },

  applyFilters() { return this.loadItems(true) },

  onSearchInput(e) {
    this._loadRequestVersion = (this._loadRequestVersion || 0) + 1
    this.setData({ keyword: e.detail.value })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.applyFilters(), 300)
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.applyFilters()
  },

  onClearKeyword() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({ keyword: '' }, () => this.applyFilters())
  },

  onSearchTap() {
    const tab = TABS[this.data.activeTab]
    if (!tab || tab.key === 'coarse_door_card') return
    wx.navigateTo({ url: `/pages/payment/index?search=1&type=${encodeURIComponent(tab.key)}` })
  },

  onToggleFilterPanel() {
    if (this.data.showFilterPanel) {
      this.onCloseFilterPanel()
      return
    }
    this._filterSnapshot = {
      selectedCreators: this.data.selectedCreators.slice(),
      selectedSubtypes: this.data.selectedSubtypes.slice(),
    }
    this.setData({ showFilterPanel: true })
  },

  onCloseFilterPanel() {
    if (this._filterSnapshot) {
      this.setData({
        selectedCreators: this._filterSnapshot.selectedCreators,
        selectedSubtypes: this._filterSnapshot.selectedSubtypes,
        showFilterPanel: false,
      }, () => this.refreshOptionSelections())
    } else {
      this.setData({ showFilterPanel: false })
    }
    this._filterSnapshot = null
  },

  onToggleCreator(e) {
    const name = e.currentTarget.dataset.name
    const selectedCreators = this.data.selectedCreators.slice()
    const index = selectedCreators.indexOf(name)
    if (index >= 0) selectedCreators.splice(index, 1)
    else selectedCreators.push(name)
    this.setData({ selectedCreators }, () => this.refreshOptionSelections())
  },

  onToggleSubtype(e) {
    const name = e.currentTarget.dataset.name
    const selectedSubtypes = this.data.selectedSubtypes.slice()
    const index = selectedSubtypes.indexOf(name)
    if (index >= 0) selectedSubtypes.splice(index, 1)
    else selectedSubtypes.push(name)
    this.setData({ selectedSubtypes }, () => this.refreshOptionSelections())
  },

  onResetFilter() {
    this.setData({ selectedCreators: [], selectedSubtypes: [] }, () => this.refreshOptionSelections())
  },

  onConfirmFilter() {
    this._filterSnapshot = null
    this.setData({ showFilterPanel: false }, () => {
      this.updateFilterCount()
      this.applyFilters()
    })
  },

  onAddTap() {
    const tab = TABS[this.data.activeTab]
    if (!tab || tab.key === 'coarse_door_card') {
      wx.showToast({ title: '未找到项目类型', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/payment-create/index?type=${tab.key}`,
      fail: (err) => {
        wx.showToast({ title: err.errMsg || '跳转失败', icon: 'none' })
      },
    })
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item
    const type = TABS[this.data.activeTab].key
    wx.navigateTo({ url: `/pages/payment-detail/index?type=${type}&id=${item.id}` })
  },

  onExportTap() {
    this.updateExportSummary()
    this.setData({ exportDialogVisible: true })
  },

  onExportDialogClose() {
    if (this.data.exporting) return
    this.setData({ exportDialogVisible: false })
  },

  stopPropagation() {},

  onExportRangeChange(e) {
    this.setData({ exportRangeType: e.currentTarget.dataset.type }, () => this.updateExportSummary())
  },

  onExportDateChange(e) {
    this.setData({ exportDate: e.detail.value }, () => this.updateExportSummary())
  },

  onExportMonthChange(e) {
    this.setData({ exportMonth: e.detail.value }, () => this.updateExportSummary())
  },

  onExportYearChange(e) {
    this.setData({ exportYear: e.detail.value }, () => this.updateExportSummary())
  },

  onExportDateFromChange(e) {
    this.setData({ exportDateFrom: e.detail.value }, () => this.updateExportSummary())
  },

  onExportDateToChange(e) {
    this.setData({ exportDateTo: e.detail.value }, () => this.updateExportSummary())
  },

  updateExportSummary() {
    const data = this.data
    let summary = data.exportDate
    if (data.exportRangeType === 'month') {
      summary = data.exportMonth + '-01 至 ' + getMonthEnd(data.exportMonth)
    } else if (data.exportRangeType === 'year') {
      summary = data.exportYear + '-01-01 至 ' + data.exportYear + '-12-31'
    } else if (data.exportRangeType === 'custom') {
      summary = data.exportDateFrom + ' 至 ' + data.exportDateTo
    }
    this.setData({ exportRangeSummary: summary })
  },

  getExportParams() {
    const data = this.data
    if (data.exportRangeType === 'custom') {
      return {
        range_type: 'custom',
        date_from: data.exportDateFrom,
        date_to: data.exportDateTo,
      }
    }
    const periodMap = {
      day: data.exportDate,
      month: data.exportMonth,
      year: data.exportYear,
    }
    return {
      range_type: data.exportRangeType,
      period: periodMap[data.exportRangeType],
    }
  },

  getExportFilename() {
    const data = this.data
    if (data.exportRangeType === 'day') return '付费项目_' + data.exportDate + '.xlsx'
    if (data.exportRangeType === 'month') return '付费项目_' + data.exportMonth + '.xlsx'
    if (data.exportRangeType === 'year') return '付费项目_' + data.exportYear + '年.xlsx'
    return '付费项目_' + data.exportDateFrom + '至' + data.exportDateTo + '.xlsx'
  },

  async onExportConfirm() {
    if (this.data.exporting) return
    if (this.data.exportRangeType === 'custom' && this.data.exportDateFrom > this.data.exportDateTo) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在导出...' })
    const params = this.getExportParams()
    const filename = this.getExportFilename()
    try {
      const filePath = await downloadFile(paymentApi.export(params), filename)
      if (this._readsDisposed) return
      this.setData({ exportDialogVisible: false })
      wx.openDocument({ filePath, fileType: 'xlsx', showMenu: true, fail: () => wx.showToast({ title: '无法打开文件', icon: 'none' }) })
    } catch (error) {
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      if (!this._readsDisposed) this.setData({ exporting: false })
    }
  },

})
