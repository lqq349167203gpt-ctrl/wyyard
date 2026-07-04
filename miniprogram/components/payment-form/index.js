const { paymentApi } = require('../../utils/api')

const CARD_TYPES = [
  { key: '次卡', label: '次卡', price: 198, count: 1, duration_type: 'year', duration_value: 1 },
  { key: '体验会员', label: '体验会员', price: 398, count: 4, duration_type: 'year', duration_value: 1 },
  { key: '月卡', label: '月卡', price: 1999, count: null, duration_type: 'month', duration_value: 1 },
  { key: '3月卡', label: '3月卡', price: 3999, count: null, duration_type: 'month', duration_value: 3 },
  { key: '30次卡', label: '30次卡', price: 3999, count: 30, duration_type: 'year', duration_value: 1 },
  { key: '半年卡', label: '半年卡', price: 7999, count: null, duration_type: 'month', duration_value: 6 },
  { key: '年卡', label: '年卡', price: 12800, count: null, duration_type: 'year', duration_value: 1 },
]

const COURSE_TYPES = [
  { key: '疗愈师课程：自爱力构建', label: '疗愈师课程：自爱力构建', price: 20000, duration_type: 'year', duration_value: 1 },
  { key: '商业框架陪跑：自觉力提升', label: '商业框架陪跑：自觉力提升', price: 36800, duration_type: 'month', duration_value: 3 },
  { key: '落地赋能班：自洽力整合', label: '落地赋能班：自洽力整合', price: 58000, duration_type: 'year', duration_value: 2 },
]

const DURATION_TYPES = [
  { key: 'day', label: '天' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
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
  },

  data: {
    searchKeyword: '',
    searchResults: [],
    showResults: false,
    selectedCustomer: null,
    formData: {},
    cardTypes: CARD_TYPES,
    cardTypeIndex: -1,
    courseTypes: COURSE_TYPES,
    courseTypeIndex: -1,
    durationTypes: DURATION_TYPES,
    durationTypeIndex: -1,
    submitting: false,
  },

  observers: {
    'editData, isEdit': function(editData, isEdit) {
      if (isEdit && editData) {
        this._populateEditData(editData)
      }
    },
  },

  lifetimes: {
    attached() {
      if (!this.data.isEdit) {
        this.setData({
          formData: { deal_date: today(), effective_date: today() },
        })
      }
    },
    detached() {
      if (this._searchTimer) clearTimeout(this._searchTimer)
    },
  },

  methods: {
    _populateEditData(d) {
      const fd = {
        customer_id: d.customer_id,
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

      // 匹配 card_type index
      if (type === 'membership_card' && d.card_type) {
        const idx = CARD_TYPES.findIndex(c => c.key === d.card_type)
        if (idx >= 0) {
          fd.price = fd.price ?? CARD_TYPES[idx].price
          this.setData({ cardTypeIndex: idx })
        }
      }

      // 匹配 course_type index
      if (type === 'internal_course' && d.course_type) {
        const idx = COURSE_TYPES.findIndex(c => c.key === d.course_type)
        if (idx >= 0) {
          fd.price = fd.price ?? COURSE_TYPES[idx].price
          this.setData({ courseTypeIndex: idx })
        }
      }

      // 匹配 duration_type index
      if (fd.duration_type) {
        const idx = DURATION_TYPES.findIndex(dt => dt.key === fd.duration_type)
        if (idx >= 0) this.setData({ durationTypeIndex: idx })
      }

      this.setData({
        formData: fd,
        selectedCustomer: d.nickname ? { id: d.customer_id, nickname: d.nickname } : null,
      })
    },

    // ---- 客户搜索 ----

    onSearchInput(e) {
      const keyword = e.detail.value
      this.setData({ searchKeyword: keyword })
      if (keyword.length < 1) {
        this.setData({ searchResults: [], showResults: false })
        return
      }
      this._searchTimer && clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => {
        const type = this.data.type
        const api = paymentApi.getByType(type)
        api.searchCustomers(keyword).then(res => {
          this.setData({ searchResults: res || [], showResults: true })
        }).catch(err => {
          console.error('搜索客户失败:', err)
        })
      }, 300)
    },

    onSearchFocus() {
      if (this.data.searchResults.length > 0) {
        this.setData({ showResults: true })
      }
    },

    onSelectCustomer(e) {
      const customer = e.currentTarget.dataset.customer
      this.setData({
        selectedCustomer: customer,
        searchKeyword: '',
        showResults: false,
        searchResults: [],
        'formData.customer_id': customer.id,
      })
    },

    onClearCustomer() {
      this.setData({
        selectedCustomer: null,
        'formData.customer_id': '',
      })
    },

    // ---- 表单字段 ----

    onFieldInput(e) {
      const field = e.currentTarget.dataset.field
      this.setData({ [`formData.${field}`]: e.detail.value })
    },

    onFieldChange(e) {
      const field = e.currentTarget.dataset.field
      this.setData({ [`formData.${field}`]: e.detail.value })
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
      // 同步 duration_type picker
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

    // ---- 提交 ----

    _buildPayload() {
      const { formData, selectedCustomer, type, isEdit } = this.data
      const payload = { ...formData }

      // 客户信息
      payload.customer_id = selectedCustomer.id
      payload.nickname = selectedCustomer.nickname

      // 后端只支持 day/month，年转为月（与 PC 端一致）
      if (payload.duration_type === 'year') {
        payload.duration_type = 'month'
        payload.duration_value = (payload.duration_value || 1) * 12
      }

      // 后端限制：编辑时禁止修改特定字段（防止绕过活动扣减恒等式）
      if (isEdit) {
        if (type === 'membership_card') {
          delete payload.remaining_count
        } else if (type === 'other') {
          delete payload.remaining_count
        } else {
          // group_case, emotional_release, oh_card_reading, energy_knot
          delete payload.purchase_count
        }
      }

      // 数字字段统一转换
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

      // 清除剩余空字段
      Object.keys(payload).forEach(k => {
        if (payload[k] === '' || payload[k] === undefined || payload[k] === null) {
          delete payload[k]
        }
      })

      return payload
    },

    onSubmit() {
      if (this._submitting) return
      const { selectedCustomer, type, isEdit } = this.data

      if (!selectedCustomer) {
        wx.showToast({ title: '请选择客户', icon: 'none' })
        return
      }

      const payload = this._buildPayload()
      this._submitting = true
      this.setData({ submitting: true })

      const api = paymentApi.getByType(type)
      const action = isEdit
        ? api.update(this.data.editData.id, payload)
        : api.create(payload)

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
