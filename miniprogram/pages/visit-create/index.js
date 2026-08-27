const { visitApi, visitNoteApi, spaceApi, customerApi } = require('../../utils/api')
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
    if (!getApp().checkLogin()) return
    if (options.date) this.setData({ date: options.date })
    if (options.spaceId) this.setData({ _spaceId: options.spaceId })
    this.loadSpaces()
    this.loadCustomers()
  },

  onShow() {
    if (!getApp().checkLogin()) return
    // 从新建客户页返回时，重新加载客户列表并自动选中新建的客户
    if (this.data._expectNewCustomer) {
      const oldIds = new Set(this.data.allCustomers.map(c => c.id))
      this.loadCustomers().then(() => {
        const newOne = this.data.allCustomers.find(c => !oldIds.has(c.id))
        if (newOne) {
          this.setData({ customerId: newOne.id, customerName: newOne.nickname })
        }
        this.setData({ _expectNewCustomer: false })
      })
    }
  },

  onCreateCustomer() {
    this.setData({ _expectNewCustomer: true, showPicker: false })
    wx.navigateTo({ url: '/pages/customer-form/index' })
  },

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      const spaceIndex = spaces.findIndex(s => s.id === (this.data._spaceId || ''))
      this.setData({ spaces, spaceIndex: Math.max(0, spaceIndex) })
    } catch (e) {
      console.error('加载空间失败:', e)
      wx.showToast({ title: '加载空间失败', icon: 'none' })
    }
  },

  async loadCustomers() {
    try {
      const list = await customerApi.light()
      this.setData({ allCustomers: list })
    } catch (e) {
      console.error('加载客户列表失败:', e)
      wx.showToast({ title: '加载客户列表失败', icon: 'none' })
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

  onOpenEditor(e) {
    const { field, label } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/text-editor/index?field=${encodeURIComponent(field)}&label=${encodeURIComponent(label)}` })
  },

  onFeedbackInput(e) {
    this.setData({ feedback: e.detail.value })
  },

  onHealingNotesInput(e) {
    this.setData({ healingNotes: e.detail.value })
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
      const kw = keyword.toLowerCase()
      return c.nickname.toLowerCase().includes(kw) || (c.name && c.name.toLowerCase().includes(kw))
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

  onBack() {
    wx.navigateBack()
  },

  async onSubmit() {
    if (!this.data.customerId) {
      wx.showToast({ title: '请选择客户', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const space = this.data.spaces[this.data.spaceIndex]
      const visit = await visitApi.create({
        visit_date: this.data.date,
        visit_time: this.data.time,
        customer_id: this.data.customerId,
        needs: this.data.needs,
        referrer_handler: this.data.referrerHandler,
        referrer_handler_id: this.data.referrerHandlerId || '',
        space_id: space?.id || '',
        is_leader: this.data.isLeader,
        arrived: this.data.arrived,
        arrival_time: this.data.arrivalTime || null,
      })
      const noteRequests = []
      if ((this.data.feedback || '').trim()) {
        noteRequests.push(visitNoteApi.create({
          visit_id: visit.id,
          category: 'customer_info',
          content: this.data.feedback.trim(),
        }))
      }
      if ((this.data.healingNotes || '').trim()) {
        noteRequests.push(visitNoteApi.create({
          visit_id: visit.id,
          category: 'follow_up',
          content: this.data.healingNotes.trim(),
        }))
      }
      const noteResults = await Promise.all(noteRequests.map((request) => request.then(() => true).catch(() => false)))
      wx.showToast({
        title: noteResults.includes(false) ? '邀约已添加，部分记录未保存' : '已添加',
        icon: noteResults.includes(false) ? 'none' : 'success',
      })
      wx.navigateBack()
    } catch (e) {
      this.setData({ saving: false })
      wx.showModal({
        title: '添加失败',
        content: '是否重试？',
        success: (res) => { if (res.confirm) this.onSubmit() },
      })
      return
    }
    this.setData({ saving: false })
  },
})
