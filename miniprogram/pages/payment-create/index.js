Page({
  data: {
    type: '',
    pickerOpen: false,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    this.setData({ type: options.type || 'membership_card' })
  },

  onPickerState(e) {
    this.setData({ pickerOpen: e.detail.open })
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
