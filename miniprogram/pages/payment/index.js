const { paymentApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')

const TABS = PAYMENT_PROJECT_TYPES

function formatDate(d) {
  if (!d) return ''
  return d.slice(0, 10)
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
  // group_case, emotional_release, oh_card_reading, energy_knot
  const count = item.purchase_count
  return count != null ? `${count}次` : ''
}

function buildPrice(item, type) {
  if (type === 'membership_card' || type === 'internal_course') return item.price
  if (type === 'other') return item.fee
  return item.amount
}

Page({
  data: {
    tabs: TABS,
    activeTab: 0,
    items: [],
    loading: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    this.loadItems()
  },

  onShow() {
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadItems()
    }
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh())
  },

  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ activeTab: index, items: [] })
    this.loadItems()
  },

  async loadItems() {
    if (this._loading) return
    this._loading = true
    this.setData({ loading: true })

    try {
      const type = TABS[this.data.activeTab].key
      const api = paymentApi.getByType(type)
      const res = await api.listPaginated(1, 100)
      const raw = res.items || res.data || res || []
      const items = (Array.isArray(raw) ? raw : []).map(item => ({
        ...item,
        _detail: buildDetail(item, type),
        _price: buildPrice(item, type),
        _effective: formatDate(item.effective_date),
        _expiry: formatDate(item.expiry_date),
        _remaining: item.remaining_count === null ? '不限' : (item.remaining_count ?? ''),
      }))
      this.setData({ items, loading: false })
    } catch (e) {
      console.error('加载付费项目失败:', e)
      this.setData({ loading: false })
    } finally {
      this._loading = false
    }
  },

  onAddTap() {
    const type = TABS[this.data.activeTab].key
    wx.navigateTo({ url: `/pages/payment-create/index?type=${type}` })
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item
    const type = TABS[this.data.activeTab].key
    wx.navigateTo({ url: `/pages/payment-edit/index?type=${type}&id=${item.id}` })
  },

  onDeleteTap(e) {
    const item = e.currentTarget.dataset.item
    const type = TABS[this.data.activeTab].key
    wx.showModal({
      title: '确认删除',
      content: `确定删除 ${item.nickname} 的${TABS[this.data.activeTab].label}记录？`,
      success: (res) => {
        if (res.confirm) {
          const api = paymentApi.getByType(type)
          api.delete(item.id).then(() => {
            wx.showToast({ title: '已删除' })
            this.loadItems()
          }).catch(err => {
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      },
    })
  },
})
