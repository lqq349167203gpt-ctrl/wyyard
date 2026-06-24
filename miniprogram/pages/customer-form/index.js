const { customerApi } = require('../../utils/api')

const TRAFFIC_SOURCES = ['小红书', '抖音', '公众号', '视频号', '朋友圈', '美团', '大众点评', '好友推荐']
const TRAFFIC_NEED_LINK = ['小红书', '抖音', '公众号', '视频号']

Page({
  data: {
    id: '',
    isEdit: false,
    saving: false,
    nickname: '',
    name: '',
    gender: '',
    phone: '',
    wechat: '',
    age: '',
    service_teacher: '',
    referrer: '',
    referrer_handler: '',
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
    // 搜索选择弹窗
    allCustomers: [],
    showPicker: false,
    pickerField: '',
    pickerTitle: '',
    pickerKeyword: '',
    pickerList: [],
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id, isEdit: true })
      wx.setNavigationBarTitle({ title: '编辑客户' })
      this.loadCustomer(options.id)
    } else {
      wx.setNavigationBarTitle({ title: '新增客户' })
    }
    this.loadCustomers()
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
        referrer_handler: c.referrer_handler || '',
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
        referrer_handler: this.data.referrer_handler.trim(),
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
        wx.showToast({ title: '已保存' })
      } else {
        await customerApi.create(data)
        wx.showToast({ title: '已添加' })
      }
      wx.navigateBack()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
