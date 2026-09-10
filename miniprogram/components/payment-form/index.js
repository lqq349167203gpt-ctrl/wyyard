const { paymentApi, customerApi, organizationApi } = require('../../utils/api')

const CARD_TYPES = [
  { key: '次卡', label: '次卡', price: 198, count: 1, duration_type: 'month', duration_value: 1 },
  { key: '体验会员', label: '体验会员', price: 398, count: 4, duration_type: 'month', duration_value: 1 },
  { key: '月卡', label: '月卡', price: 1999, count: null, duration_type: 'month', duration_value: 1 },
  { key: '12次卡', label: '12次卡', price: 1800, count: 12, duration_type: 'month', duration_value: 12 },
  { key: '3月卡', label: '3月卡', price: 3999, count: null, duration_type: 'month', duration_value: 3 },
  { key: '30次卡', label: '30次卡', price: 3999, count: 30, duration_type: 'month', duration_value: 12 },
  { key: '45次卡', label: '45次卡', price: 5999, count: 45, duration_type: 'month', duration_value: 12 },
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

const PAYMENT_METHODS = [
  { key: '支付宝', label: '支付宝' },
  { key: '微信', label: '微信' },
  { key: '其他', label: '其他' },
]

const DIAGNOSIS_DURATIONS = [
  { value: 1, label: '0.5小时' },
  { value: 2, label: '1小时' },
  { value: 3, label: '1.5小时' },
  { value: 4, label: '2小时' },
  { value: 5, label: '2.5小时' },
  { value: 6, label: '3小时' },
]

function today() {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const dd = d.getDate()
  return `${y}-${m < 10 ? '0' + m : m}-${dd < 10 ? '0' + dd : dd}`
}

function formatMoney(value) {
  const amount = Number(value) || 0
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, '')
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function addMonthsClamped(date, months) {
  const sourceDay = date.getDate()
  const targetMonth = date.getMonth() + months
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate()
  return new Date(targetYear, normalizedMonth, Math.min(sourceDay, lastDay))
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calculateExpiryDate(effectiveDate, durationType, durationValue) {
  const value = parseInt(durationValue)
  if (!effectiveDate || !durationType || !Number.isFinite(value) || value <= 0) return ''
  const parts = String(effectiveDate).slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return ''
  let expiry = new Date(parts[0], parts[1] - 1, parts[2])
  if (durationType === 'month') {
    expiry = addMonthsClamped(expiry, value)
    expiry.setDate(expiry.getDate() - 1)
  } else if (durationType === 'day') {
    expiry.setDate(expiry.getDate() + value - 1)
  } else {
    return ''
  }
  return formatLocalDate(expiry)
}

function getValidityDetails(type, formData) {
  let durationType = formData.duration_type || ''
  let durationValue = formData.duration_value

  if (type === 'membership_card' && (!durationType || !durationValue)) {
    const card = CARD_TYPES.find(item => item.key === formData.card_type)
    if (card) {
      durationType = card.duration_type
      durationValue = card.duration_value
    }
  } else if (type === 'internal_course') {
    const course = COURSE_TYPES.find(item => item.key === formData.course_type)
    if (course) {
      durationType = course.duration_type
      durationValue = course.duration_value
    }
  } else if (type === 'offline_course') {
    durationType = formData.validity_unit || 'month'
    durationValue = formData.validity_value || 1
  }

  const numericValue = parseInt(durationValue)
  if (!durationType || !Number.isFinite(numericValue) || numericValue <= 0) {
    return { label: '-', expiryDate: '-' }
  }
  const unit = durationType === 'month' ? '个月' : '天'
  return {
    label: `${numericValue}${unit}`,
    expiryDate: calculateExpiryDate(formData.effective_date, durationType, numericValue) || '-',
  }
}

Component({
  properties: {
    type: { type: String, value: '' },
    isEdit: { type: Boolean, value: false },
    editData: { type: Object, value: null },
    hideBtn: { type: Boolean, value: false },
    presetCustomer: { type: Object, value: null },
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
    hidePaymentDetails: true,
    formData: {},
    cardTypes: CARD_TYPES,
    cardTypeIndex: -1,
    courseTypes: COURSE_TYPES,
    courseTypeIndex: -1,
    durationTypes: DURATION_TYPES,
    durationTypeIndex: -1,
    paymentMethods: PAYMENT_METHODS,
    paymentMethodIndex: -1,
    diagnosisDurations: DIAGNOSIS_DURATIONS,
    diagnosisDurationIndex: 0,  // 默认0.5小时
    diagnosisTeachers: [],
    diagnosisTeacherIndex: -1,
    submitting: false,
    confirmVisible: false,
    confirmRows: [],
    allCustomers: [],
    organizations: [],
    orgIndex: 0,
    coarseCourseOrganizations: [],
    coarseCourseOrganizationIndex: -1,
    coarseCourses: [],
    coarseCourseIndex: -1,
    coarseOptionsLoading: false,
  },

  observers: {
    'editData, isEdit, organizations': function(editData, isEdit, organizations) {
      if (isEdit && editData && organizations.length > 0) {
        this._populateEditData(editData)
      }
    },
    'type': function(type) {
      this._applyTypeDefaults(type)
    },
    'presetCustomer': function(customer) {
      if (customer && customer.id) {
        this.setData({
          selectedCustomer: { id: customer.id, nickname: customer.nickname || '' },
          'formData.customer_id': customer.id,
        })
      }
    },
  },

  lifetimes: {
    attached() {
      this._applyTypeDefaults(this.data.type)
      if (this.data.presetCustomer && this.data.presetCustomer.id) {
        this.setData({
          selectedCustomer: {
            id: this.data.presetCustomer.id,
            nickname: this.data.presetCustomer.nickname || '',
          },
          'formData.customer_id': this.data.presetCustomer.id,
        })
      }
      this._loadCustomers()
      this._loadOrganizations()
    },
  },

  methods: {
    _applyTypeDefaults(type) {
      if (!type || this.data.isEdit || this._defaultTypeInitialized === type) return
      this._defaultTypeInitialized = type
      const initData = Object.assign({}, this.data.formData || {})
      if (!initData.deal_date) initData.deal_date = today()
      if (type === 'oh_card_reading') {
        if (initData.amount === undefined || initData.amount === '') initData.amount = '298'
        if (!initData.diagnosis_duration) initData.diagnosis_duration = 1
      } else if (type === 'tea_seat_fee') {
        if (!initData.quantity) initData.quantity = '1'
        if (initData.amount === undefined || initData.amount === '') initData.amount = '68'
      } else if (type === 'offline_course') {
        if (!initData.effective_date) initData.effective_date = today()
        if (!initData.validity_value) initData.validity_value = '1'
      } else if (!initData.effective_date) {
        initData.effective_date = today()
      }
      const updates = { formData: initData }
      if (type === 'group_case' || type === 'emotional_release' || type === 'energy_knot') {
        if (!initData.duration_type) initData.duration_type = 'day'
        const dtIdx = DURATION_TYPES.findIndex(dt => dt.key === initData.duration_type)
        if (dtIdx >= 0) updates.durationTypeIndex = dtIdx
      }
      this.setData(updates)
    },

    _getFeeAmount() {
      const { type, formData } = this.data
      const field = type === 'other'
        ? 'fee'
        : (type === 'membership_card' || type === 'internal_course' ? 'price' : 'amount')
      return parseFloat(formData[field]) || 0
    },

    _buildConfirmRows() {
      const { type, formData, selectedCustomer, closers, organizations, orgIndex } = this.data
      if (type === 'coarse_door_card') {
        const settlementOrganization = organizations[orgIndex]
        const courseOrganization = this.data.coarseCourseOrganizations[this.data.coarseCourseOrganizationIndex]
        const course = this.data.coarseCourses[this.data.coarseCourseIndex]
        return [
          { label: '成交日期', value: formData.deal_date || '-' },
          { label: '用户', value: selectedCustomer ? selectedCustomer.nickname : '-' },
          { label: '课程所属', value: courseOrganization ? courseOrganization.name : '-' },
          { label: '所扣课程', value: course ? course._label : '-' },
          { label: '抵扣次数', value: course ? `${course.deduction_count}次` : '-' },
          { label: '成交归属', value: settlementOrganization ? settlementOrganization.name : '-' },
          { label: '成交人', value: closers.map(c => c.nickname).join('、') || '-' },
          { label: '备注', value: formData.notes || '-' },
        ]
      }
      const hidePaymentDetails = true
      const rows = [
        { label: '成交日期', value: formData.deal_date || '-' },
        { label: '用户', value: selectedCustomer ? selectedCustomer.nickname : '-' },
      ]
      let amountRow = { label: '付费金额', value: '¥' + formatMoney(this._getFeeAmount()) }
      if (type === 'membership_card') {
        rows.push({ label: '生效日期', value: formData.effective_date || '-' })
        rows.push({ label: '会员卡', value: formData.card_type || '-' })
        amountRow = { label: '费用金额', value: '¥' + formatMoney(formData.price) }
      } else if (type === 'internal_course') {
        rows.push({ label: '生效日期', value: formData.effective_date || '-' })
        rows.push({ label: '课程类型', value: formData.course_type || '-' })
        amountRow = { label: '付费金额', value: '¥' + formatMoney(formData.price) }
      } else if (type === 'other') {
        rows.push({ label: '项目名称', value: formData.project_name || '-' })
        rows.push({ label: '生效日期', value: formData.effective_date || '-' })
        amountRow = { label: '费用', value: '¥' + formatMoney(formData.fee) }
      } else if (type === 'oh_card_reading') {
        const teacher = this.data.diagnosisTeachers[this.data.diagnosisTeacherIndex]
        rows.push({ label: '诊断老师', value: teacher ? teacher.nickname : '-' })
        rows.push({ label: '诊断时长', value: ((Number(formData.diagnosis_duration) || 1) * 0.5) + '小时' })
        amountRow = { label: '付费金额', value: '¥' + formatMoney(formData.amount) }
      } else if (type === 'tea_seat_fee') {
        rows.push({ label: '数量', value: (formData.quantity || '1') + ' 位' })
        amountRow = { label: '付费金额', value: '¥' + formatMoney(formData.amount) }
      } else if (type === 'offline_course') {
        rows.push({ label: '生效日期', value: formData.effective_date || '-' })
        amountRow = { label: '付费金额', value: '¥' + formatMoney(formData.amount) }
      } else {
        rows.push({ label: type === 'energy_knot' ? '购买部位' : '购买场次', value: (formData.purchase_count || '0') + (type === 'energy_knot' ? ' 个' : ' 次') })
        rows.push({ label: '生效日期', value: formData.effective_date || '-' })
        amountRow = { label: '付费金额', value: '¥' + formatMoney(formData.amount) }
      }
      const validity = getValidityDetails(type, formData)
      rows.push({ label: '有效期', value: validity.label })
      rows.push({ label: '结束日期', value: validity.expiryDate })
      if (!hidePaymentDetails) rows.push(amountRow)
      const organization = organizations[orgIndex]
      rows.push({ label: '成交归属', value: organization ? organization.name : '-' })
      rows.push({ label: '成交人', value: closers.map(c => c.nickname).join('、') || '-' })
      if (!hidePaymentDetails) {
        rows.push({ label: '成交人合计', value: '¥' + formatMoney(closers.reduce((sum, closer) => sum + (Number(closer.amount) || 0), 0)) })
        rows.push({ label: '支付方式', value: formData.payment_method || '-' })
      }
      rows.push({ label: '备注', value: formData.notes || '-' })
      return rows
    },

    _loadCustomers() {
      customerApi.light(1000).then(res => {
        const customers = res || []
        this.setData({ allCustomers: customers })
        this._filterDiagnosisTeachers(customers)
      }).catch(() => {})
    },

    _filterDiagnosisTeachers(customers) {
      const teachers = (customers || this.data.allCustomers)
        .filter(c => c.positions && c.positions.indexOf('课程老师') !== -1)
        .sort((a, b) => (a.position_sort_orders?.['课程老师'] ?? 9999) - (b.position_sort_orders?.['课程老师'] ?? 9999))
      this.setData({ diagnosisTeachers: teachers })
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
      if (this.data.type === 'coarse_door_card') {
        const customer = this.data.presetCustomer || this.data.selectedCustomer
        if (customer && customer.id) this._loadCoarseDoorOptions(customer.id)
      }
    },

    _loadCoarseDoorOptions(customerId) {
      if (!customerId || this._coarseOptionsCustomerId === customerId) return
      this._coarseOptionsCustomerId = customerId
      this.setData({
        coarseOptionsLoading: true,
        coarseCourseOrganizations: [],
        coarseCourseOrganizationIndex: -1,
        coarseCourses: [],
        coarseCourseIndex: -1,
      })
      paymentApi.deductions.coarseDoorOptions(customerId).then(result => {
        const courseOrganizations = result.course_organizations || result.organizations || []
        const courses = (result.courses || []).map(item => Object.assign({}, item, {
          _label: `${item.date} ${item.start_time || ''} · ${item.name} · ${item.deduction_count}次`,
        }))
        const courseOrgIndex = courseOrganizations.length === 1 ? 0 : -1
        this._coarseAllCourses = courses
        this.setData({
          coarseCourseOrganizations: courseOrganizations,
          coarseCourseOrganizationIndex: courseOrgIndex,
          coarseCourses: courseOrgIndex === 0
            ? courses.filter(item => (item.organization_ids || []).includes(courseOrganizations[0].id))
            : [],
          coarseOptionsLoading: false,
        })
      }).catch(error => {
        this._coarseOptionsCustomerId = ''
        this.setData({ coarseOptionsLoading: false })
        wx.showToast({ title: (error && error.message) || '课程加载失败', icon: 'none' })
      })
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
        total_count: d.total_count ?? '',
        category: d.category ?? '',
        project_name: d.project_name ?? '',
        card_type: d.card_type ?? '',
        course_type: d.course_type ?? '',
        payment_method: d.payment_method ?? '',
        notes: d.notes ?? '',
        diagnosis_duration: d.diagnosis_duration ?? 1,
        quantity: d.quantity ?? '1',
      }
      const type = this.data.type
      const hidePaymentDetails = true
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
      // session 类型: 从 effective_date + expiry_date 反推 duration_value/type
      const isSession = type === 'group_case' || type === 'emotional_release' || type === 'energy_knot'
      if (isSession && d.effective_date && d.expiry_date && !fd.duration_type) {
        const eff = new Date(d.effective_date.slice(0, 10))
        const exp = new Date(d.expiry_date.slice(0, 10))
        const diffDays = Math.round((exp.getTime() - eff.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > 0 && diffDays % 30 === 0) {
          fd.duration_value = String(diffDays / 30)
          fd.duration_type = 'month'
          const idx = DURATION_TYPES.findIndex(dt => dt.key === 'month')
          if (idx >= 0) this.setData({ durationTypeIndex: idx })
        } else if (diffDays > 0) {
          fd.duration_value = String(diffDays)
          fd.duration_type = 'day'
          const idx = DURATION_TYPES.findIndex(dt => dt.key === 'day')
          if (idx >= 0) this.setData({ durationTypeIndex: idx })
        }
      }
      if (fd.payment_method) {
        const idx = PAYMENT_METHODS.findIndex(method => method.key === fd.payment_method)
        if (idx >= 0) this.setData({ paymentMethodIndex: idx })
      }
      if (type === 'oh_card_reading' && fd.diagnosis_duration) {
        const idx = DIAGNOSIS_DURATIONS.findIndex(dd => dd.value === fd.diagnosis_duration)
        if (idx >= 0) this.setData({ diagnosisDurationIndex: idx })
      }
      if (type === 'oh_card_reading' && fd.diagnosis_teacher) {
        const teachers = this.data.diagnosisTeachers
        const tIdx = teachers.findIndex(t => t.nickname === fd.diagnosis_teacher)
        if (tIdx >= 0) this.setData({ diagnosisTeacherIndex: tIdx })
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
        hidePaymentDetails,
      })
    },

    onPickerOpen(e) {
      const field = e.currentTarget.dataset.field
      if (field === 'customer' && this.data.presetCustomer && this.data.presetCustomer.id) return
      this.setData({
        showPicker: true,
        pickerTitle: field === 'customer' ? '用户' : '选择成交人',
        pickerField: field,
        pickerKeyword: '',
        pickerList: this.data.allCustomers,
      })
      this.triggerEvent('pickerstate', { open: true })
    },

    onPickerClose() {
      this.setData({ showPicker: false, pickerKeyword: '', pickerList: [] })
      this.triggerEvent('pickerstate', { open: false })
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
        pickerList: this.data.allCustomers.filter(c => (
          (c.nickname || '').toLowerCase().includes(q)
          || (c.name || '').toLowerCase().includes(q)
        )),
      })
    },

    onPickerSelect(e) {
      const { id, nickname } = e.currentTarget.dataset
      const field = this.data.pickerField
      if (field === 'customer') {
        this.setData({ selectedCustomer: { id, nickname }, 'formData.customer_id': id })
        this.onPickerClose()
        if (this.data.type === 'coarse_door_card') this._loadCoarseDoorOptions(id)
      } else {
        // 成交人：添加到数组，不关闭弹窗
        const closers = this.data.closers
        if (closers.some(c => c.id === id)) {
          wx.showToast({ title: '已选择该成交人', icon: 'none' })
          return
        }
        const defaultAmount = this.data.hidePaymentDetails
          ? 0
          : (closers.length === 0 ? this._getFeeAmount() : 0)
        const newClosers = closers.concat([{ id, nickname, amount: defaultAmount }])
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
        list = list.filter(c => (
          (c.nickname || '').toLowerCase().includes(q)
          || (c.name || '').toLowerCase().includes(q)
        ))
      }
      this.setData({ pickerKeyword: keyword, pickerList: list })
    },

    onPickerClear(e) {
      const field = e.currentTarget.dataset.field
      if (field === 'customer') {
        if (this.data.presetCustomer && this.data.presetCustomer.id) return
        this._coarseOptionsCustomerId = ''
        this._coarseAllCourses = []
        this.setData({
          selectedCustomer: null,
          'formData.customer_id': '',
          coarseCourseOrganizations: [],
          coarseCourseOrganizationIndex: -1,
          coarseCourses: [],
          coarseCourseIndex: -1,
        })
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

    onCoarseCourseOrganizationChange(e) {
      const idx = parseInt(e.detail.value)
      const organization = this.data.coarseCourseOrganizations[idx]
      this.setData({
        coarseCourseOrganizationIndex: idx,
        coarseCourses: organization
          ? (this._coarseAllCourses || []).filter(item => (item.organization_ids || []).includes(organization.id))
          : [],
        coarseCourseIndex: -1,
      })
    },

    onCoarseCourseChange(e) {
      this.setData({ coarseCourseIndex: parseInt(e.detail.value) })
    },

    onCardTypeChange(e) {
      const idx = parseInt(e.detail.value)
      const ct = CARD_TYPES[idx]
      const hidePaymentDetails = true
      this.setData({
        cardTypeIndex: idx,
        hidePaymentDetails,
        'formData.card_type': ct.key,
        'formData.price': ct.price,
        'formData.remaining_count': ct.count === null ? '' : ct.count,
        'formData.total_count': ct.count === null ? '' : ct.count,
        'formData.duration_type': ct.duration_type,
        'formData.duration_value': ct.duration_value,
        ...(hidePaymentDetails ? {
          paymentMethodIndex: -1,
          'formData.payment_method': '',
        } : {}),
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

    onPaymentMethodChange(e) {
      const idx = parseInt(e.detail.value)
      this.setData({
        paymentMethodIndex: idx,
        'formData.payment_method': PAYMENT_METHODS[idx].key,
      })
    },

    onDiagnosisDurationChange(e) {
      const idx = parseInt(e.detail.value)
      this.setData({
        diagnosisDurationIndex: idx,
        'formData.diagnosis_duration': DIAGNOSIS_DURATIONS[idx].value,
      })
    },

    onDiagnosisTeacherChange(e) {
      const idx = parseInt(e.detail.value)
      const teachers = this.data.diagnosisTeachers
      this.setData({
        diagnosisTeacherIndex: idx,
        'formData.diagnosis_teacher': teachers[idx] ? teachers[idx].nickname : '',
      })
    },

    _buildPayload() {
      const { formData, selectedCustomer, closers, type, isEdit } = this.data
      const hidePaymentDetails = true
      const payload = Object.assign({}, formData)
      payload.customer_id = selectedCustomer.id
      payload.nickname = selectedCustomer.nickname
      const user = getApp()?.globalData?.currentUser
      if (user) payload.created_by = user.owner ?? user.username ?? ''
      if (closers.length > 0) {
        payload.closer_id = closers[0].id || null
        payload.closer_name = closers[0].nickname || ''
        payload.closers = closers.map(c => ({ id: c.id || '', name: c.nickname || '', amount: 0 }))
      } else {
        payload.closer_id = null
        payload.closer_name = null
        payload.closers = []
      }
      // session 类型: 从 effective_date + duration 计算 expiry_date
      const isSession = type === 'group_case' || type === 'emotional_release' || type === 'energy_knot'
      if (isSession && payload.effective_date && payload.duration_value) {
        payload.expiry_date = calculateExpiryDate(
          payload.effective_date,
          payload.duration_type,
          payload.duration_value,
        ) || undefined
      }
      // 线下课程: 从 effective_date + validity_value 计算 expiry_date（固定月）
      if (type === 'offline_course' && payload.effective_date && payload.validity_value) {
        payload.expiry_date = calculateExpiryDate(
          payload.effective_date,
          payload.validity_unit || 'month',
          payload.validity_value,
        ) || undefined
      }
      if (isEdit) {
        if (type === 'membership_card' || type === 'other') {
          // 卡类型变更时保留 remaining_count（后端允许），否则删除（由流水派生）
          const cardTypeChanged = this.data.editData && payload.card_type !== this.data.editData.card_type
          if (!cardTypeChanged) {
            delete payload.remaining_count
            delete payload.total_count
          }
        } else {
          delete payload.purchase_count
        }
      }
      const floatFields = ['price', 'amount', 'fee']
      const intFields = ['purchase_count', 'duration_value', 'remaining_count', 'total_count', 'diagnosis_duration']
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
      if (hidePaymentDetails) {
        if (type === 'membership_card' || type === 'internal_course') payload.price = 0
        else if (type === 'other') payload.fee = 0
        else payload.amount = 0
        payload.payment_method = null
      }
      // 成交人独立于金额配置；保留空值，确保编辑时也能清空原成交人。
      payload.closer_id = closers[0] ? (closers[0].id || null) : null
      payload.closer_name = closers[0] ? (closers[0].nickname || '') : null
      payload.closers = closers.map(c => ({ id: c.id || '', name: c.nickname || '', amount: 0 }))
      if (isEdit && hidePaymentDetails) {
        ;['price', 'amount', 'fee', 'payment_method'].forEach(key => delete payload[key])
        const previous = (this.data.editData && this.data.editData.closers) || []
        payload.closers = payload.closers.map(closer => {
          const old = previous.find(item => closer.id ? item.id === closer.id : item.name === closer.name)
          return Object.assign({}, closer, { amount: old ? old.amount : 0 })
        })
      }
      return payload
    },

    onSubmit() {
      if (this._submitting) return
      const { selectedCustomer, closers, type, cardTypeIndex, courseTypeIndex, isEdit, formData } = this.data
      const hidePaymentDetails = true
      if (!selectedCustomer) {
        wx.showToast({ title: '请选择用户', icon: 'none' })
        return
      }
      if (type === 'coarse_door_card') {
        if (this.data.orgIndex < 0) {
          wx.showToast({ title: '请选择成交归属', icon: 'none' })
          return
        }
        if (this.data.coarseCourseOrganizationIndex < 0) {
          wx.showToast({ title: '请选择课程所属', icon: 'none' })
          return
        }
        if (this.data.coarseCourseIndex < 0) {
          wx.showToast({ title: '请选择所扣课程', icon: 'none' })
          return
        }
        this.setData({ confirmVisible: true, confirmRows: this._buildConfirmRows() })
        this.triggerEvent('pickerstate', { open: true })
        return
      }
      if (!hidePaymentDetails && closers.length === 0) {
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
      const isSession = type === 'group_case' || type === 'emotional_release' || type === 'energy_knot'
      if (isSession) {
        if (!formData.effective_date) { wx.showToast({ title: '请选择生效日期', icon: 'none' }); return }
        if (!formData.duration_value || !formData.duration_type) { wx.showToast({ title: '请填写有效期', icon: 'none' }); return }
      }
      const fee = this._getFeeAmount()
      const closerTotal = closers.reduce((sum, closer) => sum + (Number(closer.amount) || 0), 0)
      if (!hidePaymentDetails && Math.abs(closerTotal - fee) > 0.01) {
        wx.showToast({ title: '成交人总金额必须与费用金额一致', icon: 'none' })
        return
      }
      this.setData({ confirmVisible: true, confirmRows: this._buildConfirmRows() })
      this.triggerEvent('pickerstate', { open: true })
    },

    onConfirmClose() {
      if (this.data.submitting) return
      this.setData({ confirmVisible: false })
      this.triggerEvent('pickerstate', { open: false })
    },

    onConfirmSubmit() {
      if (this._submitting) return
      this.setData({ confirmVisible: false })
      this.triggerEvent('pickerstate', { open: false })
      this._doSubmit()
    },

    stopPropagation() {},

    _doSubmit() {
      if (this._submitting) return
      const { type, isEdit } = this.data
      this._submitting = true
      this.setData({ submitting: true })
      let action
      if (type === 'coarse_door_card') {
        const course = this.data.coarseCourses[this.data.coarseCourseIndex]
        const settlementOrganization = this.data.organizations[this.data.orgIndex]
        const courseOrganization = this.data.coarseCourseOrganizations[this.data.coarseCourseOrganizationIndex]
        action = paymentApi.deductions.createCoarseDoorCourse({
          customer_id: this.data.selectedCustomer.id,
          record_type: course.record_type,
          record_id: course.record_id,
          course_organization_id: courseOrganization.id,
          settlement_organization_id: settlementOrganization.id,
          deal_date: this.data.formData.deal_date,
          closers: this.data.closers.map(closer => ({ id: closer.id || '', name: closer.nickname || '', amount: 0 })),
          notes: this.data.formData.notes || '',
        })
      } else {
        const payload = this._buildPayload()
        const api = paymentApi.getByType(type)
        action = isEdit ? api.update(this.data.editData.id, payload) : api.create(payload)
      }
      action.then(() => {
        wx.showToast({ title: type === 'coarse_door_card' ? '抵扣成功' : (isEdit ? '已保存' : '已新增') })
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
