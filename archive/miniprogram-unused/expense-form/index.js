const { expenseApi } = require('../../utils/api')

function twoDigits(value) {
  return String(value).padStart(2, '0')
}

function currentDateTime() {
  const now = new Date()
  return {
    date: `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`,
    time: `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`,
  }
}

Page({
  data: {
    hasPagePermission: true,
    isEdit: false,
    editId: '',
    loading: false,
    saving: false,
    costCategoryOptions: [
      { value: 'management', label: '管理成本' },
      { value: 'operation', label: '运营成本' },
    ],
    costCategory: 'management',
    costCategoryIndex: 0,
    expenseTypes: [],
    expenseTypeOptions: [],
    expenseType: '',
    expenseTypeIndex: -1,
    needsCustomer: false,
    needsPlatform: false,
    selectedCustomer: null,
    originalCostCategory: '',
    originalExpenseType: '',
    originalCustomer: null,
    originalPlatform: '',
    expenseDate: '',
    expenseTime: '',
    purchaseContent: '',
    amount: '',
    platform: '',
    notes: '',
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('expenses')) {
      this.setData({ hasPagePermission: false })
      return
    }
    const now = currentDateTime()
    const isEdit = Boolean(options.id)
    this.setData({
      isEdit,
      editId: options.id || '',
      expenseDate: now.date,
      expenseTime: now.time,
    })
    wx.setNavigationBarTitle({ title: isEdit ? '编辑支出' : '新增支出' })
    this.initialize(options.id || '')
  },

  onShow() {
    if (!getApp().checkLogin()) return
  },

  async initialize(id) {
    this.setData({ loading: true })
    let expenseTypes = []
    try {
      expenseTypes = await expenseApi.listTypes()
    } catch (error) {
      console.error('加载支出类型失败:', error)
    }
    const expenseTypeOptions = (expenseTypes || []).filter(item => item.cost_category === 'management')
    this.setData({ expenseTypes: expenseTypes || [], expenseTypeOptions })
    if (id) await this.loadDetail(id)
    else this.setData({ loading: false })
  },

  async loadDetail(id) {
    try {
      const item = await expenseApi.get(id)
      const dateTime = (item.expense_time || '').split('T')
      const costCategory = item.cost_category === 'operation' ? 'operation' : 'management'
      let expenseTypeOptions = this.data.expenseTypes.filter(type => type.cost_category === costCategory)
      let expenseTypeIndex = expenseTypeOptions.findIndex(type => type.name === item.expense_type)
      if (expenseTypeIndex < 0 && item.expense_type) {
        expenseTypeOptions = expenseTypeOptions.concat([{
          id: `legacy-${item.expense_type}`,
          cost_category: costCategory,
          name: item.expense_type,
          requires_customer: Boolean(item.customer_id || item.customer_nickname),
          requires_platform: Boolean(item.platform),
        }])
        expenseTypeIndex = expenseTypeOptions.length - 1
      }
      const selectedType = expenseTypeIndex >= 0 ? expenseTypeOptions[expenseTypeIndex] : null
      this.setData({
        costCategory,
        costCategoryIndex: costCategory === 'operation' ? 1 : 0,
        expenseTypeOptions,
        expenseType: item.expense_type || '',
        expenseTypeIndex,
        needsCustomer: Boolean(selectedType && selectedType.requires_customer),
        needsPlatform: Boolean(selectedType && selectedType.requires_platform),
        selectedCustomer: item.customer_id ? { id: item.customer_id, nickname: item.customer_nickname || '' } : null,
        originalCostCategory: costCategory,
        originalExpenseType: item.expense_type || '',
        originalCustomer: item.customer_id ? { id: item.customer_id, nickname: item.customer_nickname || '' } : null,
        originalPlatform: item.platform || '',
        expenseDate: dateTime[0] || this.data.expenseDate,
        expenseTime: dateTime[1] || this.data.expenseTime,
        purchaseContent: item.purchase_content || '',
        amount: String(item.amount || ''),
        platform: item.platform || '',
        notes: item.notes || '',
        loading: false,
      })
    } catch (error) {
      console.error('加载支出详情失败:', error)
      this.setData({ loading: false })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  onDateChange(e) {
    this.setData({ expenseDate: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ expenseTime: e.detail.value })
  },

  onCostCategoryChange(e) {
    const costCategoryIndex = Number(e.detail.value)
    const costCategory = this.data.costCategoryOptions[costCategoryIndex].value
    this.setData({
      costCategory,
      costCategoryIndex,
      expenseTypeOptions: this.data.expenseTypes.filter(item => item.cost_category === costCategory),
      expenseType: '',
      expenseTypeIndex: -1,
      needsCustomer: false,
      needsPlatform: false,
      selectedCustomer: null,
      platform: '',
    })
  },

  onExpenseTypeChange(e) {
    const expenseTypeIndex = Number(e.detail.value)
    const expenseType = this.data.expenseTypeOptions[expenseTypeIndex]
    if (!expenseType) return
    this.setData({
      expenseTypeIndex,
      expenseType: expenseType.name,
      needsCustomer: Boolean(expenseType.requires_customer),
      needsPlatform: Boolean(expenseType.requires_platform),
      selectedCustomer: expenseType.requires_customer ? this.data.selectedCustomer : null,
      platform: expenseType.requires_platform ? this.data.platform : '',
    })
  },

  onCustomerSelect(e) {
    this.setData({ selectedCustomer: e.detail.customer })
  },

  onCustomerClear() {
    this.setData({ selectedCustomer: null })
  },

  onPurchaseContentInput(e) {
    this.setData({ purchaseContent: e.detail.value })
  },

  onAmountInput(e) {
    const value = e.detail.value.replace(/[^0-9.]/g, '')
    this.setData({ amount: value })
  },

  onPlatformInput(e) {
    this.setData({ platform: e.detail.value })
  },

  onNotesInput(e) {
    this.setData({ notes: e.detail.value })
  },

  async onSubmit() {
    if (this.data.saving) return
    const purchaseContent = this.data.purchaseContent.trim()
    const platform = this.data.platform.trim()
    const amount = Number(this.data.amount)
    if (!this.data.expenseDate || !this.data.expenseTime) {
      wx.showToast({ title: '请选择支出时间', icon: 'none' })
      return
    }
    if (!purchaseContent) {
      wx.showToast({ title: '请输入支出项', icon: 'none' })
      return
    }
    if (!this.data.expenseType) {
      wx.showToast({ title: '请选择支出类型', icon: 'none' })
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      wx.showToast({ title: '请输入正确金额', icon: 'none' })
      return
    }
    if (this.data.needsCustomer && !this.data.selectedCustomer) {
      wx.showToast({ title: '请选择用户昵称', icon: 'none' })
      return
    }
    if (this.data.needsPlatform && !platform) {
      wx.showToast({ title: '请输入平台', icon: 'none' })
      return
    }

    const keepsExistingOptionalFields = this.data.isEdit
      && this.data.costCategory === this.data.originalCostCategory
      && this.data.expenseType === this.data.originalExpenseType
    const selectedCustomer = this.data.needsCustomer
      ? this.data.selectedCustomer
      : (keepsExistingOptionalFields ? this.data.originalCustomer : null)
    const payload = {
      expense_time: `${this.data.expenseDate}T${this.data.expenseTime}`,
      cost_category: this.data.costCategory,
      expense_type: this.data.expenseType,
      purchase_content: purchaseContent,
      amount,
      customer_id: selectedCustomer ? selectedCustomer.id : '',
      customer_nickname: selectedCustomer ? selectedCustomer.nickname : '',
      platform: this.data.needsPlatform ? platform : (keepsExistingOptionalFields ? this.data.originalPlatform : ''),
      notes: this.data.notes.trim(),
    }

    this.setData({ saving: true })
    try {
      if (this.data.isEdit) {
        await expenseApi.update(this.data.editId, payload)
      } else {
        await expenseApi.create(payload)
      }
      const pages = getCurrentPages()
      const previousPage = pages[pages.length - 2]
      if (previousPage) previousPage._needRefresh = true
      wx.showToast({ title: this.data.isEdit ? '已更新' : '已创建', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      console.error('保存支出记录失败:', error)
    } finally {
      this.setData({ saving: false })
    }
  },
})
