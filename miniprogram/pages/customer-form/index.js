const { customerApi, customerTagApi } = require('../../utils/api')
const { isAreaViewOnly } = require('../../utils/record-ownership')
const { readSource, retrySources } = require('../../utils/source-state')
const { disposeReads } = require('../../utils/read-scope')
const { CUSTOMER_INCOME_FIELDS } = require('../../utils/customer-income')
const { customerReferrers } = require('../../utils/customer-referrers')

const TRAFFIC_SOURCES = ['小红书', '抖音', '公众号', '视频号', '朋友圈', '美团', '大众点评', '好友推荐', '粗门']
const TRAFFIC_NEED_LINK = ['小红书', '抖音', '公众号', '视频号']

function getTodayDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function markPreviousPageForRefresh() {
  // 客户编辑会影响详情页与列表页（栈内所有下层页面），逐层打刷新标记
  const pages = getCurrentPages()
  for (let i = 0; i < pages.length - 1; i++) {
    pages[i]._needRefresh = true
  }
}

Page({
  data: {
    id: '',
    isEdit: false,
    saving: false,
    deleting: false,
    nickname: '',
    name: '',
    gender: '',
    phone: '',
    wechat: '',
    contactPermissions: {
      phone: { view: false, copy: false, edit: false },
      wechat: { view: false, copy: false, edit: false },
    },
    customerAccessPermissions: {
      sensitive_fields: {
        visit_purpose: true,
        trauma_history: true,
        current_block: true,
        work_info: true,
        other_info: true,
      },
    },
    contactDirty: { phone: false, wechat: false },
    revealedContacts: { phone: false, wechat: false },
    age: '',
    service_teacher: '',
    referrer: '',
    referrers: [],
    referral_date: getTodayDate(),
    referrer_handler: '',
    customer_quality: '正常',
    traffic_source: '',
    traffic_source_detail: '',
    traffic_post_name: '',
    needTrafficDetail: false,
    work_status: '',
    work_description: '',
    incomeFields: CUSTOMER_INCOME_FIELDS,
    incomeValues: { income_stability: '', personal_annual_income: '', household_annual_income: '' },
    incomeIndices: {},
    basic_info: '',
    core_situation: '',
    tags: '',
    other_info: '',
    trafficSources: TRAFFIC_SOURCES,
    customerTags: [],
    selectedTagIds: [],
    selectedTagText: '',
    tagPickerItems: [],
    showTagPicker: false,
    tagLoading: false,
    tagsLoaded: false,
    newPrivateTagName: '',
    creatingTag: false,
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
    if (isAreaViewOnly('customers')) {
      wx.showToast({ title: '当前账号仅可浏览客户资料', icon: 'none' })
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/customers/index' }) })
      return
    }
    if (options.id) {
      this.setData({ id: options.id, isEdit: true })
      wx.setNavigationBarTitle({ title: '编辑客户' })
      this.loadCustomer(options.id)
    } else {
      const owner = (getApp().globalData.currentUser || {}).owner || ''
      const assigned = !owner ? {} : options.workspace === 'referral' ? { referrer: owner, referrers: [owner] } : options.workspace === 'sales' ? { service_teacher: owner } : options.workspace === 'handoff' ? { referrer_handler: owner } : {}
      this.setData({ referral_date: getTodayDate(), ...assigned })
      wx.setNavigationBarTitle({ title: '新增客户' })
    }
    this.loadCustomerTags(options.id || '')
    this.loadCustomers()

    // 语音录入预填
    if (options.mode === 'voice') {
      const prefill = getApp().globalData._voicePrefill
      if (prefill) {
        const updates = {}
        const formFields = Object.keys(this.data)
        for (const [key, value] of Object.entries(prefill)) {
          if (value && formFields.includes(key) && typeof value === 'string') {
            updates[key] = value.trim()
          }
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates)
        }
        getApp().globalData._voicePrefill = null
      }
    }
  },

  async loadCustomerTags(customerId) {
    this.setData({ tagLoading: true })
    const loaded = await readSource(this, 'tags', () => Promise.all([customerTagApi.list(), customerId ? customerTagApi.listForCustomer(customerId) : []]), ([tags, selectedTags]) => {
      const selectedTagIds = (selectedTags || []).map(tag => tag.id)
      this.setData({
        customerTags: tags || [],
        selectedTagIds,
        selectedTagText: this.buildTagText(tags || [], selectedTagIds),
        tagsLoaded: true,
      })
    })
    if (!this._readsDisposed) this.setData({ tagsLoaded: loaded, tagLoading: false })
  },

  buildTagText(tags, selectedIds) {
    const selected = new Set(selectedIds || [])
    return (tags || []).filter(tag => selected.has(tag.id)).map(tag => tag.name).join('、')
  },

  async onTagPickerOpen() {
    if (this.data.tagLoading) return
    if (!this.data.tagsLoaded) {
      await this.loadCustomerTags(this.data.id)
      if (!this.data.tagsLoaded) {
        wx.showToast({ title: '标签加载失败，请稍后重试', icon: 'none' })
        return
      }
    }
    const selected = new Set(this.data.selectedTagIds)
    this.setData({
      showTagPicker: true,
      newPrivateTagName: '',
      tagPickerItems: this.data.customerTags.map(tag => Object.assign({}, tag, {
        selected: selected.has(tag.id),
        scopeText: tag.scope === 'private' ? '仅自己可见' : '公共',
      })),
    })
  },

  onTagPickerClose() {
    this.setData({ showTagPicker: false, newPrivateTagName: '', tagPickerItems: [] })
  },

  onTagSelectionChange(e) {
    const selected = new Set(e.detail.value || [])
    this.setData({
      tagPickerItems: this.data.tagPickerItems.map(tag => Object.assign({}, tag, {
        selected: selected.has(tag.id),
      })),
    })
  },

  onPrivateTagNameInput(e) {
    this.setData({ newPrivateTagName: e.detail.value })
  },

  async onCreatePrivateTag() {
    const name = (this.data.newPrivateTagName || '').trim()
    if (!name || this.data.creatingTag) return
    this.setData({ creatingTag: true })
    try {
      const tag = await customerTagApi.createPrivate(name)
      const customerTags = this.data.customerTags.concat([tag])
      const tagPickerItems = this.data.tagPickerItems.concat([Object.assign({}, tag, {
        selected: true,
        scopeText: '仅自己可见',
      })])
      this.setData({ customerTags, tagPickerItems, newPrivateTagName: '' })
    } catch (e) {
      wx.showToast({ title: e.message || '新增标签失败', icon: 'none' })
    } finally {
      this.setData({ creatingTag: false })
    }
  },

  onTagPickerConfirm() {
    const selectedTagIds = this.data.tagPickerItems.filter(tag => tag.selected).map(tag => tag.id)
    this.setData({
      selectedTagIds,
      selectedTagText: this.buildTagText(this.data.customerTags, selectedTagIds),
      showTagPicker: false,
      tagPickerItems: [],
      newPrivateTagName: '',
    })
  },

  async loadCustomers() {
    return readSource(this, 'people', () => customerApi.assignmentOptions(), list => {
      this.setData({ allCustomers: list })
    })
  },

  async loadCustomer(id) {
    return readSource(this, 'customer', () => customerApi.detail(id, undefined, false, '', 'basic'), customer => {
      const c = customer.customer || customer
      const ts = c.traffic_source || ''
      const incomeValues = {}
      const incomeIndices = {}
      CUSTOMER_INCOME_FIELDS.forEach(field => {
        incomeValues[field.key] = c[field.key] || ''
        incomeIndices[field.key] = Math.max(0, field.values.indexOf(c[field.key]) + 1)
      })
      this.setData({
        customerLoaded: true,
        nickname: c.nickname || '',
        name: c.name || '',
        gender: c.gender || '',
        phone: c.phone || '',
        wechat: c.wechat || '',
        contactPermissions: c.contact_permissions || this.data.contactPermissions,
        customerAccessPermissions: c.customer_access_permissions || this.data.customerAccessPermissions,
        contactDirty: { phone: false, wechat: false },
        revealedContacts: { phone: false, wechat: false },
        age: c.age || '',
        service_teacher: c.service_teacher || '',
        referrer: c.referrer || '',
        referrers: customerReferrers(c),
        referral_date: c.referral_date || '',
        referrer_handler: c.referrer_handler || '',
        customer_quality: c.customer_quality || '正常',
        traffic_source: ts,
        traffic_source_detail: c.traffic_source_detail || '',
        traffic_post_name: c.traffic_post_name || '',
        needTrafficDetail: TRAFFIC_NEED_LINK.includes(ts),
        work_status: c.work_status || '',
        work_description: c.work_description || '',
        incomeValues,
        incomeIndices,
        basic_info: c.basic_info || '',
        core_situation: c.core_situation || '',
        tags: c.tags || '',
        other_info: c.other_info || '',
      })
    })
  },

  onUnload() { disposeReads(this) },

  retrySources() { return retrySources(this, { customer: () => this.loadCustomer(this.data.id), tags: () => this.loadCustomerTags(this.data.id), people: () => this.loadCustomers() }) },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const updates = { [field]: e.detail.value }
    if (field === 'phone' || field === 'wechat') {
      updates[`contactDirty.${field}`] = true
    }
    this.setData(updates)
  },

  async onContactView(e) {
    const field = e.currentTarget.dataset.field
    try {
      const result = await customerApi.accessContact(this.data.id, field, 'view')
      this.setData({
        [field]: result.value,
        [`revealedContacts.${field}`]: true,
      })
    } catch (error) {
      wx.showToast({ title: error.message || '查看失败', icon: 'none' })
    }
  },

  async onContactCopy(e) {
    const field = e.currentTarget.dataset.field
    try {
      const result = await customerApi.accessContact(this.data.id, field, 'copy')
      await new Promise((resolve, reject) => {
        wx.setClipboardData({ data: result.value, success: resolve, fail: reject })
      })
    } catch (error) {
      wx.showToast({ title: error.message || '复制失败', icon: 'none' })
    }
  },

  onOpenEditor(e) {
    const { field, label } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/text-editor/index?field=${encodeURIComponent(field)}&label=${encodeURIComponent(label)}` })
  },

  onGenderChange(e) {
    const genders = ['男', '女', '其他']
    this.setData({ gender: genders[e.detail.value] })
  },

  onTrafficSourceChange(e) {
    const source = TRAFFIC_SOURCES[e.detail.value]
    this.setData({
      traffic_source: source,
      traffic_source_detail: '',
      traffic_post_name: '',
      needTrafficDetail: TRAFFIC_NEED_LINK.includes(source),
    })
  },

  onQualityChange(e) {
    this.setData({ customer_quality: ['正常', '忽视'][Number(e.detail.value)] || '正常' })
  },

  onReferralDateChange(e) {
    this.setData({ referral_date: e.detail.value })
  },

  onWorkStatusChange(e) {
    const statuses = ['在职', '离职', '自由职业', '全职带孩子']
    this.setData({ work_status: statuses[e.detail.value], work_description: '' })
  },

  onIncomeChange(e) {
    const field = CUSTOMER_INCOME_FIELDS.find(item => item.key === e.currentTarget.dataset.field)
    if (!field) return
    const options = ['', ...field.values]
    this.setData({ [`incomeValues.${field.key}`]: options[Number(e.detail.value)] || '', [`incomeIndices.${field.key}`]: Number(e.detail.value) })
  },

  // 搜索选择弹窗
  onPickerOpen(e) {
    const field = e.currentTarget.dataset.field
    const titleMap = { service_teacher: 'Sales', referrer: '引流人', referrer_handler: '承接人', traffic_source_detail: this.data.traffic_source === '好友推荐' ? '推荐好友' : '所属人' }
    const current = this.data[field] || ''
    this.setData({
      showPicker: true,
      pickerField: field,
      pickerTitle: titleMap[field] || field,
      pickerKeyword: '',
      pickerList: this.data.allCustomers.filter(c => c.nickname !== this.data.nickname).map(c => ({ ...c, selected: field === 'referrer' && this.data.referrers.includes(c.nickname) })),
    })
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerField: '', pickerKeyword: '' })
  },

  onPickerSearch(e) {
    const keyword = e.detail.value
    const list = this.data.allCustomers.filter(c => {
      if (c.nickname === this.data.nickname) return false
      if (!keyword) return true
      return c.nickname.includes(keyword) || (c.name && c.name.includes(keyword))
    })
    this.setData({ pickerKeyword: keyword, pickerList: list.map(c => ({ ...c, selected: this.data.pickerField === 'referrer' && this.data.referrers.includes(c.nickname) })) })
  },

  onPickerSelect(e) {
    const nickname = e.currentTarget.dataset.nickname
    const field = this.data.pickerField
    if (field === 'referrer') {
      const names = this.data.referrers.includes(nickname) ? this.data.referrers.filter(name => name !== nickname) : this.data.referrers.concat(nickname)
      this.setData({ referrers: names, referrer: names.join('、'), pickerList: this.data.pickerList.map(c => ({ ...c, selected: names.includes(c.nickname) })) })
      return
    }
    this.setData({
      [field]: nickname,
      showPicker: false,
      pickerField: '',
      pickerKeyword: '',
    })
  },

  onPickerClear(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: '', ...(field === 'referrer' ? { referrers: [] } : {}) })
  },

  onRemoveReferrer(e) {
    if (this.data.pickerField !== 'referrer') return
    const nickname = e.currentTarget.dataset.nickname
    const names = this.data.referrers.filter(name => name !== nickname)
    this.setData({ referrers: names, referrer: names.join('、'), pickerList: this.data.pickerList.map(c => ({ ...c, selected: names.includes(c.nickname) })) })
  },

  onDelete() {
    wx.showModal({
      title: '确认停用',
      content: '停用后客户资料将隐藏，历史关联数据保留，可随时恢复。',
      confirmColor: '#f54a45',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ deleting: true })
        try {
          await customerApi.delete(this.data.id)
          markPreviousPageForRefresh()
          wx.showToast({ title: '已停用' })
          wx.navigateBack()
        } catch (e) {
          wx.showToast({ title: '停用失败', icon: 'none' })
        } finally {
          this.setData({ deleting: false })
        }
      }
    })
  },

  async onSubmit() {
    if (this.data.sourceError || this.data.sourcesLoading) { wx.showToast({ title: '请等待信息加载完成，失败时点击重试', icon: 'none' }); return }
    if (!this.data.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const data = {
        nickname: this.data.nickname.trim(),
        name: this.data.name.trim(),
        gender: this.data.gender,
        phone: this.data.phone.trim(),
        wechat: this.data.wechat.trim(),
        age: this.data.age.trim(),
        service_teacher: this.data.service_teacher.trim(),
        referrers: customerReferrers(this.data.referrers.length ? this.data : { referrer: this.data.referrer }),
        referral_date: this.data.referral_date,
        referrer_handler: this.data.referrer_handler.trim(),
        customer_quality: this.data.customer_quality,
        traffic_source: this.data.traffic_source.trim(),
        traffic_source_detail: this.data.traffic_source_detail.trim(),
        traffic_post_name: this.data.needTrafficDetail ? this.data.traffic_post_name.trim() : '',
        work_status: this.data.work_status,
        work_description: this.data.work_description.trim(),
        ...this.data.incomeValues,
        basic_info: this.data.basic_info.trim(),
        core_situation: this.data.core_situation.trim(),
        tags: this.data.tags.trim(),
        other_info: this.data.other_info.trim(),
      }

      if (this.data.isEdit) {
        const sensitive = this.data.customerAccessPermissions.sensitive_fields || {}
        if (sensitive.visit_purpose === false) delete data.tags
        if (sensitive.trauma_history === false) delete data.basic_info
        if (sensitive.current_block === false) delete data.core_situation
        if (sensitive.work_info === false) {
          delete data.work_status
          delete data.work_description
          CUSTOMER_INCOME_FIELDS.forEach(field => { delete data[field.key] })
        }
        if (sensitive.other_info === false) delete data.other_info
        if (!this.data.contactDirty.phone) delete data.phone
        if (!this.data.contactDirty.wechat) delete data.wechat
        await customerApi.update(this.data.id, data)
        if (this.data.tagsLoaded) {
          await customerTagApi.setForCustomer(this.data.id, this.data.selectedTagIds)
        }
        wx.showToast({ title: '已保存' })
      } else {
        const customer = await customerApi.create(data)
        if (this.data.tagsLoaded && this.data.selectedTagIds.length > 0) {
          await customerTagApi.setForCustomer(customer.id, this.data.selectedTagIds)
        }
        wx.showToast({ title: '已添加' })
      }
      markPreviousPageForRefresh()
      wx.navigateBack()
    } catch (e) {
      const msg = e.message || '保存失败'
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      // 将错误信息传回给语音弹窗
      getApp().globalData._voiceSaveError = msg
    } finally {
      this.setData({ saving: false })
    }
  },
})
