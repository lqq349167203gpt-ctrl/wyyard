const { clientApi } = require('../../utils/api')

Page({
  data: {
    items: [],
    loading: true,
  },

  onShow() {
    this.loadTransactions()
  },

  async loadTransactions() {
    this.setData({ loading: true })
    try {
      const res = await clientApi.getTransactions()
      const items = (res.items || []).map(r => ({
        ...r,
        amount_text: r.amount != null ? `¥${r.amount}` : '',
        date_text: this._formatDate(r.effective_date || r.created_at),
        expiry_text: r.expiry_date ? `到期 ${r.expiry_date}` : '',
      }))
      this.setData({ items, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _formatDate(str) {
    if (!str) return ''
    return str.slice(0, 10)
  },
})
