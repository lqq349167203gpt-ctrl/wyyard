const { paymentApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')

const TYPE_NAMES = {}
PAYMENT_PROJECT_TYPES.forEach(t => { TYPE_NAMES[t.key] = t.label })

Page({
  data: {
    type: '',
    typeName: '',
    editData: null,
    loading: true,
    saving: false,
  },

  async onLoad(options) {
    if (!getApp().checkLogin()) return
    const type = options.type || 'membership_card'
    const id = options.id
    this.setData({ type, typeName: TYPE_NAMES[type] || '付费项目' })

    if (id) {
      try {
        const api = paymentApi.getByType(type)
        const item = await api.get(id)
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

  onDeleteTap() {
    const { editData, type, typeName } = this.data
    if (!editData) return
    wx.showModal({
      title: '确认删除',
      content: `确定删除 ${editData.nickname} 的${typeName}记录？`,
      success: (res) => {
        if (res.confirm) {
          const api = paymentApi.getByType(type)
          api.delete(editData.id).then(() => {
            wx.showToast({ title: '已删除' })
            // 通知前两页（详情页 + 列表页）刷新
            const pages = getCurrentPages()
            if (pages.length >= 3) {
              const detail = pages[pages.length - 2]
              const list = pages[pages.length - 3]
              if (detail) detail._needRefresh = true
              if (list) list._needRefresh = true
            }
            setTimeout(() => {
              wx.navigateBack({ delta: 2 })
            }, 500)
          }).catch(() => {
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      },
    })
  },

  onSave() {
    const form = this.selectComponent('#paymentForm')
    if (form) form.onSubmit()
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
