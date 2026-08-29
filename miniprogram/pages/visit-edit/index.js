const { visitApi, spaceApi, customerApi } = require('../../utils/api')
const { canEditRecord } = require('../../utils/record-ownership')

Page({
  data: {
    visit: null,
    loading: true,
    saving: false,
    readOnly: false,
    createdBy: '',
    spaceName: '',
    visitDate: '',
    visitTime: '09:00',
    customerId: '',
    nickname: '',
    referrerHandler: '',
    referrerHandlerId: '',
    isLeader: false,
    arrived: false,
    arrivalTime: '',
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
    if (options.id) {
      this.loadVisit(options.id)
    }
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this.data._expectNewCustomer) {
      const oldIds = new Set(this.data.allCustomers.map(c => c.id))
      this.loadCustomers().then(() => {
        const newOne = this.data.allCustomers.find(c => !oldIds.has(c.id))
        if (newOne) {
          this.setData({ customerId: newOne.id, nickname: newOne.nickname })
        }
        this.setData({ _expectNewCustomer: false })
      })
    }
  },

  onCreateCustomer() {
    this.setData({ _expectNewCustomer: true, showPicker: false })
    wx.navigateTo({ url: '/pages/customer-form/index' })
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
        } catch (e) {
          console.error('加载空间失败:', e)
          wx.showToast({ title: '加载空间失败', icon: 'none' })
        }
      }
      this.setData({
        visit,
        readOnly: !canEditRecord(visit, 'visits'),
        createdBy: visit.created_by || '',
        spaceName,
        loading: false,
        visitDate: visit.visit_date || '',
        visitTime: visit.visit_time || '09:00',
        customerId: visit.customer_id || '',
        nickname: visit.nickname || '',
        referrerHandler: visit.referrer_handler || '',
        referrerHandlerId: visit.referrer_handler_id || '',
        isLeader: visit.is_leader || false,
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
    } catch (e) {
      console.error('加载客户列表失败:', e)
      wx.showToast({ title: '加载客户列表失败', icon: 'none' })
    }
  },

  onTimeChange(e) {
    this.setData({ visitTime: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ visitDate: e.detail.value })
  },

  onLeaderChange(e) {
    this.setData({ isLeader: e.detail.value })
  },

  async onArrivedChange(e) {
    const previousArrived = this.data.arrived
    const previousArrivalTime = this.data.arrivalTime
    const arrived = e.detail.value
    const arrivalTime = arrived ? (() => {
      const now = new Date()
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    })() : ''
    this.setData({ arrived, arrivalTime })
    if (this.data.readOnly) {
      try {
        await visitApi.update(this.data.visit.id, {
          arrived,
          arrival_time: arrivalTime || null,
        })
        this.setData({ visit: { ...this.data.visit, arrived, arrival_time: arrivalTime } })
        wx.showToast({ title: arrived ? '已确认到店' : '已取消到店' })
      } catch (e) {
        this.setData({ arrived: previousArrived, arrivalTime: previousArrivalTime })
      }
    }
  },

  async onArrivalTimeChange(e) {
    const previousArrivalTime = this.data.arrivalTime
    const arrivalTime = e.detail.value
    this.setData({ arrivalTime })
    if (this.data.readOnly) {
      try {
        await visitApi.update(this.data.visit.id, { arrival_time: arrivalTime || null })
        this.setData({ visit: { ...this.data.visit, arrival_time: arrivalTime } })
        wx.showToast({ title: '到店时间已更新' })
      } catch (err) {
        this.setData({ arrivalTime: previousArrivalTime })
      }
    }
  },

  // 搜索选择弹窗
  onPickerOpen(e) {
    const field = e.currentTarget.dataset.field
    if (this.data.readOnly && (field === 'customer' || field === 'referrerHandler')) return
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
      this.setData({ customerId: id, nickname: nickname })
    } else if (field === 'referrerHandler') {
      this.setData({ referrerHandler: nickname, referrerHandlerId: id })
    }
    this.setData({ showPicker: false, pickerField: '', pickerKeyword: '' })
  },

  onPickerClear(e) {
    const field = e.currentTarget.dataset.field
    if (field === 'customer') {
      this.setData({ customerId: '', nickname: '' })
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
      await visitApi.update(this.data.visit.id, {
        is_leader: this.data.isLeader,
        arrived: this.data.arrived,
        arrival_time: this.data.arrivalTime || null,
        ...(this.data.readOnly ? {} : {
          customer_id: this.data.customerId,
          visit_date: this.data.visitDate,
          visit_time: this.data.visitTime,
          referrer_handler: this.data.referrerHandler,
          referrer_handler_id: this.data.referrerHandlerId || '',
        }),
      })
      wx.showToast({ title: '已保存' })
      wx.navigateBack()
    } catch (e) {
      this.setData({ saving: false })
      wx.showModal({
        title: '保存失败',
        content: '是否重试？',
        success: (res) => { if (res.confirm) this.onSubmit() },
      })
      return
    }
    this.setData({ saving: false })
  },
})
