Page({
  data: {
    type: '',
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    this.setData({ type: options.type || 'membership_card' })
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
