const { customerApi, customerTagApi, memberIdentityApi } = require('../../utils/api')
const { isAreaViewOnly } = require('../../utils/record-ownership')
const { customerReferrers } = require('../../utils/customer-referrers')

Page({
  data: {
    hasPagePermission: true,
    workspaces: [], workspace: '', handoffStatus: 'pending', scopeReady: false,
    workspaceError: '', listError: '', acceptingId: '',
    isAdmin: false, workspaceOwner: '', ownerOptions: ['所有人'], ownerIndex: 0, ownerLoading: false, ownerError: '',
    showWorkspaceSettings: false, settingsSaving: false, settingsError: '',
    settingsOptions: [], defaultOptions: [], draftDefault: '', defaultIndex: 0,
    handoffTabs: [{ key: 'pending', label: '待承接' }, { key: 'accepted', label: '已承接' }, { key: 'history', label: '历史客户' }],
    customers: [],
    groupedCustomers: [],
    loading: false,
    loadingMore: false,
    initialized: false,
    keyword: '',
    // 筛选相关
    showFilterPanel: false,
    filterTop: 0,
    filterCount: 0,
    // 身份
    memberTypes: [],
    cardStatusList: [],
    memberTypeList: [],
    selectedMemberTypes: [],
      selectedCardStatuses: [],
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
    pageSize: 20,
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
    return this.loadWorkspaces()
  },

  async loadWorkspaces() {
    const sequence = this._workspaceSequence = (this._workspaceSequence || 0) + 1
    this._loadSequence = (this._loadSequence || 0) + 1
    this.setData({ scopeReady: false, workspaceError: '' })
    try {
      const settings = await customerApi.workspaceSettings()
      if (sequence !== this._workspaceSequence) return
      this.applyWorkspaceSettings(settings)
      this.loadActiveCustomerNames()
      await this.loadData(true)
    } catch (error) {
      if (sequence === this._workspaceSequence) this.setData({ workspaceError: error.message || '客户视图加载失败，请重试' })
    }
  },

  applyWorkspaceSettings(settings, useDefault = false) {
    this._workspaceSettings = settings
    const workspaces = settings.options.filter(item => settings.visible_workspaces.includes(item.key))
    const workspace = !useDefault && workspaces.some(item => item.key === this.data.workspace)
      ? this.data.workspace : settings.default_workspace
    this.setData({ workspaces, workspace, isAdmin: settings.is_admin, scopeReady: true })
  },

  onOwnerChange(event) {
    if (!this.data.isAdmin || this.data.ownerLoading) return
    const index = Number(event.detail.value)
    if (!this.data.ownerOptions[index]) return
    this.setData({ ownerIndex: index, workspaceOwner: index ? this.data.ownerOptions[index] : '',
      customers: [], groupedCustomers: [] })
    this.loadData(true)
  },

  onOpenWorkspaceSettings() {
    if (!this.data.isAdmin || !this._workspaceSettings) return
    const settings = this._workspaceSettings
    this.setData({ showWorkspaceSettings: true, settingsError: '',
      settingsOptions: settings.options.map(item => ({ ...item, selected: settings.visible_workspaces.includes(item.key) })),
      draftDefault: settings.default_workspace })
    this.updateDefaultOptions()
  },

  updateDefaultOptions() {
    const defaultOptions = this.data.settingsOptions.filter(item => item.selected)
    const draftDefault = defaultOptions.some(item => item.key === this.data.draftDefault) ? this.data.draftDefault : 'all'
    this.setData({ defaultOptions, draftDefault, defaultIndex: Math.max(0, defaultOptions.findIndex(item => item.key === draftDefault)) })
  },

  onToggleWorkspaceSetting(event) {
    const key = event.currentTarget.dataset.key
    if (key === 'all' || this.data.settingsSaving) return
    this.setData({ settingsOptions: this.data.settingsOptions.map(item => item.key === key ? { ...item, selected: !item.selected } : item) })
    this.updateDefaultOptions()
  },

  onDefaultWorkspaceChange(event) {
    if (this.data.settingsSaving) return
    const item = this.data.defaultOptions[Number(event.detail.value)]
    if (item) this.setData({ draftDefault: item.key, defaultIndex: Number(event.detail.value) })
  },

  onCloseWorkspaceSettings() {
    if (!this.data.settingsSaving) this.setData({ showWorkspaceSettings: false })
  },

  stopSettingsTap() {},

  async onSaveWorkspaceSettings() {
    if (!this.data.isAdmin || this.data.settingsSaving) return
    this.setData({ settingsSaving: true, settingsError: '' })
    try {
      const settings = await customerApi.saveWorkspaceSettings({
        visible_workspaces: this.data.settingsOptions.filter(item => item.selected).map(item => item.key),
        default_workspace: this.data.draftDefault,
      })
      this.applyWorkspaceSettings(settings, true)
      this.setData({ showWorkspaceSettings: false, workspaceOwner: '', ownerIndex: 0, handoffStatus: 'pending',
        customers: [], groupedCustomers: [], keyword: '', daysFilterMin: 0, daysFilterMax: 60, filterCount: 0 })
      this.onResetFilter()
      this.loadActiveCustomerNames()
      await this.loadData(true)
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (error) {
      this.setData({ settingsError: error.message || '保存失败，请重试' })
    } finally { this.setData({ settingsSaving: false }) }
  },

  scopeParams() {
    return this.data.workspace ? { workspace: this.data.workspace, handoff_status: this.data.handoffStatus,
      ...(this.data.isAdmin && this.data.workspaceOwner && this.data.workspace !== 'all' ? { workspace_owner: this.data.workspaceOwner } : {}) } : {}
  },

  onWorkspaceTap(event) {
    const key = event.currentTarget.dataset.key
    if (!this.data.workspaces.some(item => item.key === key) || key === this.data.workspace) return
    this.setData({ workspace: key, workspaceOwner: '', ownerIndex: 0, ownerOptions: ['所有人'], handoffStatus: 'pending', customers: [], groupedCustomers: [], keyword: '' })
    this.onResetFilter()
    this.setData({ daysFilterMin: 0, daysFilterMax: 60, filterCount: 0 })
    this.loadActiveCustomerNames()
    this.loadData(true)
  },

  onHandoffStatusTap(event) {
    const key = event.currentTarget.dataset.key
    if (!this.data.handoffTabs.some(item => item.key === key) || key === this.data.handoffStatus) return
    this.setData({ handoffStatus: key, customers: [], groupedCustomers: [] })
    this.loadActiveCustomerNames()
    this.loadData(true)
  },

  async onAcceptHandoff(event) {
    if (this.data.acceptingId || this.data.isViewOnly) return
    const { id, assignment } = event.currentTarget.dataset
    this.setData({ acceptingId: id })
    try {
      await customerApi.acceptHandoff(id, assignment)
      wx.showToast({ title: '已承接', icon: 'success' })
      await this.loadData(true)
    } catch (error) { wx.showToast({ title: error.message || '确认失败，请重试', icon: 'none' }) }
    finally { this.setData({ acceptingId: '' }) }
  },

  retryList() { return this.loadData(true) },

  onExportTap() {
    if (!this.data.scopeReady) return
    const filters = { member_types: this.data.selectedMemberTypes, card_statuses: this.data.selectedCardStatuses,
      referrers: this.data.selectedReferrers, ...this.scopeParams() }
    wx.navigateTo({ url: '/pages/customer-export/index?filters=' + encodeURIComponent(JSON.stringify(filters)) })
  },

  async loadActiveCustomerNames() {
    const sequence = this._optionsSequence = (this._optionsSequence || 0) + 1
    this.setData({ ownerLoading: true, ownerError: '' })
    try {
      const params = this.data.isAdmin ? { workspace: this.data.workspace, handoff_status: 'all' } : this.scopeParams()
      const customers = await customerApi.selector(params)
      if (sequence !== this._optionsSequence) return
      this._filterCustomers = customers || []
      this.setData({
        activeCustomerNicknames: (customers || []).map(customer => customer.nickname).filter(Boolean),
        activeCustomerNamesLoaded: true,
      })
      if (this.data.isAdmin) {
        const names = (customers || []).flatMap(customer => this.data.workspace === 'referral' ? customerReferrers(customer) : [this.data.workspace === 'handoff' ? customer.referrer_handler : customer.service_teacher])
        const ownerOptions = ['所有人', ...Array.from(new Set([...names, this.data.workspaceOwner].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
        this.setData({ ownerOptions, ownerIndex: Math.max(0, ownerOptions.indexOf(this.data.workspaceOwner)) })
      }
      this.updateReferrerList()
    } catch (e) {
      if (sequence === this._optionsSequence) this.setData({ ownerError: '负责人选项加载失败，点击重试' })
      console.error('加载有效客户昵称失败:', e)
    } finally {
      if (sequence === this._optionsSequence) this.setData({ ownerLoading: false })
    }
  },

  async loadMemberTypes() {
    try {
      const identities = await memberIdentityApi.list('all')
      const types = identities.filter(i => i.group !== 'card_status').map(i => i.name)
      this.setData({ cardStatusList: identities.filter(i => i.group === 'card_status').map(i => ({ name: i.name, selected: this.data.selectedCardStatuses.includes(i.name) })) })
      this.setData({
        memberTypes: types,
        memberTypeList: types.map(t => ({ name: t, selected: false })),
      })
    } catch (e) {
      console.error('加载会员类型失败:', e)
      this.setData({ memberTypes: [],
    cardStatusList: [], memberTypeList: [] })
    }
  },

  // 更新身份列表的选中状态
  updateMemberTypeList() {
    const { memberTypes, selectedMemberTypes } = this.data
    const list = memberTypes.map(t => ({
      name: t,
      selected: selectedMemberTypes.includes(t),
    }))
    this.setData({ memberTypeList: list, cardStatusList: this.data.cardStatusList.map(item => ({ ...item, selected: this.data.selectedCardStatuses.includes(item.name) })) })
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

  // 选项来自完整可见的轻量目录，不能随着列表分页而遗漏。
  updateReferrerList() {
    const { customers, selectedReferrers, activeCustomerNicknames, activeCustomerNamesLoaded } = this.data
    const activeNames = new Set(activeCustomerNicknames)
    const countMap = {}
    for (const c of this._filterCustomers || customers) {
      for (const name of customerReferrers(c)) {
        if (this.data.workspace || !activeCustomerNamesLoaded || activeNames.has(name)) countMap[name] = (countMap[name] || 0) + 1
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
    if (this.data.selectedCardStatuses.length > 0) count++
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
    await this.loadWorkspaces()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (!this._restoringScroll && this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.loadData(false)
    }
  },

  onUnload() {
    this._workspaceSequence = (this._workspaceSequence || 0) + 1
    this._optionsSequence = (this._optionsSequence || 0) + 1
    this._loadSequence = (this._loadSequence || 0) + 1
    if (this._searchTimer) clearTimeout(this._searchTimer)
  },

  async loadData(reset) {
    if (!this.data.scopeReady) return
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return
    const sequence = this._loadSequence = (this._loadSequence || 0) + 1
    const page = reset ? 1 : this.data.page + 1
    if (reset) {
      this.setData({ loading: true, loadingMore: false, listError: '' })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const res = await customerApi.list({
        ...this.scopeParams(),
        page,
        page_size: this.data.pageSize,
        nickname: this.data.keyword || undefined,
        card_statuses: this.data.selectedCardStatuses.length ? this.data.selectedCardStatuses.join(',') : undefined,
        member_types: this.data.selectedMemberTypes.length > 0 ? this.data.selectedMemberTypes.join(',') : undefined,
        referrers: this.data.selectedReferrers.length > 0 ? this.data.selectedReferrers.join(',') : undefined,
        tag_ids: this.data.selectedTagIds.length > 0 ? this.data.selectedTagIds.join(',') : undefined,
        tag_match: this.data.selectedTagIds.length > 0 ? 'any' : undefined,
        last_visit_days_min: this.data.daysFilterMin > 0 ? this.data.daysFilterMin : undefined,
        last_visit_days_max: this.data.daysFilterMax < 60 ? this.data.daysFilterMax : undefined,
      })
      if (sequence !== this._loadSequence) return

      const items = (res && res.items) || (Array.isArray(res) ? res : [])
      const total = res?.total ?? items.length
      const customers = reset ? items : (this.data.customers || []).concat(items)

      // 计算距离上次到店的天数
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      customers.forEach(c => {
        const handoff = c.handoff
        c.handoffLabel = handoff ? (handoff.accepted_at ? '已承接' : '待承接') : (c.referrer_handler ? '历史客户' : '未分配')
        const assigned = handoff && new Date(handoff.assigned_at)
        c.handoffTime = assigned ? [assigned.getFullYear(), String(assigned.getMonth() + 1).padStart(2, '0'), String(assigned.getDate()).padStart(2, '0')].join('-') : ''
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
      if (sequence !== this._loadSequence) return
      this.applyFilters(scrollAnchor)
    } catch (e) {
      if (sequence !== this._loadSequence) return
      console.error('[loadData] 加载客户失败:', e.message, e)
      this.setData({ loading: false, loadingMore: false, initialized: true, listError: e.message || '加载失败，请重试' })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (sequence === this._loadSequence) this.setData({ loading: false, loadingMore: false })
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
    if (this.data.workspace) {
      const label = this.data.workspace === 'handoff' ? this.data.handoffTabs.find(item => item.key === this.data.handoffStatus).label : this.data.workspaces.find(item => item.key === this.data.workspace).label
      this.setData({ groupedCustomers: filtered.length ? [{ type: label, list: filtered, dotClass: 'member' }] : [], loading: false, loadingMore: false })
      return
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
      selectedCardStatuses: this.data.selectedCardStatuses.slice(),
      selectedReferrers: this.data.selectedReferrers.slice(),
      selectedTagIds: this.data.selectedTagIds.slice(),
      rangeMin: this.data.rangeMin,
      rangeMax: this.data.rangeMax,
    }
    this.setData({ showFilterPanel: true })
    wx.createSelectorQuery().select('.search-bar').boundingClientRect(rect => {
      if (rect && this.data.showFilterPanel) this.setData({ filterTop: rect.bottom })
    }).exec()
  },

  onCloseFilterPanel() {
    // 关闭时恢复到快照状态
    if (this._filterSnapshot) {
      this.setData({
        showFilterPanel: false,
        selectedMemberTypes: this._filterSnapshot.selectedMemberTypes,
        selectedCardStatuses: this._filterSnapshot.selectedCardStatuses,
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
  onToggleCardStatus(e) {
    const name = e.currentTarget.dataset.name
    const selected = this.data.selectedCardStatuses.slice()
    const index = selected.indexOf(name)
    if (index < 0) selected.push(name)
    else selected.splice(index, 1)
    this.setData({ selectedCardStatuses: selected, cardStatusList: this.data.cardStatusList.map(item => ({ ...item, selected: selected.includes(item.name) })) })
  },

  onResetFilter() {
    this.setData({
      cardStatusList: this.data.cardStatusList.map(item => ({ ...item, selected: false })),
      selectedMemberTypes: [],
      selectedCardStatuses: [],
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
    if (!this.data.scopeReady) return
    const query = Object.entries(this.scopeParams()).map(([key, value]) => key + '=' + encodeURIComponent(value)).join('&')
    wx.navigateTo({ url: '/pages/customer-search/index' + (query ? '?' + query : '') })
  },

  onEditTap(e) {
    const customer = e.currentTarget.dataset.customer
    wx.navigateTo({ url: `/pages/customer-form/index?id=${customer.id}` })
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/customer-form/index?workspace=' + encodeURIComponent(this.data.workspace) })
  },

  // ---------- 语音录入 ----------

  onFabLongPress() {
    wx.navigateTo({ url: '/pages/voice-chat/index?mode=customer' })
  },
})
