const {
  customerApi,
  accountApi,
  membershipCardApi,
  groupCaseApi,
  emotionalReleaseApi,
  ohCardReadingApi,
  energyKnotApi,
  internalCourseApi,
  otherProjectApi,
} = require('../../utils/api')

const TYPE_NAMES = {
  membership_card: '会员卡',
  group_case: '觉醒游戏',
  emotional_release: '情绪释放',
  oh_card_reading: 'OH卡诊断',
  energy_knot: '能量结',
  internal_course: '内部课程',
  other: '其他项目',
}

const TYPE_APIS = {
  membership_card: membershipCardApi,
  group_case: groupCaseApi,
  emotional_release: emotionalReleaseApi,
  oh_card_reading: ohCardReadingApi,
  energy_knot: energyKnotApi,
  internal_course: internalCourseApi,
  other: otherProjectApi,
}

const MEMBERSHIP_CARD_TYPES = {
  '次卡': { price: 198, count: 1, unlimited: false, duration: '1年' },
  '体验会员': { price: 398, count: 4, unlimited: false, duration: '1年' },
  '月卡': { price: 1999, count: null, unlimited: true, duration: '1个月' },
  '12次卡': { price: 1800, count: 12, unlimited: false, duration: '1年' },
  '3月卡': { price: 3999, count: null, unlimited: true, duration: '3个月' },
  '30次卡': { price: 3999, count: 30, unlimited: false, duration: '1年' },
  '45次卡': { price: 5999, count: 45, unlimited: false, duration: '1年' },
  '半年卡': { price: 7999, count: null, unlimited: true, duration: '6个月' },
  '年卡': { price: 12800, count: null, unlimited: true, duration: '1年' },
}

const COURSE_TYPES = {
  '疗愈师课程：自爱力构建': 20000,
  '商业框架陪跑：自觉力提升': 36800,
  '落地赋能班：自洽力整合': 58000,
}

const today = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

