Page({
  data: {
    field: '',
    label: '',
    text: '',
  },

  onLoad(options) {
    const field = options.field || ''
    const label = options.label || ''
    wx.setNavigationBarTitle({ title: label })

    // 从上一页读取当前值
    const pages = getCurrentPages()
    const prev = pages[pages.length - 2]
    if (prev && field) {
      this.setData({
        field,
        label,
        text: prev.data[field] || '',
      })
    } else {
      this.setData({ field, label })
    }
  },

  onInput(e) {
    this.setData({ text: e.detail.value })
  },

  onSave() {
    const pages = getCurrentPages()
    const prev = pages[pages.length - 2]
    if (prev && this.data.field) {
      prev.setData({ [this.data.field]: this.data.text })
    }
    wx.navigateBack()
  },

})
