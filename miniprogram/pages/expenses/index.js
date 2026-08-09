const { expenseApi } = require('../../utils/api')

function formatExpense(item) {
  const amount = Number(item.amount || 0)
  return Object.assign({}, item, {
    _time: (item.expense_time || '').replace('T', ' '),
    _amount: amount.toFixed(2),
  })
}

Page({
  data: {
    hasPagePermission: true,
    list: [],
    loading: false,
    initialized: false,
    page: 0,
    pageSize: 20,
    total: 0,
    hasMore: false,
    dateFrom: '',
    dateTo: '',
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('expenses')) {
      this.setData({ hasPagePermission: false, initialized: true })
      return
    }
    this.loadData(true)
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadData(true)
    }
  },

  onPullDownRefresh() {
    if (!getApp().checkLogin()) return
    this.loadData(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadData(false)
  },

  async loadData(reset) {
    if (this.data.loading || !this.data.hasPagePermission) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })
    try {
      const response = await expenseApi.list({
        page,
        page_size: this.data.pageSize,
        date_from: this.data.dateFrom,
        date_to: this.data.dateTo,
      })
      const rawItems = response && response.items ? response.items : (Array.isArray(response) ? response : [])
      const items = rawItems.map(formatExpense)
      const total = response && typeof response.total === 'number' ? response.total : items.length
      const list = reset ? items : this.data.list.concat(items)
      this.setData({
        list,
        page,
        total,
        hasMore: list.length < total,
        loading: false,
        initialized: true,
      }, () => this.flushPendingFilterRefresh())
    } catch (error) {
      console.error('加载支出记录失败:', error)
      this.setData(
        { loading: false, initialized: true },
        () => this.flushPendingFilterRefresh(),
      )
    }
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/expense-form/index' })
  },

  onDateFromChange(e) {
    this.setData(
      { dateFrom: e.detail.value },
      () => this.refreshForDateFilter(),
    )
  },

  onDateToChange(e) {
    this.setData(
      { dateTo: e.detail.value },
      () => this.refreshForDateFilter(),
    )
  },

  onClearDateFilter() {
    this.setData(
      { dateFrom: '', dateTo: '' },
      () => this.refreshForDateFilter(),
    )
  },

  refreshForDateFilter() {
    if (this.data.loading) {
      this._pendingFilterRefresh = true
      return
    }
    this.loadData(true)
  },

  flushPendingFilterRefresh() {
    if (!this._pendingFilterRefresh) return
    this._pendingFilterRefresh = false
    this.loadData(true)
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/expense-form/index?id=${item.id}` })
        } else if (result.tapIndex === 1) {
          this.confirmDelete(item)
        }
      },
    })
  },

  confirmDelete(item) {
    wx.showModal({
      title: '删除支出记录',
      content: `确定删除“${item.purchase_content}”吗？`,
      confirmColor: '#c4506a',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await expenseApi.delete(item.id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadData(true)
        } catch (error) {
          console.error('删除支出记录失败:', error)
        }
      },
    })
  },
})
