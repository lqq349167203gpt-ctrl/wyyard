const { paymentApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')

// 从共享常量派生，key 用 apiPath（连字符），与后端路由一致
const PROJECT_TYPES = PAYMENT_PROJECT_TYPES.map(t => ({ key: t.apiPath, label: t.label }))

Page({
  data: {
    // 客户搜索
    searchKeyword: '',
    searchResults: [],
    showResults: false,
    selectedCustomer: null,
    // 项目类型
    projectTypes: PROJECT_TYPES,
    projectTypeIndex: -1,
    // 可用项目
    availableItems: [],
    selectedItem: null,
    // 扣次
    deductCount: '',
    submitting: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    this._loadReqId = 0
  },

  // ---- 客户搜索 ----

  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })
    if (keyword.length < 1) {
      this.setData({ searchResults: [], showResults: false })
      return
    }
    this._searchTimer && clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      const api = paymentApi.getByType('membership_card')
      api.searchCustomers(keyword).then(res => {
        this.setData({ searchResults: res || [], showResults: true })
      }).catch(err => {
        console.error('搜索客户失败:', err)
      })
    }, 300)
  },

  onSearchFocus() {
    if (this.data.searchResults.length > 0) {
      this.setData({ showResults: true })
    }
  },

  onSelectCustomer(e) {
    const customer = e.currentTarget.dataset.customer
    this.setData({
      selectedCustomer: customer,
      searchKeyword: '',
      showResults: false,
      searchResults: [],
      availableItems: [],
      selectedItem: null,
    })
    this._loadAvailableItems()
  },

  onClearCustomer() {
    this.setData({
      selectedCustomer: null,
      availableItems: [],
      selectedItem: null,
    })
  },

  // ---- 项目类型 ----

  onProjectTypeChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      projectTypeIndex: idx,
      availableItems: [],
      selectedItem: null,
    })
    this._loadAvailableItems()
  },

  // ---- 加载可用项目 ----

  async _loadAvailableItems() {
    const { selectedCustomer, projectTypeIndex } = this.data
    if (!selectedCustomer || projectTypeIndex < 0) return

    const reqId = ++this._loadReqId
    const projectType = PROJECT_TYPES[projectTypeIndex].key
    try {
      const items = await paymentApi.deductions.availableItems(selectedCustomer.id, projectType)
      if (reqId !== this._loadReqId) return
      this.setData({ availableItems: items || [] })
    } catch (e) {
      if (reqId !== this._loadReqId) return
      console.error('加载可用项目失败:', e)
      this.setData({ availableItems: [] })
    }
  },

  // ---- 选择项目 ----

  onSelectItem(e) {
    const item = e.currentTarget.dataset.item
    this.setData({ selectedItem: item })
  },

  onClearItem() {
    this.setData({ selectedItem: null })
  },

  // ---- 扣次 ----

  onCountInput(e) {
    this.setData({ deductCount: e.detail.value })
  },

  // ---- 提交 ----

  async onSubmit() {
    if (this._submitting) return
    const { selectedCustomer, projectTypeIndex, selectedItem, deductCount } = this.data

    if (!selectedCustomer) {
      wx.showToast({ title: '请选择客户', icon: 'none' })
      return
    }
    if (projectTypeIndex < 0) {
      wx.showToast({ title: '请选择项目类型', icon: 'none' })
      return
    }
    if (!selectedItem) {
      wx.showToast({ title: '请选择项目', icon: 'none' })
      return
    }
    const count = parseInt(deductCount)
    if (!count || count <= 0) {
      wx.showToast({ title: '请输入扣次', icon: 'none' })
      return
    }
    if (parseFloat(deductCount) !== count) {
      wx.showToast({ title: '扣次必须为整数', icon: 'none' })
      return
    }
    if (selectedItem.remaining_count !== null && count > selectedItem.remaining_count) {
      wx.showToast({ title: '扣次超过剩余次数', icon: 'none' })
      return
    }

    const projectType = PROJECT_TYPES[projectTypeIndex].key
    this._submitting = true
    this.setData({ submitting: true })

    try {
      await paymentApi.deductions.create({
        customer_id: selectedCustomer.id,
        project_type: projectType,
        project_id: selectedItem.id,
        count,
      })
      wx.showToast({ title: '销卡成功' })
      this.setData({
        selectedItem: null,
        deductCount: '',
        availableItems: [],
      })
      this._loadAvailableItems()
    } catch (err) {
      wx.showToast({ title: err.message || '销卡失败', icon: 'none' })
    } finally {
      this._submitting = false
      this.setData({ submitting: false })
    }
  },
})
