const { visitApi } = require('../../utils/api')

Page({
  data: {
    visit: null,
    loading: true,
    saving: false,
    needs: '',
    feedback: '',
    healingNotes: '',
    groupLeaderFeedback: '',
    arrived: false,
    arrivalTime: '',
  },

  onLoad(options) {
    if (options.id) {
      this.loadVisit(options.id)
    }
  },

  async loadVisit(id) {
    try {
      const visit = await visitApi.get(id)
      this.setData({
        visit,
        loading: false,
        needs: visit.needs || '',
        feedback: visit.feedback || '',
        healingNotes: visit.healing_notes || '',
        groupLeaderFeedback: visit.group_leader_feedback || '',
        arrived: visit.arrived || false,
        arrivalTime: visit.arrival_time || '',
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onNeedsInput(e) { this.setData({ needs: e.detail.value }) },
  onFeedbackInput(e) { this.setData({ feedback: e.detail.value }) },
  onHealingNotesInput(e) { this.setData({ healingNotes: e.detail.value }) },
  onGroupLeaderFeedbackInput(e) { this.setData({ groupLeaderFeedback: e.detail.value }) },

  onArrivedChange(e) {
    const arrived = e.detail.value
    const arrivalTime = arrived ? (() => {
      const now = new Date()
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    })() : ''
    this.setData({ arrived, arrivalTime })
  },

  onArrivalTimeChange(e) {
    this.setData({ arrivalTime: e.detail.value })
  },

  async onSubmit() {
    this.setData({ saving: true })
    try {
      await visitApi.update(this.data.visit.id, {
        needs: this.data.needs,
        feedback: this.data.feedback,
        healing_notes: this.data.healingNotes,
        group_leader_feedback: this.data.groupLeaderFeedback,
        arrived: this.data.arrived,
        arrival_time: this.data.arrivalTime || null,
      })
      wx.showToast({ title: '已保存' })
      wx.navigateBack()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
