const { communicationRecordApi, customerApi } = require('../../utils/api')

Page({
  data: {
    isEdit: false,
    editId: '',
    canEdit: false,
    canDelete: false,
    saving: false,
    nickname: '',
    content: '',
    showPicker: false,
    pickerKeyword: '',
    pickerList: [],
    allCustomers: [],
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    const isEdit = !!options.id
    this.setData({ isEdit, editId: options.id || '' })
    if (isEdit) {
      wx.setNavigationBarTitle({ title: '编辑沟通记录' })
      this.loadDetail(options.id)
    } else {
      wx.setNavigationBarTitle({ title: '新增沟通记录' })
    }
  },

  async loadDetail(id) {
    try {
      const res = await communicationRecordApi.list()
      const list = Array.isArray(res) ? res : []
      const item = list.find(r => r.id === id)
      if (!item) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1000)
        return
      }
      this.setData({
        nickname: item.customer_nickname || '',
        content: item.content || '',
        canEdit: !!item.can_edit,
        canDelete: !!item.can_delete,
      })
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onClearNickname() {
    this.setData({ nickname: '' })
  },

  // Picker
  async onPickerOpen() {
    this.setData({ showPicker: true, pickerKeyword: '' })
    await this.loadCustomers()
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerKeyword: '' })
  },

  onPickerSearch(e) {
    const keyword = e.detail.value
    this.setData({ pickerKeyword: keyword })
    this.filterCustomers(keyword)
  },

  filterCustomers(keyword) {
    const { allCustomers } = this.data
    const kw = (keyword || '').toLowerCase()
    const filtered = kw
      ? allCustomers.filter(c => (c.nickname || '').toLowerCase().includes(kw))
      : allCustomers
    this.setData({ pickerList: filtered.slice(0, 50) })
  },

  async loadCustomers() {
    try {
      if (!this.data.allCustomers.length) {
        const res = await customerApi.light(200)
        const list = Array.isArray(res) ? res : []
        this.setData({ allCustomers: list })
      }
      this.filterCustomers(this.data.pickerKeyword)
    } catch {
      this.setData({ pickerList: [] })
    }
  },

  onPickerSelect(e) {
    const nickname = e.currentTarget.dataset.nickname
    this.setData({ nickname, showPicker: false, pickerKeyword: '' })
  },

  onSubmit() {
    const { isEdit, editId, nickname, content } = this.data
    if (isEdit && !this.data.canEdit) {
      wx.showToast({ title: '只能修改自己新增的记录', icon: 'none' })
      return
    }
    if (!nickname.trim()) {
      wx.showToast({ title: '请选择用户昵称', icon: 'none' })
      return
    }
    if (!content.trim()) {
      wx.showToast({ title: '请输入沟通记录', icon: 'none' })
      return
    }

    const data = { customer_nickname: nickname.trim(), content: content.trim() }
    this.setData({ saving: true })

    const action = isEdit
      ? communicationRecordApi.update(editId, data)
      : communicationRecordApi.create(data)

    action.then(() => {
      wx.showToast({ title: isEdit ? '已更新' : '已创建', icon: 'success' })
      this.markPreviousPageRefresh()
      setTimeout(() => wx.navigateBack(), 500)
    }).catch(err => {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    }).finally(() => {
      this.setData({ saving: false })
    })
  },

  onDelete() {
    if (!this.data.canDelete) return
    const { editId } = this.data
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除？',
      success: (res) => {
        if (res.confirm) {
          communicationRecordApi.delete(editId).then(() => {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.markPreviousPageRefresh()
            setTimeout(() => wx.navigateBack(), 500)
          }).catch(err => {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' })
          })
        }
      },
    })
  },

  onBack() {
    wx.navigateBack()
  },

  markPreviousPageRefresh() {
    const pages = getCurrentPages()
    const previous = pages[pages.length - 2]
    if (previous) previous._needRefresh = true
  },
})
