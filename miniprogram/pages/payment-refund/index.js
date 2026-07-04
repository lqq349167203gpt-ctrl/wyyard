const { paymentApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')

// 从共享常量派生，key 用 apiPath（连字符），与后端路由一致
const PROJECT_TYPES = PAYMENT_PROJECT_TYPES.map(t => ({ key: t.apiPath, label: t.label }))

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    showResults: false,
    selectedCustomer: null,
    projectTypes: PROJECT_TYPES,
    projectTypeIndex: -1,
    availableItems: [],
    selectedItem: null,
    refundAmount: '',
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

  // ---- 加载可退费项目 ----

  async _loadAvailableItems() {
    const { selectedCustomer, projectTypeIndex } = this.data
    if (!selectedCustomer || projectTypeIndex < 0) return

    const reqId = ++this._loadReqId
    const projectType = PROJECT_TYPES[projectTypeIndex].key
    try {
      const items = await paymentApi.refunds.availableItems(selectedCustomer.id, projectType)
      if (reqId !== this._loadReqId) return
      this.setData({ availableItems: items || [] })
    } catch (e) {
      if (reqId !== this._loadReqId) return
      console.error('加载可退费项目失败:', e)
      this.setData({ availableItems: [] })
    }
  },

  // ---- 选择项目 ----

  onSelectItem(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      selectedItem: item,
      refundAmount: item.paid_amount || '',
    })
  },

  onClearItem() {
    this.setData({ selectedItem: null, refundAmount: '' })
  },

  // ---- 退费金额 ----

  onAmountInput(e) {
    this.setData({ refundAmount: e.detail.value })
  },

  // ---- 提交 ----

  async onSubmit() {
    if (this._submitting) return
    const { selectedCustomer, projectTypeIndex, selectedItem, refundAmount } = this.data

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
    const amount = parseFloat(refundAmount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入退费金额', icon: 'none' })
      return
    }
    if (selectedItem.paid_amount && amount > selectedItem.paid_amount) {
      wx.showToast({ title: '退费金额超过已付金额', icon: 'none' })
      return
    }

    const projectType = PROJECT_TYPES[projectTypeIndex].key

    const doRefund = async () => {
      this._submitting = true
      this.setData({ submitting: true })
      try {
        await paymentApi.refunds.create({
          customer_id: selectedCustomer.id,
          project_type: projectType,
          project_id: selectedItem.id,
          refund_amount: amount,
        })
        wx.showToast({ title: '退费成功' })
        this.setData({
          selectedItem: null,
          refundAmount: '',
          availableItems: [],
        })
        this._loadAvailableItems()
      } catch (err) {
        wx.showToast({ title: err.message || '退费失败', icon: 'none' })
      } finally {
        this._submitting = false
        this.setData({ submitting: false })
      }
    }

    const confirmMsg = projectType === 'membership-cards'
      ? '该会员卡将被作废，确认退费？'
      : '确认退费？'
    wx.showModal({
      title: '确认退费',
      content: confirmMsg,
      success: (res) => {
        if (res.confirm) doRefund()
      },
    })
  },
})
