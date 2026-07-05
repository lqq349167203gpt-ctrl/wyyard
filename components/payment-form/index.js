const { paymentApi, customerApi, organizationApi } = require('../../utils/api')

const CARD_TYPES = [
  { key: '次卡', label: '次卡', price: 198, count: 1, duration_type: 'month', duration_value: 12 },
  { key: '体验会员', label: '体验会员', price: 398, count: 4, duration_type: 'month', duration_value: 12 },
  { key: '月卡', label: '月卡', price: 1999, count: null, duration_type: 'month', duration_value: 1 },
  { key: '3月卡', label: '3月卡', price: 3999, count: null, duration_type: 'month', duration_value: 3 },
  { key: '30次卡', label: '30次卡', price: 3999, count: 30, duration_type: 'month', duration_value: 12 },
  { key: '半年卡', label: '半年卡', price: 7999, count: null, duration_type: 'month', duration_value: 6 },
  { key: '年卡', label: '年卡', price: 12800, count: null, duration_type: 'month', duration_value: 12 },
]

const COURSE_TYPES = [
  { key: '疗愈师课程：自爱力构建', label: '疗愈师课程：自爱力构建', price: 20000, duration_type: 'month', duration_value: 12 },
  { key: '商业框架陪跑：自觉力提升', label: '商业框架陪跑：自觉力提升', price: 36800, duration_type: 'month', duration_value: 3 },
  { key: '落地赋能班：自洽力整合', label: '落地赋能班：自洽力整合', price: 58000, duration_type: 'month', duration_value: 24 },
]

const DURATION_TYPES = [
  { key: 'day', label: '天' },
  { key: 'month', label: '月' },
]

function today() {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const dd = d.getDate()
  return `${y}-${m < 10 ? '0' + m : m}-${dd < 10 ? '0' + dd : dd}`
}

