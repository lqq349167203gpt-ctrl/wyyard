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
    if (isEdit) this.loadDetail(options.id)
  },

  onShow() {
    if (!getApp().checkLogin()) return
  },

  async loadDetail(id) {
    this.setData({ loading: true })
    try {
      const item = await expenseApi.get(id)
      const dateTime = (item.expense_time || '').split('T')
      this.setData({
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
      wx.showToast({ title: '请输入购买内容', icon: 'none' })
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      wx.showToast({ title: '请输入正确金额', icon: 'none' })
      return
    }
    if (!platform) {
      wx.showToast({ title: '请输入平台', icon: 'none' })
      return
    }

    const payload = {
      expense_time: `${this.data.expenseDate}T${this.data.expenseTime}`,
      purchase_content: purchaseContent,
      amount,
      platform,
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
