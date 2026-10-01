const { communicationRecordApi } = require('../../utils/api')
const { communicationList } = require('../../utils/communication-list')

Page({
  data: {
    hasPagePermission: true,
    records: [],
    filtered: [],
    loading: false,
    loadingMore: false,
    error: '',
    page: 1,
    total: 0,
    hasMore: false,
    showFilterPanel: false,
    filterCount: 0,
    creatorNames: [],
    creatorList: [],
    selectedCreators: [],
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('communication-records')) {
      this.setData({ hasPagePermission: false })
    }
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('communication-records')) {
      this.setData({ hasPagePermission: false })
      return
    }
    this.setData({ hasPagePermission: true })
    this.loadList()
  },

  updateCreatorList() {
    const selected = new Set(this.data.selectedCreators)
    this.setData({
      creatorList: this.data.creatorNames.map(name => ({ name, selected: selected.has(name) })),
    })
  },

  updateFilterCount() {
    this.setData({ filterCount: this.data.selectedCreators.length > 0 ? 1 : 0 })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/communication-records/search' })
  },

  onToggleFilterPanel() {
    if (this.data.showFilterPanel) {
      this.onCloseFilterPanel()
      return
    }
    this._filterSnapshot = this.data.selectedCreators.slice()
    this.setData({ showFilterPanel: true })
  },

  onCloseFilterPanel() {
    const selectedCreators = this._filterSnapshot
      ? this._filterSnapshot.slice()
      : this.data.selectedCreators
    this.setData({ showFilterPanel: false, selectedCreators })
    this.updateCreatorList()
    this._filterSnapshot = null
  },

  onToggleCreator(e) {
    const name = e.currentTarget.dataset.name
    const selectedCreators = this.data.selectedCreators.slice()
    const index = selectedCreators.indexOf(name)
    if (index >= 0) selectedCreators.splice(index, 1)
    else selectedCreators.push(name)
    this.setData({ selectedCreators })
    this.updateCreatorList()
  },

  onResetFilter() {
    this.setData({ selectedCreators: [] })
    this.updateCreatorList()
  },

  onConfirmFilter() {
    this._filterSnapshot = null
    this.setData({ showFilterPanel: false }, () => {
      this.updateFilterCount()
      this.applyFilter()
    })
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/communication-records/form' })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const record = this.data.records.find(item => item.id === id)
    if (!record || !record.can_edit) return
    wx.navigateTo({ url: `/pages/communication-records/form?id=${id}` })
  },

  onLongPress(e) {
    const id = e.currentTarget.dataset.id
    const record = this.data.records.find(item => item.id === id)
    if (!record || !record.can_delete) return
    wx.showActionSheet({
      itemList: ['删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '确认删除',
            content: '删除后不可恢复，确定删除？',
            success: (modalRes) => {
              if (modalRes.confirm) {
                communicationRecordApi.delete(id).then(() => {
                  wx.showToast({ title: '已删除', icon: 'success' })
                  this.loadList()
                }).catch(err => {
                  wx.showToast({ title: err.message || '删除失败', icon: 'none' })
                })
              }
            },
          })
        }
      },
    })
  },
  ...communicationList(false),
})
