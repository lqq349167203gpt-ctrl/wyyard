const { visitApi, spaceApi, customerApi } = require('../../utils/api')
const { formatDate, formatTime } = require('../../utils/util')

Page({
  data: {
    date: formatDate(new Date()),
    time: '09:00',
    customerId: '',
    customerName: '',
    needs: '',
    feedback: '',
    healingNotes: '',
    groupLeaderFeedback: '',
    referrerHandler: '',
    referrerHandlerId: '',
    spaces: [],
    spaceIndex: 0,
    isLeader: false,
    arrived: false,
    arrivalTime: '',
    saving: false,
    // 搜索选择弹窗
    allCustomers: [],
    showPicker: false,
    pickerField: '',
    pickerTitle: '',
    pickerKeyword: '',
    pickerList: [],
  },

  onLoad(options) {
    if (options.date) this.setData({ date: options.date })
    if (options.spaceId) this.setData({ _spaceId: options.spaceId })
    this.loadSpaces()
    this.loadCustomers()
  },

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      const spaceIndex = spaces.findIndex(s => s.id === (this.data._spaceId || ''))
      this.setData({ spaces, spaceIndex: Math.max(0, spaceIndex) })
    } catch (e) {
      console.error('加载空间失败:', e)
    }
  },

  async loadCustomers() {
    try {
      const list = await customerApi.light()
      this.setData({ allCustomers: list })
    } catch (e) {
      console.error('加载客户列表失败:', e)
    }
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ time: e.detail.value })
  },

  onSpaceChange(e) {
    this.setData({ spaceIndex: e.detail.value })
  },

  onLeaderChange(e) {
    this.setData({ isLeader: e.detail.value })
  },

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

  onNeedsInput(e) {
    this.setData({ needs: e.detail.value })
  },

  onFeedbackInput(e) {
    this.setData({ feedback: e.detail.value })
  },

  onHealingNotesInput(e) {
    this.setData({ healingNotes: e.detail.value })
  },

  onGroupLeaderFeedbackInput(e) {
    this.setData({ groupLeaderFeedback: e.detail.value })
  },

  // 搜索选择弹窗
  onPickerOpen(e) {
    const field = e.currentTarget.dataset.field
    const titleMap = { customer: '客户', referrerHandler: '邀约人' }
    this.setData({
      showPicker: true,
      pickerField: field,
      pickerTitle: titleMap[field] || field,
      pickerKeyword: '',
      pickerList: this.data.allCustomers,
    })
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerField: '', pickerKeyword: '' })
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
    const { id, nickname } = e.currentTarget.dataset
    const field = this.data.pickerField
    if (field === 'customer') {
      this.setData({ customerId: id, customerName: nickname })
    } else if (field === 'referrerHandler') {
      this.setData({ referrerHandler: nickname, referrerHandlerId: id })
    }
    this.setData({ showPicker: false, pickerField: '', pickerKeyword: '' })
  },

  onPickerClear(e) {
    const field = e.currentTarget.dataset.field
    if (field === 'customer') {
      this.setData({ customerId: '', customerName: '' })
    } else if (field === 'referrerHandler') {
      this.setData({ referrerHandler: '', referrerHandlerId: '' })
    }
  },

  async onSubmit() {
    if (!this.data.customerId) {
      wx.showToast({ title: '请选择客户', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const space = this.data.spaces[this.data.spaceIndex]
      await visitApi.create({
        visit_date: this.data.date,
        visit_time: this.data.time,
        customer_id: this.data.customerId,
        nickname: this.data.customerName,
        needs: this.data.needs,
        feedback: this.data.feedback,
        healing_notes: this.data.healingNotes,
        group_leader_feedback: this.data.groupLeaderFeedback,
        referrer_handler: this.data.referrerHandler,
        space_id: space?.id || '',
        is_leader: this.data.isLeader,
        arrived: this.data.arrived,
        arrival_time: this.data.arrivalTime || null,
      })
      wx.showToast({ title: '已添加' })
      wx.navigateBack()
    } catch (e) {
      wx.showToast({ title: '添加失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
