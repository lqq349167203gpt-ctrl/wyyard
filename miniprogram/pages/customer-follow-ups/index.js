const { customerFollowUpApi } = require('../../utils/api')

const PAGE_SIZE = 20

function formatDate(value) {
  if (!value) return ''
  const parts = String(value).split('-')
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : value
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = item => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: {
    keyword: '', searchKeyword: '', dateFrom: '', dateTo: '',
    list: [], dateGroups: [], page: 1, total: 0, hasMore: false,
    loading: false, error: '',
    // 修改自己填的内容
    editing: null, draft: '', saving: false,
  },
  onLoad() {
    if (!getApp().checkLogin()) return
    this.load(true)
  },
  onShow() {
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/customer-follow-ups/index')
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(false) },
  async onPullDownRefresh() {
    try { await this.load(true) } finally { wx.stopPullDownRefresh() }
  },
  async load(reset) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true, error: '', ...(reset ? { list: [], page: 1 } : {}) })
    try {
      const result = await customerFollowUpApi.list({ keyword: this.data.searchKeyword, dateFrom: this.data.dateFrom, dateTo: this.data.dateTo, page, pageSize: PAGE_SIZE })
      const items = (result.items || []).map(row => ({
        ...row,
        dateText: formatDate(row.visit_date),
        activityText: (row.activities || []).join('、'),
        updatedText: formatTime(row.updated_at),
      }))
      const list = reset ? items : this.data.list.concat(items)
      // 按到店日期分组
      const dateMap = {}
      const dateGroups = []
      list.forEach(row => {
        const key = row.visit_date || '未记录日期'
        if (!dateMap[key]) { dateMap[key] = { date: key, items: [] }; dateGroups.push(dateMap[key]) }
        dateMap[key].items.push(row)
      })
      this.setData({
        list, dateGroups, page: result.page || page, total: result.total || 0,
        hasMore: list.length < (result.total || 0),
      })
    } catch (e) {
      this.setData({ error: e.message || '加载失败', ...(reset ? { list: [], total: 0, hasMore: false } : {}) })
    } finally {
      this.setData({ loading: false })
    }
  },
  onKeywordInput(e) { this.setData({ keyword: e.detail.value }) },
  onDateFrom(e) { this.setData({ dateFrom: e.detail.value }); this.load(true) },
  onDateTo(e) { this.setData({ dateTo: e.detail.value }); this.load(true) },
  onClearDate() { this.setData({ dateFrom: '', dateTo: '' }); this.load(true) },
  onSearch() {
    this.setData({ searchKeyword: (this.data.keyword || '').trim() })
    this.load(true)
  },
  onResetSearch() {
    this.setData({ keyword: '', searchKeyword: '' })
    this.load(true)
  },
  /** 点昵称看客户详情（权限由后端按账号浏览权限校验） */
  openCustomer(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/customer-profile/index?id=' + encodeURIComponent(id) })
  },
  /** 点自己填的内容就地修改 */
  openEdit(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const row = this.data.list[index]
    if (!row) return
    const note = row[field]
    this.setData({
      editing: {
        index, field,
        // 没填过的也能填：没有 noteId 时保存走新增
        noteId: note ? note.id : '',
        title: { visit_need: '来访需求', customer_info: '客户信息', follow_up: '跟进点' }[field] || '内容',
        customerName: row.customer_name || '客户',
        dateText: row.dateText, activityName: row.activityText,
        creating: !note,
      },
      draft: (note && note.content) || '',
    })
  },
  closeEdit() { if (!this.data.saving) this.setData({ editing: null, draft: '' }) },
  onDraftInput(e) { this.setData({ draft: e.detail.value }) },
  async saveEdit() {
    const editing = this.data.editing
    const content = (this.data.draft || '').trim()
    if (!editing) return
    if (!content) { wx.showToast({ title: '内容不能为空', icon: 'none' }); return }
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const saved = editing.noteId
        ? await customerFollowUpApi.update(editing.noteId, content)
        : await customerFollowUpApi.create(this.data.list[editing.index].visit_id, editing.field, content)
      const list = this.data.list.slice()
      const row = { ...list[editing.index] }
      row[editing.field] = { id: saved.id, content, updated_at: saved.updated_at }
      list[editing.index] = row
      this.setData({ list, editing: null, draft: '' })
      wx.showToast({ title: '已保存', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
  noop() {},
})
