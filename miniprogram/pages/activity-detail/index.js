const {
  classRecordApi, groupCaseSessionApi, emotionalReleaseSessionApi,
  energyKnotSessionApi, internalCourseSessionApi, ohCardReadingSessionApi,
} = require('../../utils/api')

const DELETE_API = {
  class_record: classRecordApi,
  group_case: groupCaseSessionApi,
  emotional_release: emotionalReleaseSessionApi,
  energy_knot: energyKnotSessionApi,
  internal_course: internalCourseSessionApi,
  oh_card: ohCardReadingSessionApi,
}

Page({
  data: {
    record: null,
    deleting: false,
  },

  onLoad() {
    const app = getApp()
    const record = app.globalData._selectedActivity
    if (record && record.id) {
      this.setData({ record })
    }
  },

  onDelete() {
    const { record } = this.data
    if (!record) return
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除？',
      confirmColor: '#e34d59',
      success: async (res) => {
        if (!res.confirm) return
        const api = DELETE_API[record.source]
        if (!api) {
          wx.showToast({ title: '不支持删除此类型', icon: 'none' })
          return
        }
        this.setData({ deleting: true })
        try {
          await api.delete(record.id)
          wx.showToast({ title: '已删除' })
          const pages = getCurrentPages()
          const prevPage = pages[pages.length - 2]
          if (prevPage && prevPage.loadData) {
            prevPage.loadData()
          }
          wx.navigateBack()
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        } finally {
          this.setData({ deleting: false })
        }
      },
    })
  },
})
