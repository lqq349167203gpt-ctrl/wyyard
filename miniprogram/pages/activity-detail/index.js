Page({
  data: {
    record: null,
  },

  onLoad() {
    const app = getApp()
    const record = app.globalData._selectedActivity
    if (record && record.id) {
      this.setData({ record })
    } else {
      console.warn('activity-detail: no record in globalData', record)
    }
  },
})
