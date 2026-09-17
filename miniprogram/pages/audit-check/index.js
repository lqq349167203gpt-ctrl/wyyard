const { auditCheckApi, activityThemeApi, visitVerificationApi, spaceApi, classRecordApi } = require('../../utils/api')

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
    timePreset: 'all', timePresetIndex: 4,
    // 核对起算日：接口会返回（默认 2026-07-01），本年/全部都从这个日期算到今天
    lockStart: '2026-07-01',
    // 点选式时间快捷项（自定义由下面的日期框决定，不占一格）
    timePresets: [
      { value: 'today', label: '当天' }, { value: 'week', label: '本周' },
      { value: 'month', label: '本月' }, { value: 'year', label: '本年' },
      { value: 'all', label: '全部' },
    ],
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
    // 默认「全部」：核对起算日 ~ 今天（起算日先用 2026-07-01，接口回来后再以实际为准）
    const today = fmt(new Date())
    this.setData({ dateFrom: this.data.lockStart, dateTo: today, timePreset: 'all', timePresetIndex: 4 })
    // 先拿到空间列表，默认选第一个真实空间，再用它查数据
    this.loadSpaces().then(() => this.load())
  },

  onShow() {
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/audit-check/index')
  },

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      const list = [{ id: '', name: '全部空间' }].concat((spaces || []).map(item => ({ id: item.id, name: item.name })))
      // 默认落到第一个真实空间（没有空间时才用「全部空间」）
      this.setData({ spaces: list, spaceIndex: list.length > 1 ? 1 : 0 })
    } catch (e) { /* 没空间权限就只看全部空间 */ }
  },

  /** 列表只保留关键信息，其余放进详情弹层（小屏才不会乱） */
  decorateDay(day) {
    const isCourse = this.data.mode === 'course'
    const block = isCourse ? day.course : day.visit
    if (!block) return null
    const rows = (block.rows || []).map(row => {
      const has = key => (row.kinds || []).indexOf(key) >= 0
      const MISSING_LABELS = {
        course_time: "缺时间", course_type: "缺类型", course_name: "缺名称", course_teacher: "缺老师",
        course_owner: "缺案主", course_body_parts: "缺部位", course_intro: "缺简介", course_no_participant: "无参与人",
        visit_time: "缺时间", visit_nickname: "缺昵称", visit_inviter: "缺邀约人", visit_receptionist: "缺接待人",
      }
      // 缺失只在「字段自己那一行」用带底框的标签显示一次（标题行不再重复）
      const missingTags = []
      // 时间 / 类型 / 方式（线上线下）一看就懂，放在同一行、不用标题
      const headline = isCourse
        ? [
            row.time ? `${row.time}${row.end_time ? '~' + row.end_time : ''}` : "",
            row.type_label || row.activity_type_label,
            row.activity_mode,
            // 扣卡 0 次也要显示，否则会以为这条信息缺了
            `扣卡 ${row.deduction_count || 0} 次`,
          ].filter(Boolean).join(" · ")
        : [
            row.time,
            row.creator ? `创建人 ${row.creator}` : "",
            // 组长情况：是组长 → 组长；有分组 → 所属 xxx；都没有 → 未分组
            row.is_leader ? "组长" : (row.has_leader && row.leader_name ? `所属 ${row.leader_name}` : "未分组"),
          ].filter(Boolean).join(" · ")
      // 方案 B：到场 / 取消状态做成胶囊，放在名字左边
      const statusText = isCourse ? "" : (row.cancelled ? "已取消" : (row.arrived ? "已到店" : "未到店"))
      const statusClass = isCourse ? "" : (row.cancelled ? "cancel" : (row.arrived ? "ok" : "wait"))
      const fields = isCourse ? [
        { label: "老师", kind: "course_teacher", value: (row.teacher_names || []).join("、") },
        { label: "案主", kind: "course_owner", value: row.owner_name },
        { label: "部位", kind: "course_body_parts", value: row.body_parts ? `${row.body_parts}` : "" },
        { label: "简介", value: row.intro },
      ] : [
        { label: "到场时间", value: row.arrived && !row.cancelled ? (row.arrival_time || "已到店") : "" },
        { label: "邀约人", kind: "visit_inviter", value: row.inviter },
        // 接待人 / 目标：不管有没有内容都保留标题
        { label: "接待人", kind: "visit_receptionist", alwaysShow: true, value: row.receptionist },
        { label: "目标", kind: "visit_goal", alwaysShow: true, value: row.goal },
      ]
      return {
        id: row.id,
        // 发布不是重点：只在「未发布」时用一个小标签提示，已发布不占地方
        statusTag: "",
        headline,
        statusText,
        statusClass,
        titleMissing: !isCourse && has("visit_nickname") ? "缺昵称" : "",
        missingTags,
        title: (isCourse ? (row.title || row.type_label || "未命名活动") : (row.nickname || "未命名客户")),
        // 只有 PC 判定为「缺」的项才显示成未填（比如能量结才检查部位、沙龙没有案主就不提示）；
        // 简介等没有检查项的字段，空着就整行不显示
        fields: fields
          .filter(item => item.value || (item.kind && has(item.kind)) || item.alwaysShow)
          .map(item => {
            if (item.value) return item
            if (item.kind && has(item.kind)) return { ...item, missing: true, missingLabel: MISSING_LABELS[item.kind] || "未填" }
            return { ...item, empty: true }
          }),

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
      const lockStart = result.lock_start_date || this.data.lockStart
      if (lockStart !== this.data.lockStart) this.setData({ lockStart })
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
  /** 时间预设：当天/本周/本月/本年/全部，口径与 PC 一致（全部=不限定日期） */
  onTimePresetTap(event) {
    const key = event.currentTarget.dataset.key || 'all'
    const pad = v => String(v).padStart(2, '0')
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date()
    let from = ''
    let to = ''
    if (key === 'today') { from = fmt(now); to = fmt(now) }
    else if (key === 'week') { const start = new Date(now); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); from = fmt(start); to = fmt(now) }
    else if (key === 'month') { from = fmt(new Date(now.getFullYear(), now.getMonth(), 1)); to = fmt(now) }
    // 本年 / 全部：按核对起算日算（7月1日到今天），避免把不能核对的历史也算进来
    else if (key === 'year' || key === 'all') { from = this.data.lockStart; to = fmt(now) }
    this.setData({ timePreset: key, dateFrom: from, dateTo: to })
    this.load()
  },
  onDateFrom(event) { this.setData({ timePreset: 'custom', dateFrom: event.detail.value }); this.load() },
  onDateTo(event) { this.setData({ timePreset: 'custom', dateTo: event.detail.value }); this.load() },
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
    const pageName = this.data.mode === 'course' ? '课表' : '邀约'
    // 弹窗文案与 PC 完全一致
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: willCheck ? `确认核对 ${date} 的${pageName}？` : `解锁 ${date} 的${pageName}？`,
        content: willCheck
          ? (this.data.mode === 'course'
              ? '锁定后当天该空间的活动将不能修改（课程复盘除外）'
              : '锁定后当天该空间的邀约资料将不能修改（来访需求、客户信息、跟进点除外）')
          : `解锁后当天该空间的${pageName}可以继续修改。`,
        confirmText: willCheck ? '确认核对' : '解锁',
        cancelText: '取消',
        success: res => resolve(res.confirm === true),
        fail: () => resolve(false),
      })
    })
    if (!confirmed) return
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
  async goEdit(event) {
    const id = event.currentTarget.dataset.id
    const date = event.currentTarget.dataset.date
    if (!id) return
    if (this.data.mode !== 'course') {
      // 和「邀约」页一致：直接进编辑表单；当天已核对时带上 verified，表单按锁定处理
      const verified = event.currentTarget.dataset.checked === true || event.currentTarget.dataset.checked === 'true'
      wx.navigateTo({ url: `/pages/visit-edit/index?id=${encodeURIComponent(id)}&verified=${verified ? '1' : '0'}` })
      return
    }
    // 活动详情页是从 globalData 取原始记录，所以先查当天课表、拿到这条记录再跳
    const [activityType, recordId] = String(id).split(':')
    const sourceMap = { class: 'class_record', gcs: 'group_case', ers: 'emotional_release', eks: 'energy_knot', ics: 'internal_course' }
    const keyMap = { class_record: 'class_records', group_case: 'gcs_sessions', emotional_release: 'ers_sessions', energy_knot: 'eks_sessions', internal_course: 'ics_sessions' }
    const source = sourceMap[activityType] || 'class_record'
    wx.showLoading({ title: '打开中' })
    try {
      const spaceId = (this.data.spaces[this.data.spaceIndex] || {}).id || ''
      const dashboard = await classRecordApi.dashboard(date, spaceId || undefined)
      const raw = ((dashboard && dashboard[keyMap[source]]) || []).find(item => item.id === recordId)
      if (!raw) throw new Error('找不到这条活动记录')
      const app = getApp()
      app.globalData._selectedActivity = raw
      app.globalData._selectedActivitySource = source
      app.globalData._selectedActivityDayLocked = false
      app.globalData._selectedActivityLockedBy = ''
      wx.navigateTo({ url: '/pages/activity-detail/index' })
    } catch (e) {
      wx.showToast({ title: e.message || '打开失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})
