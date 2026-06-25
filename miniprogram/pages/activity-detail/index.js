Page({
  data: {
    record: null,
  },

  onLoad() {
    const record = getApp().globalData._selectedActivity
    if (record) {
      this.setData({ record })
    }
  },
})
