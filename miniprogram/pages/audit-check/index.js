const { auditCheckApi, activityThemeApi, visitVerificationApi, spaceApi } = require('../../utils/api')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(value) { return String(value).padStart(2, '0') }
function fmt(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
function monthRange() {
  const now = new Date()
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) }
}
function dateText(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return `${Number(parts[1])}月${Number(parts[2])}日 ${WEEKDAYS[d.getDay()] || ''}`
}

Page({
  data: {
    mode: 'course',
    dateFrom: '', dateTo: '',
    spaces: [{ id: '', name: '全部空间' }], spaceIndex: 0,
    filters: [{ value: 'unchecked', label: '未核对' }, { value: 'checked', label: '已核对' }],
    filterIndex: 0,
    kinds: null,
    days: [],
    summary: null,
    loading: false, error: '',
    detail: null, busy: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('audit-check')) {
      this.setData({ error: '暂无「信息核对」页面权限' })
      return
    }
    const range = monthRange()
    this.setData({ dateFrom: range.from, dateTo: range.to })
    this.loadSpaces()
    this.load()
  },

  onShow() {
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/audit-check/index')
  },

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      this.setData({ spaces: [{ id: '', name: '全部空间' }].concat((spaces || []).map(item => ({ id: item.id, name: item.name }))) })
    } catch (e) { /* 没空间权限就只看全部空间 */ }
  },

  /** 列表只保留关键信息，其余放进详情弹层（小屏才不会乱） */
  decorateDay(day) {
    const isCourse = this.data.mode === 'course'
    const block = isCourse ? day.course : day.visit
    if (!block) return null
    const rows = (block.rows || []).map(row => (isCourse ? {
      id: row.id,
      title: row.title || row.type_label || '未命名课程',
      timeText: row.time ? `${row.time}${row.end_time ? '~' + row.end_time : ''}` : '',
      subText: [row.activity_type_label, row.teacher_names && row.teacher_names.length ? row.teacher_names.join('、') : '', row.owner_name ? `案主 ${row.owner_name}` : ''].filter(Boolean).join(' · '),
      badge: row.kinds && row.kinds.length ? `待补 ${row.kinds.length}` : '',
      raw: row,
    } : {
      id: row.id,
      title: row.nickname || '未命名客户',
      timeText: row.time || '',
      subText: [row.member_type, row.inviter ? `引流 ${row.inviter}` : '', row.cancelled ? '已取消' : (row.arrived ? '已到店' : '')].filter(Boolean).join(' · '),
      badge: row.kinds && row.kinds.length ? `待补 ${row.kinds.length}` : '',
      raw: row,
    }))
    return {
      date: day.date,
      dateText: dateText(day.date),
      checked: isCourse ? block.locked === true : block.verified === true,
      operator: isCourse ? (block.locked_by || '') : (block.verified_by || ''),
      count: rows.length,
      missing: block.missing_count || 0,
      rows,
    }
  },

  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const result = await auditCheckApi.list({
        startDate: this.data.dateFrom,
        endDate: this.data.dateTo,
        scope: this.data.mode,
        spaceId: this.data.mode === 'course' ? (this.data.spaces[this.data.spaceIndex] || {}).id || '' : '',
        kinds: this.data.kinds === null ? undefined : this.data.kinds,
      })
      const days = (result.days || []).map(day => this.decorateDay(day)).filter(Boolean)
      const checked = this.data.filters[this.data.filterIndex].value === 'checked'
      this.setData({
        days: days.filter(day => (checked ? day.checked : !day.checked)),
        summary: result.summary || null,
      })
    } catch (e) {
      this.setData({ error: e.message || '加载失败', days: [] })
    } finally {
      this.setData({ loading: false })
    }
  },

  onMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === this.data.mode) return
    this.setData({ mode, detail: null })
    this.load()
  },
  onDateFrom(event) { this.setData({ dateFrom: event.detail.value }); this.load() },
  onDateTo(event) { this.setData({ dateTo: event.detail.value }); this.load() },
  onSpace(event) { this.setData({ spaceIndex: Number(event.detail.value) }); this.load() },
  onFilter(event) {
    this.setData({ filterIndex: Number(event.currentTarget.dataset.index) })
    this.load()
  },

  /** 详情：把这一条的所有字段平铺出来，空的不显示 */
  openDetail(event) {
    const dayIndex = Number(event.currentTarget.dataset.day)
    const rowIndex = Number(event.currentTarget.dataset.row)
    const day = this.data.days[dayIndex]
    const row = day && day.rows[rowIndex]
    if (!row) return
    const isCourse = this.data.mode === 'course'
    const raw = row.raw || {}
    const fields = isCourse ? [
      ['时间', raw.time && `${raw.time}${raw.end_time ? '~' + raw.end_time : ''}`],
      ['课程', raw.title],
      ['类型', raw.activity_type_label || raw.type_label],
      ['老师', (raw.teacher_names || []).join('、')],
      ['案主', raw.owner_name],
      ['部位数', raw.body_parts ? String(raw.body_parts) : ''],
      ['参与人', (raw.participant_names || []).join('、')],
      ['活动方式', raw.activity_mode],
      ['活动简介', raw.intro],
      ['创建人', raw.creator],
      ['缺口', (raw.kinds || []).join('、')],
    ] : [
      ['时间', raw.time],
      ['客户', raw.nickname],
      ['会员身份', raw.member_type],
      ['组长', raw.is_leader ? '是' : (raw.leader_name ? raw.leader_name : '')],
      ['到店', raw.cancelled ? '已取消' : (raw.arrived ? `已到店${raw.arrival_time ? ' · ' + raw.arrival_time : ''}` : '未到店')],
      ['来访需求', raw.needs_hidden ? '（无查看权限）' : raw.needs],
      ['客户信息', raw.customer_info],
      ['跟进点', raw.follow_up],
      ['引流人', raw.inviter],
      ['承接人', raw.receptionist],
      ['邀约目标', raw.goal],
      ['创建人', raw.creator],
      ['缺口', (raw.kinds || []).join('、')],
    ]
    this.setData({
      detail: {
        dayIndex,
        date: day.date,
        dateText: day.dateText,
        checked: day.checked,
        operator: day.operator,
        title: row.title,
        fields: fields.filter(item => item[1]).map(item => ({ label: item[0], value: item[1] })),
      },
    })
  },
  closeDetail() { if (!this.data.busy) this.setData({ detail: null }) },

  /** 核对 / 取消核对（按天，和 PC 一致） */
  async toggleCheck() {
    const detail = this.data.detail
    if (!detail || this.data.busy) return
    const date = detail.date
    const willCheck = !detail.checked
    this.setData({ busy: true })
    wx.showLoading({ title: willCheck ? '核对中' : '取消中' })
    try {
      const isCourse = this.data.mode === 'course'
      const spaceId = isCourse ? (this.data.spaces[this.data.spaceIndex] || {}).id || '' : ''
      const response = isCourse
        ? (willCheck ? await activityThemeApi.lock(date, spaceId) : await activityThemeApi.unlock(date, spaceId))
        : (willCheck ? await visitVerificationApi.verify(date, spaceId) : await visitVerificationApi.unverify(date, spaceId))
      const operator = response.locked_by || response.verified_by || ''
      const days = this.data.days.map((day, index) => index === detail.dayIndex
        ? { ...day, checked: willCheck, operator }
        : day)
      const checkedFilter = this.data.filters[this.data.filterIndex].value === 'checked'
      this.setData({
        days: days.filter(day => (checkedFilter ? day.checked : !day.checked)),
        detail: null,
      })
      wx.showToast({ title: willCheck ? '已核对' : '已取消核对', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },

  /** 去编辑：课表跳活动详情、邀约跳邀约详情 */
  goEdit() {
    const detail = this.data.detail
    if (!detail) return
    const day = this.data.days[detail.dayIndex]
    const row = day && day.rows.find(item => item.title === detail.title)
    const id = row && row.id
    this.setData({ detail: null })
    if (!id) return
    if (this.data.mode === 'course') {
      wx.navigateTo({ url: `/pages/activity-detail/index?id=${encodeURIComponent(id)}` })
    } else {
      wx.navigateTo({ url: `/pages/visit-detail/index?id=${encodeURIComponent(id)}` })
    }
  },
})