Page({
  data: {
    projectType: '',
    typeName: '',
    isEdit: false,
    editId: '',
    saving: false,

    // 客户
    customerId: '',
    customerName: '',

    // 会员卡
    cardType: '',
    price: '',
    effectiveDate: '',
    durationType: 'month',
    durationValue: '',
    remainingCount: '',
    unlimited: false,

    // 觉醒游戏等
    purchaseCount: '',
    amount: '',

    // 内部课程
    courseType: '',

    // 其他项目
    projectName: '',
    fee: '',

    // 成交人
    closerId: '',
    closerName: '',
    dealDate: '',

    // picker
    showPicker: false,
    pickerField: '',
    pickerTitle: '',
    pickerKeyword: '',
    pickerList: [],
    allCustomers: [],
    allAccounts: [],
  },

  onLoad(options) {
    const type = options.type || 'membership_card'
    const isEdit = !!options.id
    this.setData({
      projectType: type,
      typeName: TYPE_NAMES[type] || type,
      isEdit,
      editId: options.id || '',
      dealDate: today(),
    })

    if (isEdit) {
      wx.setNavigationBarTitle({ title: '编辑' + TYPE_NAMES[type] })
      this.loadDetail(options.id, type)
    } else {
      wx.setNavigationBarTitle({ title: '新增' + TYPE_NAMES[type] })
    }
  },

  async loadDetail(id, type) {
    const api = TYPE_APIS[type]
    if (!api) return
    try {
      const item = await api.get(id)
      if (!item) {
        wx.showToast({ title: '项目不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1000)
        return
      }
      this.populateFromItem(item, type)
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  populateFromItem(item, type) {
    const base = {
      customerId: item.customer_id || '',
      customerName: item.nickname || '',
      closerId: item.closer_id || '',
      closerName: item.closer_name || '',
      dealDate: item.deal_date || today(),
    }

    switch (type) {
      case 'membership_card':
        Object.assign(base, {
          cardType: item.card_type || '',
          price: item.price != null ? String(item.price) : '',
          effectiveDate: item.effective_date || '',
          durationType: item.duration_type || 'month',
          durationValue: item.duration_value != null ? String(item.duration_value) : '',
          remainingCount: item.remaining_count != null ? String(item.remaining_count) : '',
          unlimited: item.remaining_count == null,
        })
        break
      case 'group_case':
      case 'emotional_release':
      case 'oh_card_reading':
      case 'energy_knot':
        Object.assign(base, {
          purchaseCount: item.purchase_count != null ? String(item.purchase_count) : '',
          amount: item.amount != null ? String(item.amount) : '',
        })
        break
      case 'internal_course':
        Object.assign(base, {
          courseType: item.course_type || '',
          price: item.price != null ? String(item.price) : '',
          effectiveDate: item.effective_date || '',
        })
        break
      case 'other':
        Object.assign(base, {
          projectName: item.project_name || '',
          fee: item.fee != null ? String(item.fee) : '',
          effectiveDate: item.effective_date || '',
          durationType: item.duration_type || 'month',
          durationValue: item.duration_value != null ? String(item.duration_value) : '',
          remainingCount: item.remaining_count != null ? String(item.remaining_count) : '',
          unlimited: item.remaining_count == null,
        })
        break
    }
    this.setData(base)
  },

  // Picker 弹窗
  async onPickerOpen(e) {
    const field = e.currentTarget.dataset.field
    const titles = { customer: '客户', closer: '成交人', cardType: '会员卡类型', courseType: '课程类型' }
    this.setData({
      showPicker: true,
      pickerField: field,
      pickerTitle: titles[field] || field,
      pickerKeyword: '',
    })

    if (field === 'customer') {
      await this.loadCustomers()
    } else if (field === 'closer') {
      await this.loadAccounts()
    } else if (field === 'cardType') {
      this.setData({
        pickerList: Object.keys(MEMBERSHIP_CARD_TYPES).map(name => ({
          id: name,
          name,
          extra: `¥${MEMBERSHIP_CARD_TYPES[name].price}`,
        })),
      })
    } else if (field === 'courseType') {
      this.setData({
        pickerList: Object.keys(COURSE_TYPES).map(name => ({
          id: name,
          name,
          extra: `¥${COURSE_TYPES[name]}`,
        })),
      })
    }
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerKeyword: '', pickerList: [] })
  },

  onPickerSearch(e) {
    const keyword = e.detail.value.toLowerCase()
    this.setData({ pickerKeyword: keyword })
    const { pickerField, allCustomers, allAccounts } = this.data

    if (pickerField === 'customer') {
      const filtered = allCustomers.filter(c =>
        (c.nickname || '').toLowerCase().includes(keyword)
      )
      this.setData({ pickerList: filtered.slice(0, 50) })
    } else if (pickerField === 'closer') {
      const filtered = allAccounts.filter(a =>
        ((a.owner || a.username || '').toLowerCase().includes(keyword))
      )
      this.setData({
        pickerList: filtered.map(a => ({
          id: a.id,
          nickname: a.owner || a.username,
          extra: a.role || '',
        })).slice(0, 50),
      })
    }
  },

  onPickerSelect(e) {
    const { id, nickname, extra } = e.currentTarget.dataset
    const { pickerField } = this.data

    if (pickerField === 'customer') {
      this.setData({ customerId: id, customerName: nickname })
    } else if (pickerField === 'closer') {
      this.setData({ closerId: id, closerName: nickname })
    } else if (pickerField === 'cardType') {
      const config = MEMBERSHIP_CARD_TYPES[id]
      this.setData({
        cardType: id,
        price: config ? String(config.price) : '',
        remainingCount: config && config.count != null ? String(config.count) : '',
        unlimited: config ? config.unlimited : false,
      })
    } else if (pickerField === 'courseType') {
      const price = COURSE_TYPES[id]
      this.setData({
        courseType: id,
        price: price != null ? String(price) : '',
      })
    }
    this.onPickerClose()
  },

  onPickerClear(e) {
    const field = e.currentTarget.dataset.field
    if (field === 'customer') {
      this.setData({ customerId: '', customerName: '' })
    } else if (field === 'closer') {
      this.setData({ closerId: '', closerName: '' })
    }
  },

  async loadCustomers() {
    try {
      if (!this.data.allCustomers.length) {
        const res = await customerApi.light(200)
        const list = Array.isArray(res) ? res : (res.items || [])
        this.setData({ allCustomers: list })
      }
      const keyword = this.data.pickerKeyword
      const filtered = keyword
        ? this.data.allCustomers.filter(c => (c.nickname || '').toLowerCase().includes(keyword))
        : this.data.allCustomers
      this.setData({ pickerList: filtered.slice(0, 50) })
    } catch {
      this.setData({ pickerList: [] })
    }
  },

  async loadAccounts() {
    try {
      if (!this.data.allAccounts.length) {
        const res = await accountApi.list()
        const list = Array.isArray(res) ? res : (res.items || [])
        this.setData({ allAccounts: list })
      }
      const keyword = this.data.pickerKeyword
      const filtered = keyword
        ? this.data.allAccounts.filter(a => ((a.owner || a.username || '').toLowerCase().includes(keyword)))
        : this.data.allAccounts
      this.setData({
        pickerList: filtered.map(a => ({
          id: a.id,
          nickname: a.owner || a.username,
          extra: a.role || '',
        })).slice(0, 50),
      })
    } catch {
      this.setData({ pickerList: [] })
    }
  },

  // 输入事件
  onPriceInput(e) { this.setData({ price: e.detail.value }) },
  onAmountInput(e) { this.setData({ amount: e.detail.value }) },
  onPurchaseCountInput(e) { this.setData({ purchaseCount: e.detail.value }) },
  onEffectiveDateChange(e) { this.setData({ effectiveDate: e.detail.value }) },
  onDealDateChange(e) { this.setData({ dealDate: e.detail.value }) },
  onDurationValueInput(e) { this.setData({ durationValue: e.detail.value }) },
  onRemainingCountInput(e) { this.setData({ remainingCount: e.detail.value, unlimited: false }) },
  onProjectNameInput(e) { this.setData({ projectName: e.detail.value }) },
  onFeeInput(e) { this.setData({ fee: e.detail.value }) },

  onDurationTypeChange(e) {
    this.setData({ durationType: e.currentTarget.dataset.type })
  },

  onToggleUnlimited() {
    this.setData({
      unlimited: !this.data.unlimited,
      remainingCount: this.data.unlimited ? '' : this.data.remainingCount,
    })
  },

  // 提交
  onSubmit() {
    const { projectType, isEdit, editId } = this.data
    const data = this.buildSubmitData()
    if (!data) return

    this.setData({ saving: true })
    const api = TYPE_APIS[projectType]
    const action = isEdit ? api.update(editId, data) : api.create(data)

    action.then(() => {
      wx.showToast({ title: isEdit ? '已更新' : '已创建', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    }).catch(err => {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    }).finally(() => {
      this.setData({ saving: false })
    })
  },

  buildSubmitData() {
    const { projectType, customerId, customerName, closerId, closerName, dealDate } = this.data

    if (!customerId) {
      wx.showToast({ title: '请选择客户', icon: 'none' })
      return null
    }

    const base = {
      customer_id: customerId,
      nickname: customerName || '',
      closer_id: closerId || undefined,
      closer_name: closerName || undefined,
      deal_date: dealDate || undefined,
    }

    switch (projectType) {
      case 'membership_card': {
        const { cardType, price, effectiveDate, durationType, durationValue, remainingCount, unlimited, isEdit } = this.data
        if (!cardType) { wx.showToast({ title: '请选择会员卡类型', icon: 'none' }); return null }
        if (!effectiveDate) { wx.showToast({ title: '请选择生效日期', icon: 'none' }); return null }
        return Object.assign({}, base, {
          card_type: cardType,
          price: price ? Number(price) : 0,
          effective_date: effectiveDate,
          duration_type: durationValue ? durationType : undefined,
          duration_value: durationValue ? Number(durationValue) : undefined,
        }, isEdit ? {} : { remaining_count: unlimited ? null : (remainingCount ? Number(remainingCount) : 1) })
      }
      case 'group_case':
      case 'emotional_release':
      case 'oh_card_reading':
      case 'energy_knot': {
        const { purchaseCount, amount, isEdit } = this.data
        if (!amount) { wx.showToast({ title: '请填写付费金额', icon: 'none' }); return null }
        return Object.assign({}, base, {
          amount: Number(amount),
        }, isEdit ? {} : { purchase_count: purchaseCount ? Number(purchaseCount) : 1 })
      }
      case 'internal_course': {
        const { courseType, price, effectiveDate } = this.data
        if (!courseType) { wx.showToast({ title: '请选择课程类型', icon: 'none' }); return null }
        if (!effectiveDate) { wx.showToast({ title: '请选择生效日期', icon: 'none' }); return null }
        return Object.assign({}, base, {
          course_type: courseType,
          price: price ? Number(price) : 0,
          effective_date: effectiveDate,
        })
      }
      case 'other': {
        const { projectName, fee, effectiveDate, durationType, durationValue, remainingCount, unlimited, isEdit } = this.data
        if (!projectName) { wx.showToast({ title: '请填写项目名称', icon: 'none' }); return null }
        if (!effectiveDate) { wx.showToast({ title: '请选择生效日期', icon: 'none' }); return null }
        return Object.assign({}, base, {
          project_name: projectName,
          fee: fee ? Number(fee) : 0,
          effective_date: effectiveDate,
          duration_type: durationValue ? durationType : undefined,
          duration_value: durationValue ? Number(durationValue) : undefined,
        }, isEdit ? {} : { remaining_count: unlimited ? null : (remainingCount ? Number(remainingCount) : null) })
      }
      default:
        return base
    }
  },

  onBack() {
    wx.navigateBack()
  },
})
