const { communicationRecordApi } = require('../../utils/api')
const { communicationList } = require('../../utils/communication-list')

Page({
  data: {
    hasPagePermission: true,
    keyword: '',
    records: [],
    filtered: [],
    recordsReady: false,
    loading: false,
    loadingMore: false,
    error: '',
    page: 1,
    total: 0,
    hasMore: false,
    hasSearched: false,
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
      return
    }
    this.loadRecords()
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadRecords()
    }
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

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.applySearch(), 300)
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.applySearch()
  },

  onClearKeyword() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({ keyword: '' }, () => this.applySearch())
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
      this.applySearch()
    })
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
      success: (result) => {
        if (result.tapIndex !== 0) return
        wx.showModal({
          title: '确认删除',
          content: '删除后不可恢复，确定删除？',
          success: (modalResult) => {
            if (!modalResult.confirm) return
            communicationRecordApi.delete(id).then(() => {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadRecords()
            }).catch(error => {
              wx.showToast({ title: error.message || '删除失败', icon: 'none' })
            })
          },
        })
      },
    })
  },
  ...communicationList(true),
})
