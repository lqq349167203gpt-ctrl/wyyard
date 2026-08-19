const { customerApi, customerTagApi } = require('../../utils/api')

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
  const pages = getCurrentPages()
  const previousPage = pages.length > 1 ? pages[pages.length - 2] : null
  if (previousPage) previousPage._needRefresh = true
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
    age: '',
    service_teacher: '',
    referrer: '',
    referral_date: getTodayDate(),
    referrer_handler: '',
    follow_up_status: '新添加',
    traffic_source: '',
    traffic_source_detail: '',
    needTrafficDetail: false,
    work_status: '',
    work_description: '',
    basic_info: '',
    core_situation: '',
    tags: '',
    other_info: '',
    trafficSources: TRAFFIC_SOURCES,
    followUpStatuses: ['新添加', '沟通中', '已到店', '已成交', '沉默/流失'],
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
    if (options.id) {
      this.setData({ id: options.id, isEdit: true })
      wx.setNavigationBarTitle({ title: '编辑客户' })
      this.loadCustomer(options.id)
    } else {
      this.setData({ referral_date: getTodayDate() })
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
    try {
      const tags = await customerTagApi.list()
      const selectedTags = customerId
        ? await customerTagApi.listForCustomer(customerId)
        : []
      const selectedTagIds = (selectedTags || []).map(tag => tag.id)
      this.setData({
        customerTags: tags || [],
        selectedTagIds,
        selectedTagText: this.buildTagText(tags || [], selectedTagIds),
        tagsLoaded: true,
      })
    } catch (e) {
      this.setData({ tagsLoaded: false })
    } finally {
      this.setData({ tagLoading: false })
    }
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
    try {
      const list = await customerApi.light()
      this.setData({ allCustomers: list })
    } catch (e) {
      console.error('加载客户列表失败:', e)
    }
  },

  async loadCustomer(id) {
    try {
      const customer = await customerApi.detail(id)
      const c = customer.customer || customer
      const ts = c.traffic_source || ''
      this.setData({
        nickname: c.nickname || '',
        name: c.name || '',
        gender: c.gender || '',
        phone: c.phone || '',
        wechat: c.wechat || '',
        age: c.age || '',
        service_teacher: c.service_teacher || '',
        referrer: c.referrer || '',
        referral_date: c.referral_date || '',
        referrer_handler: c.referrer_handler || '',
        follow_up_status: c.follow_up_status || '',
        traffic_source: ts,
        traffic_source_detail: c.traffic_source_detail || '',
        needTrafficDetail: TRAFFIC_NEED_LINK.includes(ts),
        work_status: c.work_status || '',
        work_description: c.work_description || '',
        basic_info: c.basic_info || '',
        core_situation: c.core_situation || '',
        tags: c.tags || '',
        other_info: c.other_info || '',
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
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
      needTrafficDetail: TRAFFIC_NEED_LINK.includes(source),
    })
  },

  onFollowUpStatusChange(e) {
    const statuses = ['新添加', '沟通中', '已到店', '已成交', '沉默/流失']
    this.setData({ follow_up_status: statuses[e.detail.value] })
  },

  onReferralDateChange(e) {
    this.setData({ referral_date: e.detail.value })
  },

  onWorkStatusChange(e) {
    const statuses = ['在职', '离职', '自由职业']
    this.setData({ work_status: statuses[e.detail.value], work_description: '' })
  },

  // 搜索选择弹窗
  onPickerOpen(e) {
    const field = e.currentTarget.dataset.field
    const titleMap = { service_teacher: '服务老师', referrer: '引流人', referrer_handler: '承接人', traffic_source_detail: this.data.traffic_source === '好友推荐' ? '推荐好友' : '所属人' }
    const current = this.data[field] || ''
    this.setData({
      showPicker: true,
      pickerField: field,
      pickerTitle: titleMap[field] || field,
      pickerKeyword: '',
      pickerList: this.data.allCustomers.filter(c => c.nickname !== this.data.nickname),
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
    this.setData({ pickerKeyword: keyword, pickerList: list })
  },

  onPickerSelect(e) {
    const nickname = e.currentTarget.dataset.nickname
    const field = this.data.pickerField
    this.setData({
      [field]: nickname,
      showPicker: false,
      pickerField: '',
      pickerKeyword: '',
    })
  },

  onPickerClear(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: '' })
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
        referrer: this.data.referrer.trim(),
        referral_date: this.data.referral_date,
        referrer_handler: this.data.referrer_handler.trim(),
        follow_up_status: this.data.follow_up_status,
        traffic_source: this.data.traffic_source.trim(),
        traffic_source_detail: this.data.traffic_source_detail.trim(),
        work_status: this.data.work_status,
        work_description: this.data.work_description.trim(),
        basic_info: this.data.basic_info.trim(),
        core_situation: this.data.core_situation.trim(),
        tags: this.data.tags.trim(),
        other_info: this.data.other_info.trim(),
      }

      if (this.data.isEdit) {
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