Component({
  properties: {
    type: { type: String, value: '' },
    isEdit: { type: Boolean, value: false },
    editData: { type: Object, value: null },
    hideBtn: { type: Boolean, value: false },
  },

  data: {
    showPicker: false,
    pickerTitle: '',
    pickerField: '',
    pickerKeyword: '',
    pickerList: [],
    selectedCustomer: null,
    closers: [],
    closerTotal: 0,
    closerIdMap: {},
    formData: {},
    cardTypes: CARD_TYPES,
    cardTypeIndex: -1,
    courseTypes: COURSE_TYPES,
    courseTypeIndex: -1,
    durationTypes: DURATION_TYPES,
    durationTypeIndex: -1,
    submitting: false,
    allCustomers: [],
    organizations: [],
    orgIndex: 0,
  },

  observers: {
    'editData, isEdit, organizations': function(editData, isEdit, organizations) {
      if (isEdit && editData && organizations.length > 0) {
        this._populateEditData(editData)
      }
    },
  },

  lifetimes: {
    attached() {
      if (!this.data.isEdit) {
        this.setData({ formData: { deal_date: today(), effective_date: today() } })
      }
      this._loadCustomers()
      this._loadOrganizations()
    },
  },

  methods: {
    _loadCustomers() {
      customerApi.light(200).then(res => {
        this.setData({ allCustomers: res || [] })
      }).catch(() => {})
    },

    _loadOrganizations() {
      organizationApi.list().then(res => {
        const orgs = res || []
        const defaultIdx = 0
        const defaultOrgId = orgs.length > 0 ? orgs[0].id : ''
        this.setData({
          organizations: orgs,
          orgIndex: defaultIdx,
          'formData.organization_id': this.data.formData.organization_id || defaultOrgId,
        })
      }).catch(() => {})
    },

    _populateEditData(d) {
      const fd = {
        customer_id: d.customer_id,
        organization_id: d.organization_id ?? '',
        deal_date: d.deal_date ? d.deal_date.slice(0, 10) : today(),
        effective_date: d.effective_date ? d.effective_date.slice(0, 10) : '',
        duration_type: d.duration_type ?? '',
        duration_value: d.duration_value ?? '',
        price: d.price ?? '',
        amount: d.amount ?? '',
        fee: d.fee ?? '',
        purchase_count: d.purchase_count ?? '',
        remaining_count: d.remaining_count ?? '',
        category: d.category ?? '',
        project_name: d.project_name ?? '',
        card_type: d.card_type ?? '',
        course_type: d.course_type ?? '',
      }
      const type = this.data.type
      if (type === 'membership_card' && d.card_type) {
        const idx = CARD_TYPES.findIndex(c => c.key === d.card_type)
        if (idx >= 0) {
          fd.price = fd.price ?? CARD_TYPES[idx].price
          this.setData({ cardTypeIndex: idx })
        }
      }
      if (type === 'internal_course' && d.course_type) {
        const idx = COURSE_TYPES.findIndex(c => c.key === d.course_type)
        if (idx >= 0) {
          fd.price = fd.price ?? COURSE_TYPES[idx].price
          this.setData({ courseTypeIndex: idx })
        }
      }
      if (fd.duration_type) {
        const idx = DURATION_TYPES.findIndex(dt => dt.key === fd.duration_type)
        if (idx >= 0) this.setData({ durationTypeIndex: idx })
      }
      // 匹配组织 index
      if (d.organization_id && this.data.organizations.length > 0) {
        const orgIdx = this.data.organizations.findIndex(o => o.id === d.organization_id)
        if (orgIdx >= 0) this.setData({ orgIndex: orgIdx })
      }
      // 构建成交人数组
      let closers = []
      if (d.closers && d.closers.length > 0) {
        closers = d.closers.map(c => ({ id: c.id || '', nickname: c.name || '', amount: c.amount || 0 }))
      } else if (d.closer_name) {
        closers = [{ id: d.closer_id || '', nickname: d.closer_name, amount: 0 }]
      }
      const closerTotal = closers.reduce((s, c) => s + (c.amount || 0), 0)
      const closerIdMap = {}
      closers.forEach(c => { closerIdMap[c.id] = true })

      this.setData({
        formData: fd,
        selectedCustomer: d.nickname ? { id: d.customer_id, nickname: d.nickname } : null,
        closers,
        closerTotal,
        closerIdMap,
      })
    },

    onPickerOpen(e) {
      const field = e.currentTarget.dataset.field
      this.setData({
        showPicker: true,
        pickerTitle: field === 'customer' ? '用户' : '选择成交人',
        pickerField: field,
        pickerKeyword: '',
        pickerList: this.data.allCustomers,
      })
    },

    onPickerClose() {
      this.setData({ showPicker: false, pickerKeyword: '', pickerList: [] })
    },

    onPickerSearch(e) {
      const keyword = e.detail.value
      this.setData({ pickerKeyword: keyword })
      if (!keyword) {
        this.setData({ pickerList: this.data.allCustomers })
        return
      }
      const q = keyword.toLowerCase()
      this.setData({
        pickerList: this.data.allCustomers.filter(c => c.nickname && c.nickname.toLowerCase().includes(q)),
      })
    },

    onPickerSelect(e) {
      const { id, nickname } = e.currentTarget.dataset
      const field = this.data.pickerField
      if (field === 'customer') {
        this.setData({ selectedCustomer: { id, nickname }, 'formData.customer_id': id })
        this.onPickerClose()
      } else {
        // 成交人：添加到数组，不关闭弹窗
        const closers = this.data.closers
        if (closers.some(c => c.id === id)) {
          wx.showToast({ title: '已选择该成交人', icon: 'none' })
          return
        }
        const newClosers = closers.concat([{ id, nickname, amount: 0 }])
        const closerIdMap = {}
        newClosers.forEach(c => { closerIdMap[c.id] = true })
        this.setData({
          closers: newClosers,
          closerTotal: newClosers.reduce((s, c) => s + (c.amount || 0), 0),
          closerIdMap,
        })
        // 更新列表，排除已选
        this._updateCloserPickerList('')
      }
    },

    _updateCloserPickerList(keyword) {
      let list = this.data.allCustomers
      if (keyword) {
        const q = keyword.toLowerCase()
        list = list.filter(c => c.nickname && c.nickname.toLowerCase().includes(q))
      }
      this.setData({ pickerKeyword: keyword, pickerList: list })
    },

    onPickerClear(e) {
      const field = e.currentTarget.dataset.field
      if (field === 'customer') {
        this.setData({ selectedCustomer: null, 'formData.customer_id': '' })
      }
    },

    onRemoveCloser(e) {
      const id = e.currentTarget.dataset.id
      const closers = this.data.closers.filter(c => c.id !== id)
      const closerIdMap = {}
      closers.forEach(c => { closerIdMap[c.id] = true })
      this.setData({
        closers,
        closerTotal: closers.reduce((s, c) => s + (c.amount || 0), 0),
        closerIdMap,
      })
    },

    onCloserAmountInput(e) {
      const id = e.currentTarget.dataset.id
      const value = e.detail.value
      const closers = this.data.closers.map(function(c) {
        return c.id === id ? Object.assign({}, c, { amount: parseFloat(value) || 0 }) : c
      })
      this.setData({ closers, closerTotal: closers.reduce((s, c) => s + (c.amount || 0), 0) })
    },

    onFieldInput(e) {
      const field = e.currentTarget.dataset.field
      this.setData({ [`formData.${field}`]: e.detail.value })
    },

    onFieldChange(e) {
      const field = e.currentTarget.dataset.field
      this.setData({ [`formData.${field}`]: e.detail.value })
    },

    onOrgChange(e) {
      const idx = parseInt(e.detail.value)
      this.setData({
        orgIndex: idx,
        'formData.organization_id': this.data.organizations[idx].id,
      })
    },

    onCardTypeChange(e) {
      const idx = parseInt(e.detail.value)
      const ct = CARD_TYPES[idx]
      this.setData({
        cardTypeIndex: idx,
        'formData.card_type': ct.key,
        'formData.price': ct.price,
        'formData.remaining_count': ct.count === null ? '' : ct.count,
        'formData.duration_type': ct.duration_type,
        'formData.duration_value': ct.duration_value,
      })
      const dtIdx = DURATION_TYPES.findIndex(dt => dt.key === ct.duration_type)
      if (dtIdx >= 0) this.setData({ durationTypeIndex: dtIdx })
    },

    onCourseTypeChange(e) {
      const idx = parseInt(e.detail.value)
      const ct = COURSE_TYPES[idx]
      this.setData({
        courseTypeIndex: idx,
        'formData.course_type': ct.key,
        'formData.price': ct.price,
        'formData.duration_type': ct.duration_type,
        'formData.duration_value': ct.duration_value,
      })
      const dtIdx = DURATION_TYPES.findIndex(dt => dt.key === ct.duration_type)
      if (dtIdx >= 0) this.setData({ durationTypeIndex: dtIdx })
    },

    onDurationTypeChange(e) {
      const idx = parseInt(e.detail.value)
      this.setData({
        durationTypeIndex: idx,
        'formData.duration_type': DURATION_TYPES[idx].key,
      })
    },

    _buildPayload() {
      const { formData, selectedCustomer, closers, type, isEdit } = this.data
      const payload = Object.assign({}, formData)
      payload.customer_id = selectedCustomer.id
      payload.nickname = selectedCustomer.nickname
      const user = getApp()?.globalData?.currentUser
      if (user) payload.created_by = user.owner ?? user.username ?? ''
      if (closers.length > 0) {
        payload.closer_id = closers[0].id || null
        payload.closer_name = closers[0].nickname || ''
        payload.closers = closers.map(c => ({ id: c.id || '', name: c.nickname || '', amount: c.amount || 0 }))
      }
      if (isEdit) {
        if (type === 'membership_card' || type === 'other') {
          delete payload.remaining_count
        } else {
          delete payload.purchase_count
        }
      }
      const floatFields = ['price', 'amount', 'fee']
      const intFields = ['purchase_count', 'duration_value', 'remaining_count']
      floatFields.forEach(f => {
        if (payload[f] !== '' && payload[f] !== undefined && payload[f] !== null) {
          payload[f] = parseFloat(payload[f])
        }
      })
      intFields.forEach(f => {
        if (payload[f] === '' || payload[f] === undefined || payload[f] === null) {
          delete payload[f]
        } else {
          payload[f] = parseInt(payload[f])
        }
      })
      Object.keys(payload).forEach(k => {
        if (payload[k] === '' || payload[k] === undefined || payload[k] === null) {
          delete payload[k]
        }
      })
      return payload
    },

    onSubmit() {
      if (this._submitting) return
      const { selectedCustomer, closers, type, cardTypeIndex, courseTypeIndex, isEdit } = this.data
      if (!selectedCustomer) {
        wx.showToast({ title: '请选择用户', icon: 'none' })
        return
      }
      if (closers.length === 0) {
        wx.showToast({ title: '请选择成交人', icon: 'none' })
        return
      }
      if (type === 'membership_card' && cardTypeIndex < 0) {
        wx.showToast({ title: '请选择会员卡类型', icon: 'none' })
        return
      }
      if (type === 'internal_course' && courseTypeIndex < 0) {
        wx.showToast({ title: '请选择课程类型', icon: 'none' })
        return
      }
      const { formData, closerTotal } = this.data
      const feeField = type === 'other' ? 'fee' : (type === 'group_case' || type === 'emotional_release' || type === 'oh_card_reading' || type === 'energy_knot') ? 'amount' : 'price'
      const fee = parseFloat(formData[feeField]) || 0
      if (closers.length > 0 && fee > 0 && closerTotal !== fee) {
        wx.showModal({
          title: '金额不一致',
          content: `费用金额 ${fee} 元，成交人总额 ${closerTotal} 元，是否继续提交？`,
          success: (res) => {
            if (res.confirm) this._doSubmit()
          },
        })
        return
      }
      this._doSubmit()
    },

    _doSubmit() {
      if (this._submitting) return
      const { type, isEdit } = this.data
      const payload = this._buildPayload()
      this._submitting = true
      this.setData({ submitting: true })
      const api = paymentApi.getByType(type)
      const action = isEdit ? api.update(this.data.editData.id, payload) : api.create(payload)
      action.then(() => {
        wx.showToast({ title: isEdit ? '已保存' : '已新增' })
        this.triggerEvent('success')
      }).catch(err => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' })
      }).finally(() => {
        this._submitting = false
        this.setData({ submitting: false })
      })
    },
  },
})
