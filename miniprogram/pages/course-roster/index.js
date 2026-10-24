const { matchesCustomerSearch } = require('../../utils/customer-search')
const { courseRosterApi, activityWithdrawalApi } = require('../../utils/api')
const { decorateRoster, markCoursePagesDirty } = require('../../utils/course-roster')

Page({
  data: { loading: true, error: '', course: null, people: [], visiblePeople: [], keyword: '',
    selectedIds: [], selectedCount: 0, submitting: false, showWithdrawn: false },
  onLoad(options) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('daily-activities')) { this.setData({ loading: false, error: '没有课表页面权限' }); return }
    this.source = options.source
    this.sessionId = options.id
    if (!this.source || !this.sessionId) { this.setData({ loading: false, error: '课程参数不完整，请返回课表重试' }); return }
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/course-roster/index')
    this.load()
  },
  onShow() {
    if (this._needRefresh && this.sessionId) { this._needRefresh = false; this.load() }
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  onUnload() { this._disposed = true; this._seq = (this._seq || 0) + 1 },
  async load() {
    if (!this.sessionId) return
    const seq = this._seq = (this._seq || 0) + 1
    this.setData({ loading: true, error: '' })
    try {
      const [course, notes] = await Promise.all([
        courseRosterApi.get(this.source, this.sessionId), courseRosterApi.notes(this.source, this.sessionId),
      ])
      if (this._disposed || seq !== this._seq) return
      const people = decorateRoster(course, notes)
      this.setData({ course, people, loading: false, selectedIds: [], selectedCount: 0,
        activeCount: people.filter(p => !p.withdrawn).length })
      this.filter()
    } catch (error) {
      if (seq === this._seq && !this._disposed) this.setData({ loading: false, error: error.message || '名单读取失败，请重试' })
    }
  },
  filter() {
    const word = this.data.keyword.trim().toLowerCase()
    this.setData({ visiblePeople: this.data.people.filter(p => (this.data.showWithdrawn || !p.withdrawn)
      && matchesCustomerSearch(p, word)).map(p => ({ ...p, selected: this.data.selectedIds.includes(p.id) })) })
  },
  onSearch(e) { this.setData({ keyword: e.detail.value, selectedIds: [], selectedCount: 0 }); this.filter() },
  onToggleWithdrawn() { this.setData({ showWithdrawn: !this.data.showWithdrawn, selectedIds: [], selectedCount: 0 }); this.filter() },
  onSelect(e) {
    if (this.data.submitting || !this.data.course || (!this.data.course.can_confirm && !this.data.course.can_withdraw)) return
    const id = e.currentTarget.dataset.id
    const person = this.data.people.find(p => p.id === id)
    if (!person || person.withdrawn) return
    const selectedIds = this.data.selectedIds.includes(id)
      ? this.data.selectedIds.filter(value => value !== id) : this.data.selectedIds.concat(id)
    this.setData({ selectedIds, selectedCount: selectedIds.length }); this.filter()
  },
  onRecord(e) {
    const id = e.currentTarget.dataset.id
    const person = this.data.people.find(p => p.id === id)
    if (!person || person.withdrawn || this.data.submitting) return
    wx.navigateTo({ url: `/pages/course-participant-record/index?source=${encodeURIComponent(this.source)}&id=${encodeURIComponent(this.sessionId)}&customerId=${encodeURIComponent(id)}` })
  },
  onProfile(e) { wx.navigateTo({ url: `/pages/customer-profile/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }) },
  async onConfirm() {
    if (!this.data.course || !this.data.course.can_confirm || this.data.submitting) return
    const ids = this.data.selectedIds.slice()
    if (!ids.length) { wx.showToast({ title: '请先勾选学员', icon: 'none' }); return }
    const result = await wx.showModal({ title: '确认本场已上课', content: `确认选中的 ${ids.length} 人已参加本场课程？本操作不扣卡。` })
    if (!result.confirm || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await courseRosterApi.confirm(this.source, this.sessionId, ids)
      markCoursePagesDirty(); this._needRefresh = false
      await this.load()
      wx.showToast({ title: '已确认本场上课', icon: 'success' })
    } catch (_) { /* 请求封装显示具体错误，保留已选名单供重试。 */ }
    finally { if (!this._disposed) this.setData({ submitting: false }) }
  },
  async onWithdraw() {
    if (!this.data.course || !this.data.course.can_withdraw || this.data.submitting) return
    const ids = this.data.selectedIds.slice()
    if (!ids.length) { wx.showToast({ title: '请先勾选退课学员', icon: 'none' }); return }
    const result = await wx.showModal({ title: '确认本场退课', content: `为选中的 ${ids.length} 人办理退课？保留历史，核销码失效，并按现有规则处理已扣卡次。` })
    if (!result.confirm || this.data.submitting) return
    this.setData({ submitting: true })
    let completed = 0
    try {
      for (const id of ids) {
        await activityWithdrawalApi.withdraw(this.data.course.record_type, this.sessionId, id)
        completed++
      }
    } catch (_) { /* 下方明确报告部分成功，不把已完成的退课误报为全部失败。 */ }
    finally {
      if (completed) markCoursePagesDirty()
      this._needRefresh = false
      await this.load()
      if (!this._disposed) {
        this.setData({ submitting: false })
        wx.showToast({ title: completed === ids.length ? '已办理退课' : `已完成 ${completed}/${ids.length} 人，请核对后重试`, icon: completed === ids.length ? 'success' : 'none' })
      }
    }
  },
})
