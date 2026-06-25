const { visitApi, spaceApi, customerApi } = require('../../utils/api')

Page({
  data: {
    visit: null,
    loading: true,
    saving: false,
    spaceName: '',
    visitTime: '09:00',
    referrerHandler: '',
    isLeader: false,
    needs: '',
    feedback: '',
    healingNotes: '',
    groupLeaderFeedback: '',
    arrived: false,
    arrivalTime: '',
    // 搜索选择弹窗
    allCustomers: [],
    showPicker: false,
    pickerKeyword: '',
    pickerList: [],
  },

  onLoad(options) {
    if (options.id) {
      this.loadVisit(options.id)
    }
  },

  async loadVisit(id) {
    try {
      const visit = await visitApi.get(id)
      let spaceName = ''
      if (visit.space_id) {
        try {
          const spaces = await spaceApi.list()
          const space = spaces.find(s => s.id === visit.space_id)
          spaceName = space?.name || ''
        } catch {}
      }
      this.setData({
        visit,
        spaceName,
        loading: false,
        visitTime: visit.visit_time || '09:00',
        referrerHandler: visit.referrer_handler || '',
        isLeader: visit.is_leader || false,
        needs: visit.needs || '',
        feedback: visit.feedback || '',
        healingNotes: visit.healing_notes || '',
        groupLeaderFeedback: visit.group_leader_feedback || '',
        arrived: visit.arrived || false,
        arrivalTime: visit.arrival_time || '',
      })
      this.loadCustomers()
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async loadCustomers() {
    try {
      const list = await customerApi.light()
      this.setData({ allCustomers: list })
    } catch {}
  },

  onTimeChange(e) {
    this.setData({ visitTime: e.detail.value })
  },

  onLeaderChange(e) {
    this.setData({ isLeader: e.detail.value })
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

  // 搜索选择弹窗
  onPickerOpen() {
    this.setData({
      showPicker: true,
      pickerKeyword: '',
      pickerList: this.data.allCustomers,
    })
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerKeyword: '' })
  },

  onPickerSearch(e) {
    const keyword = e.detail.value
    const list = this.data.allCustomers.filter(c => {
      if (!keyword) return true
      return c.nickname.includes(keyword) || (c.name && c.name.includes(keyword))
    })
    this.setData({ pickerKeyword: keyword, pickerList: list })
  },

  onPickerSelect(e) {
    const { nickname } = e.currentTarget.dataset
    this.setData({
      referrerHandler: nickname,
      showPicker: false,
      pickerKeyword: '',
    })
  },

  onPickerClear() {
    this.setData({ referrerHandler: '' })
  },

  async onSubmit() {
    this.setData({ saving: true })
    try {
      await visitApi.update(this.data.visit.id, {
        visit_time: this.data.visitTime,
        referrer_handler: this.data.referrerHandler,
        is_leader: this.data.isLeader,
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
