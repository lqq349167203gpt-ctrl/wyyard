const {
  membershipCardApi,
  groupCaseApi,
  emotionalReleaseApi,
  ohCardReadingApi,
  energyKnotApi,
  internalCourseApi,
  otherProjectApi,
} = require('../../utils/api')

const TABS = [
  { value: 'membership_card', label: '会员卡', api: membershipCardApi },
  { value: 'group_case', label: '觉醒游戏', api: groupCaseApi },
  { value: 'emotional_release', label: '情绪释放', api: emotionalReleaseApi },
  { value: 'oh_card_reading', label: 'OH卡梳理', api: ohCardReadingApi },
  { value: 'energy_knot', label: '能量结', api: energyKnotApi },
  { value: 'internal_course', label: '内部课程', api: internalCourseApi },
  { value: 'other', label: '其他', api: otherProjectApi },
]

Page({
  data: {
    tabs: TABS.map(t => ({ value: t.value, label: t.label })),
    activeType: 'membership_card',
    items: [],
    loading: false,
  },

  onShow() {
    this.loadList()
  },

  onTabChange(e) {
    const type = e.currentTarget.dataset.value
    this.setData({ activeType: type })
    this.loadList()
  },

  async loadList() {
    const { activeType } = this.data
    const tab = TABS.find(t => t.value === activeType)
    if (!tab) return

    this.setData({ loading: true })
    try {
      const res = await tab.api.list()
      const raw = Array.isArray(res) ? res : (res.items || [])
      const items = raw.filter(item => !item.is_deleted).map(item => {
        const normalized = this.normalizeItem(item, activeType)
        return normalized
      })
      items.sort((a, b) => (b.deal_date || '').localeCompare(a.deal_date || ''))
      this.setData({ items })
    } catch (err) {
      console.error('[payment-projects] 加载失败:', err)
      this.setData({ items: [] })
    }
    this.setData({ loading: false })
  },

  normalizeItem(item, type) {
    const base = {
      id: item.id,
      _type: type,
      nickname: item.nickname || '',
      deal_date: item.deal_date || '',
      closer_name: item.closer_name || '',
    }

    switch (type) {
      case 'membership_card':
        base._amount = item.price || 0
        base._extra = item.card_type || ''
        break
      case 'group_case':
      case 'emotional_release':
      case 'oh_card_reading':
      case 'energy_knot':
        base._amount = item.amount || 0
        base._extra = item.purchase_count ? `${item.purchase_count}次` : ''
        break
      case 'internal_course':
        base._amount = item.price || 0
        base._extra = item.course_type || ''
        break
      case 'other':
        base._amount = item.fee || 0
        base._extra = item.project_name || ''
        break
      default:
        base._amount = 0
        base._extra = ''
    }
    return base
  },

  onCreate() {
    wx.navigateTo({
      url: `/pages/payment-projects/form?type=${this.data.activeType}`,
    })
  },

  onEdit(e) {
    const { id, type } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/payment-projects/form?type=${type}&id=${id}`,
    })
  },

  onDelete(e) {
    const { id, type } = e.currentTarget.dataset
    const tab = TABS.find(t => t.value === type)
    if (!tab) return

    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除？',
      success: (res) => {
        if (res.confirm) {
          tab.api.delete(id).then(() => {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadList()
          }).catch(err => {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' })
          })
        }
      },
    })
  },
})
