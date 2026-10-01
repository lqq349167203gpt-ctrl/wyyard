// 沟通列表与搜索页共用分页，详情仍单条读取；筛选永远在服务端完整可见记录中执行。
const { communicationRecordApi } = require('./api')

function decorateRecords(items) {
  return items.map(item => {
    const date = item.created_at ? new Date(item.created_at) : null
    return { ...item, _dateStr: date ? `${date.getMonth() + 1}/${date.getDate()}` : '' }
  })
}

function communicationList(searchPage = false) {
  return {
    async loadList(reset = true) {
      if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return
      const sequence = this._listSequence = (this._listSequence || 0) + 1
      const keyword = (this.data.keyword || '').trim()
      const creators = (this._appliedCreators || this.data.selectedCreators || []).slice()
      const active = !searchPage || !!(keyword || creators.length)
      const page = reset ? 1 : this.data.page + 1
      this._retryReset = reset
      this.setData({ loading: reset && active, loadingMore: !reset, error: '', hasSearched: searchPage && active })
      try {
        // 无搜索条件时只读1条以获取完整创建人选项，不下载整个记录库。
        const result = await communicationRecordApi.listPage({ page, page_size: active ? 20 : 1,
          nickname: keyword, creator_names: creators })
        if (sequence !== this._listSequence) return
        const names = (result.creators || []).slice().sort((a, b) => (
          ((result.creator_counts || {})[b] || 0) - ((result.creator_counts || {})[a] || 0) || a.localeCompare(b, 'zh-CN')
        ))
        const items = active ? decorateRecords(result.items || []) : []
        const records = reset ? items : this.data.records.concat(items)
        this.setData({ records, filtered: records, creatorNames: names, page,
          total: active ? result.total : 0, hasMore: active && records.length < result.total, recordsReady: true })
        this.updateCreatorList()
      } catch (error) {
        if (sequence === this._listSequence) this.setData({ error: error.message || '加载失败，请重试' })
      } finally {
        if (sequence === this._listSequence) this.setData({ loading: false, loadingMore: false })
      }
    },
    loadRecords() { return this.loadList(true) },
    applyFilter() {
      this._appliedCreators = this.data.selectedCreators.slice()
      return this.loadList(true)
    },
    applySearch() {
      this._appliedCreators = this.data.selectedCreators.slice()
      return this.loadList(true)
    },
    onReachBottom() { return this.loadList(false) },
    onPullDownRefresh() { return this.loadList(true).finally(() => wx.stopPullDownRefresh()) },
    retryList() { return this.loadList(this._retryReset !== false) },
    onUnload() {
      this._listSequence = (this._listSequence || 0) + 1
      if (this._searchTimer) clearTimeout(this._searchTimer)
    },
  }
}

module.exports = { communicationList }
