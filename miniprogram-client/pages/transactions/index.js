const { clientApi } = require('../../utils/api')

const TYPE_LABELS = {
  purchase: '购卡',
  refund: '退款',
}

Page({
  data: {
    items: [],
    groups: [],
    loading: true,
  },

  onShow() {
    this.loadTransactions()
  },

  async loadTransactions() {
    this.setData({ loading: true, items: [], groups: [] })
    try {
      const res = await clientApi.getTransactions()
      const items = (res.items || []).map(r => {
        const isRefund = r.type === 'refund' || r.amount < 0
        return {
          ...r,
          is_refund: isRefund,
          type: TYPE_LABELS[r.type] || r.type,
          amount_text: r.amount != null
            ? (isRefund ? `+¥${Math.abs(r.amount)}` : `¥${r.amount}`)
            : '',
          validity_text: this._validityText(r),
          date_label: this._dateLabel(r.created_at),
        }
      })
      this.setData({
        items,
        groups: this._groupByDate(items),
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _formatDate(str) {
    if (!str) return ''
    const parts = String(str).slice(0, 10).split('-')
    if (parts.length !== 3) return str
    return `${parts[0]}.${parts[1]}.${parts[2]}`
  },

  _validityText(r) {
    const effective = this._formatDate(r.effective_date)
    const expiry = this._formatDate(r.expiry_date)
    if (effective && expiry) return `${effective} - ${expiry}`
    if (expiry) return `有效期至 ${expiry}`
    if (effective) return `${effective} 起长期有效`
    return '长期有效'
  },

  _dateLabel(dateText) {
    if (!dateText) return '其他'
    const d = new Date(dateText)
    if (isNaN(d.getTime())) return '其他'
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayDiff = Math.round((today - target) / 86400000)
    if (dayDiff === 0) return '今天'
    if (dayDiff === 1) return '昨天'
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  _groupByDate(items) {
    const groups = []
    for (const item of items) {
      const last = groups[groups.length - 1]
      if (last && last.day === item.date_label) {
        last.items.push(item)
      } else {
        groups.push({ day: item.date_label, items: [item] })
      }
    }
    return groups
  },
})
