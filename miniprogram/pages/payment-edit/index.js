const { paymentApi } = require('../../utils/api')

Page({
  data: {
    type: '',
    editData: null,
    loading: true,
  },

  async onLoad(options) {
    if (!getApp().checkLogin()) return
    const type = options.type || 'membership_card'
    const id = options.id
    this.setData({ type })

    if (id) {
      try {
        const api = paymentApi.getByType(type)
        const res = await api.listPaginated(1, 200)
        const items = res.items || res.data || res || []
        const item = (Array.isArray(items) ? items : []).find(i => i.id === id)
        if (item) {
          this.setData({ editData: item, loading: false })
        } else {
          wx.showToast({ title: '项目不存在', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1500)
        }
      } catch (e) {
        console.error('加载项目失败:', e)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } else {
      this.setData({ loading: false })
    }
  },

  onFormSuccess() {
    const pages = getCurrentPages()
    if (pages.length >= 2) {
      const prev = pages[pages.length - 2]
      if (prev) prev._needRefresh = true
    }
    wx.navigateBack()
  },
})
