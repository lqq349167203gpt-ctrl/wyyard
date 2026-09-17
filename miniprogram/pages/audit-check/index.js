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
    busy: false,
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
    const rows = (block.rows || []).map(row => {
      const has = key => (row.kinds || []).indexOf(key) >= 0
      // 时间 / 类型 / 方式（线上线下）一看就懂，放在同一行、不用标题
      const headline = isCourse
        ? [
            row.time ? `${row.time}${row.end_time ? '~' + row.end_time : ''}` : "",
            row.type_label || row.activity_type_label,
            row.activity_mode,
            // 扣卡 0 次也要显示，否则会以为这条信息缺了
            `扣卡 ${row.deduction_count || 0} 次`,
          ].filter(Boolean).join(" · ")
        : [row.time, row.is_leader ? "组长" : "", row.cancelled ? "已取消" : (row.arrived ? `已到店${row.arrival_time ? ' ' + row.arrival_time : ''}` : "未到店")].filter(Boolean).join(" · ")
      const fields = isCourse ? [
        { label: "老师", value: (row.teacher_names || []).join("、"), missing: has("course_teacher") },
        { label: "案主", value: row.owner_name, missing: has("course_owner") },
        { label: "部位", value: row.body_parts ? `${row.body_parts}` : "" },
        { label: "简介", value: row.intro },
      ] : [
        { label: "邀约人", value: row.inviter },
        { label: "接待人", value: row.receptionist },
        { label: "目标", value: row.goal },
        { label: "所属组长", value: row.has_leader ? (row.leader_name || "") : "" },
        { label: "创建人", value: row.creator },
      ]
      return {
        id: row.id,
        // 发布不是重点：只在「未发布」时用一个小标签提示，已发布不占地方
        statusTag: isCourse && !row.published ? "未发布" : "",
        headline,
        title: (isCourse ? (row.title || row.type_label || "未命名活动") : (row.nickname || "未命名客户")),
        fields: fields.filter(item => item.value),
        missingCount: (row.kinds || []).length,
        // 参与人全部显示，不做缩略
        peopleText: isCourse && (row.participant_names || []).length
          ? `${row.participant_names.join("、")}（${row.participant_names.length} 人）`
          : "",
        peopleMissing: isCourse && (!row.participant_names || !row.participant_names.length),
      }
    })
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
    this.setData({ mode })
    this.load()
  },
  onDateFrom(event) { this.setData({ dateFrom: event.detail.value }); this.load() },
  onDateTo(event) { this.setData({ dateTo: event.detail.value }); this.load() },
  onSpace(event) { this.setData({ spaceIndex: Number(event.detail.value) }); this.load() },
  onFilter(event) {
    this.setData({ filterIndex: Number(event.currentTarget.dataset.index) })
    this.load()
  },


  /** 核对 / 取消核对：核对的是「当天」的全部信息，所以放在日期分组头上 */
  async toggleCheckDay(event) {
    const dayIndex = Number(event.currentTarget.dataset.day)
    const day = this.data.days[dayIndex]
    if (!day || this.data.busy) return
    const date = day.date
    const willCheck = !day.checked
    this.setData({ busy: true })
    wx.showLoading({ title: willCheck ? '核对中' : '取消中' })
    try {
      const isCourse = this.data.mode === 'course'
      const spaceId = isCourse ? (this.data.spaces[this.data.spaceIndex] || {}).id || '' : ''
      const response = isCourse
        ? (willCheck ? await activityThemeApi.lock(date, spaceId) : await activityThemeApi.unlock(date, spaceId))
        : (willCheck ? await visitVerificationApi.verify(date, spaceId) : await visitVerificationApi.unverify(date, spaceId))
      const operator = response.locked_by || response.verified_by || ''
      const days = this.data.days.map((item, index) => index === dayIndex
        ? { ...item, checked: willCheck, operator }
        : item)
      const checkedFilter = this.data.filters[this.data.filterIndex].value === 'checked'
      this.setData({ days: days.filter(item => (checkedFilter ? item.checked : !item.checked)) })
      wx.showToast({ title: willCheck ? '已核对' : '已取消核对', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },

  /** 去编辑：课表跳活动详情、邀约跳邀约详情 */
  goEdit(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    if (this.data.mode === 'course') {
      wx.navigateTo({ url: `/pages/activity-detail/index?id=${encodeURIComponent(id)}` })
    } else {
      wx.navigateTo({ url: `/pages/visit-detail/index?id=${encodeURIComponent(id)}` })
    }
  },
})
