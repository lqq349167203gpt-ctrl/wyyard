const { customerTagApi } = require('../../utils/api')

Page({
  data: {
    permissionReady: false,
    hasPermission: false,
    loading: true,
    tags: [],
    filteredTags: [],
    scopeFilter: 'all',
    showEditor: false,
    editingId: '',
    formName: '',
    formScope: 'public',
    formDescription: '',
    saving: false,
  },

  async onLoad() {
    if (!getApp().checkLogin()) return
    this._initializing = true
    const app = getApp()
    try {
      try {
        await app.refreshPermissions()
      } catch (e) {
        // 网络异常时继续使用本地缓存权限
      }
      if (!app.checkPagePermission('customer-tags')) {
        this.setData({ permissionReady: true, hasPermission: false, loading: false })
        wx.showToast({ title: '无客户标签配置权限', icon: 'none' })
        return
      }
      this.setData({ permissionReady: true, hasPermission: true })
      await this.loadData()
    } finally {
      this._initializing = false
    }
  },

  async onShow() {
    if (!getApp().checkLogin()) return
    if (this._initializing) return
    const app = getApp()
    try {
      await app.refreshPermissions()
    } catch (e) {
      // 网络异常时继续使用本地缓存权限
    }
    const hasPermission = app.checkPagePermission('customer-tags')
    if (!this.data.permissionReady || hasPermission !== this.data.hasPermission) {
      this.setData({ permissionReady: true, hasPermission, loading: false })
      if (hasPermission) this.loadData()
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const tags = await customerTagApi.list()
      this.setData({ tags: tags || [], loading: false })
      this.applyFilter()
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh() {
    if (!this.data.permissionReady || !this.data.hasPermission) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  applyFilter() {
    const filter = this.data.scopeFilter
    const filteredTags = filter === 'all'
      ? this.data.tags
      : this.data.tags.filter(tag => tag.scope === filter)
    this.setData({ filteredTags })
  },

  onFilterChange(e) {
    this.setData({ scopeFilter: e.currentTarget.dataset.scope })
    this.applyFilter()
  },

  onCreate() {
    this.setData({
      showEditor: true,
      editingId: '',
      formName: '',
      formScope: 'public',
      formDescription: '',
    })
  },

  onEdit(e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({
      showEditor: true,
      editingId: tag.id,
      formName: tag.name,
      formScope: tag.scope,
      formDescription: tag.description || '',
    })
  },

  onCloseEditor() {
    if (this.data.saving) return
    this.setData({ showEditor: false })
  },

  onNameInput(e) {
    this.setData({ formName: e.detail.value })
  },

  onDescriptionInput(e) {
    this.setData({ formDescription: e.detail.value })
  },

  onScopeChange(e) {
    if (this.data.editingId) return
    this.setData({ formScope: e.currentTarget.dataset.scope })
  },

  async onSave() {
    const name = (this.data.formName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入标签名称', icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const description = (this.data.formDescription || '').trim()
      if (this.data.editingId) {
        await customerTagApi.update(this.data.editingId, { name, description })
      } else {
        await customerTagApi.create({ name, scope: this.data.formScope, description })
      }
      this.setData({ showEditor: false })
      wx.showToast({ title: '已保存' })
      await this.loadData()
    } catch (e) {
      // request 已统一展示后端错误信息
    } finally {
      this.setData({ saving: false })
    }
  },

  onArchive(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '停用标签',
      content: `停用“${name}”后，该标签将从客户资料中移除，是否继续？`,
      confirmColor: '#c4506a',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await customerTagApi.archive(id)
          wx.showToast({ title: '已停用' })
          await this.loadData()
        } catch (error) {
          // request 已统一展示后端错误信息
        }
      },
    })
  },
})
