const { customerApi } = require('../../utils/api')

Page({
  data: {
    customerId: '',
    customer: null,
    loading: true,
    healerText: '',
    firstVisit: '',
    totalPayment: 0,
    activities: [],
    healingRecords: [],
    purchaseSummary: [],
    paymentRecords: [],
    activeTab: 'healing',
    tabs: [
      { key: 'healing', label: '跟进点' },
      { key: 'activities', label: '活动记录' },
      { key: 'purchase', label: '剩余次数' },
      { key: 'payment', label: '交易记录' },
    ],
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ customerId: options.id })
      this.loadData(options.id)
    }
  },

  async loadData(id) {
    this.setData({ loading: true })
    try {
      const detail = await customerApi.detail(id)
      const c = detail.customer

      // 疗愈老师
      const healerText = (c.positions || [])
        .filter(p => ['成就君', '能量结老师', '课程老师'].includes(p))
        .join('、')

      const visitRecords = detail.visit_records || []
      const arrived = visitRecords.filter(v => v.arrived).sort((a, b) => a.visit_date.localeCompare(b.visit_date))
      const firstVisit = arrived.length > 0 ? arrived[0].visit_date : ''
      const totalPayment = (detail.payment_records || []).reduce((sum, r) => sum + (r.amount || 0), 0)
      const arrivedDates = new Set(arrived.map(v => v.visit_date))

      // 活动记录
      const activities = (detail.activities || []).map(a => ({
        ...a,
        notArrived: !arrivedDates.has(a.date),
      }))

      // 跟进点
      const healingRecords = visitRecords.map(v => {
        const hr = (detail.healing_records || []).find(r => r.date === v.visit_date)
        return { ...v, growth_record: hr?.growth_record || v.healing_notes || '' }
      })

      // 剩余次数
      const purchaseSummary = detail.purchase_summary || []

      // 交易记录
      const paymentRecords = (detail.payment_records || []).sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))

      this.setData({ customer: c, healerText, firstVisit, totalPayment, activities, healingRecords, purchaseSummary, paymentRecords, loading: false })
    } catch (e) {
      console.error('加载客户资料失败:', e)
      this.setData({ loading: false })
    }
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key })
  },

  onEditTap() {
    wx.navigateTo({ url: `/pages/customer-form/index?id=${this.data.customerId}` })
  },
})
