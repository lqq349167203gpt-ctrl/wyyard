const { serviceTeacherApi, customerFollowUpApi } = require('./api')
const { pickerData, attributionFromPicker } = require('./feedback-person')
const { beginRead, invalidateRead, disposeReads } = require('./read-scope')

function recordText(entries, fallback) {
  if (!Array.isArray(entries) || !entries.length) return fallback || ''
  return entries.map(entry => `${entry.author || '未知'}：${entry.content || ''}`).join('\n')
}

const COURSE_TYPES = [
  { value: 'all', label: '全部课程' },
  { value: 'class', label: '沙龙活动' },
  { value: 'gcs', label: '觉醒游戏' },
  { value: 'ers', label: '情绪释放' },
  { value: 'eks', label: '能量结' },
  { value: 'ics', label: '内部课程' },
]

const COURSE_RANGE_PRESETS = [
  { value: 'today', label: '当天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
  { value: 'all', label: '全部' },
]

const FOLLOW_UP_FILTERS = [
  { value: 'inactive', label: '未录入' },
  { value: 'active', label: '已录入' },
  { value: 'all', label: '全部客户' },
]

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatCourseDate(value) {
  if (!value) return ''
  const parts = String(value).slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value
  const month = parts[1]
  const day = parts[2]
  return `${month}月${day}日`
}

function presetRange(preset) {
  const to = new Date()
  if (preset === 'all') return { from: '', to: '' }
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  if (preset === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  if (preset === 'month') from.setDate(1)
  if (preset === 'year') from.setMonth(0, 1)
  return { from: formatDate(from), to: formatDate(to) }
}

function initialRange() {
  // 默认只看本月（和 PC 端一致）
  return presetRange('month')
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatNoteTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function daysSince(value) {
  if (!value) return '从未录入'
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  return days === 0 ? '今天' : `${days}天前`
}

function participantNames(course, group) {
  return (course.participants || [])
    .filter(item => group === 'absent' ? item.arrived === false : item.arrived && (group === 'new' ? item.identity_group === '新人' : item.identity_group !== '新人'))
    .filter(item => item.nickname)
    .map(item => ({ id: item.id, nickname: item.nickname, arrived: item.arrived }))
}

function safeFilename(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '-')
}

module.exports = function createRecordsPage(mode) { return {
  noop() {},
  data: {
    activeTab: mode,
    loading: true,
    exporting: false,
    contentExpanded: false,
    teachers: [],
    teacherIndex: 0,
    teacherName: '',
    teacherId: '',
    courseTypes: COURSE_TYPES,
    courseTypeIndex: 0,
    courseRangePresets: COURSE_RANGE_PRESETS,
    courseRangePreset: 'month',
    courseDateFrom: initialRange().from,
    courseDateTo: initialRange().to,
    followUpFilters: FOLLOW_UP_FILTERS,
    followUpFilterIndex: 0,
    followUpDays: 30,
    includeCustomerInfo: false,
    includeFollowUp: true,
    summaryCards: [],
    courseRecords: [],
    coursePage: 1,
    courseTotal: 0,
    courseHasMore: false,
    courseLoadingMore: false,
    // 课程记录页：课程列表 / 复盘记录两个子页签（与 PC 一致）
    courseViewTab: 'courses',
    reviewRecords: [],
    reviewExpanded: {},
    // 「参与者」子页签：自己课程的全部参与者 + 当天的来访需求/客户信息/跟进点
    participantRecords: [],
    participantGroups: [],
    participantTotalParticipants: 0,
    participantPage: 1,
    participantTotal: 0,
    participantHasMore: false,
    participantLoading: false,
    participantEditorLoading: false,
    feedbackOptions: [],
    feedbackIndex: 0,
    participantKeyword: '',
    participantSearchKeyword: '',
    participantFiltersExpanded: false,
    participantMemberType: '',
    participantMemberTypes: [{ value: '', label: '全部客户身份' }],
    participantMemberTypeIndex: 0,
    participantIdentityGroup: '',
    participantIdentityOptions: [{ value: '', label: '全部人员' }, { value: '新人', label: '新人' }, { value: '老人', label: '老人' }],
    participantIdentityIndex: 0,
    participantEditing: null,
    participantDraft: '',
    participantMyNoteId: '',
    participantSaving: false,
    followUpRecords: [],
    followUpPage: 1,
    followUpTotal: 0,
    followUpHasMore: false,
  },

  async onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission(mode === 'courses' ? 'course-statistics' : 'service-teacher')) {
      wx.showToast({ title: '暂无页面权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    if (getApp().trackUsagePage) getApp().trackUsagePage(mode === 'courses' ? '/pages/course-records/index' : '/pages/service-teachers/index')
    await this.loadMetadata()
  },

  async onPullDownRefresh() {
    await this.loadActiveData(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.activeTab === 'follow-ups' && this.data.followUpHasMore && !this.data.loading) {
      this.loadFollowUps(false)
    } else if (this.data.activeTab === 'courses' && this.data.courseViewTab === 'participants' && this.data.participantHasMore && !this.data.participantLoading) {
      this.loadParticipants(false)
    } else if (this.data.activeTab === 'courses' && this.data.courseViewTab !== 'participants' && this.data.courseHasMore && !this.data.loading && !this.data.courseLoadingMore) {
      this.loadCourses(false)
    }
  },

  async loadMetadata() {
    const isCurrent = beginRead(this, 'metadata')
    this.setData({ loading: true, loadError: '' })
    try {
      const metadata = await serviceTeacherApi.metadata(mode === 'courses')
      if (!isCurrent()) return
      const optionMap = {}
      ;(metadata.teacher_options || []).forEach(item => { optionMap[item.name] = item.customer_id || '' })
      const teachers = mode === 'courses'
        ? (metadata.teacher_options || []).map(item => ({ name: item.name, customerId: item.customer_id }))
        : (metadata.teachers || []).map(name => ({ name, customerId: optionMap[name] || '' }))
      const teacherIndex = Math.max(0, teachers.findIndex(item => item.name === metadata.current_teacher))
      const selected = teachers[teacherIndex] || { name: '', customerId: '' }
      this.setData({
        teachers,
        teacherIndex,
        teacherName: selected.name,
        teacherId: selected.customerId,
      })
      await this.loadActiveData(true)
    } catch (error) {
      if (isCurrent()) this.setData({ loading: false, loadError: error.message || '老师选项加载失败，请重试' })
    }
  },

  loadActiveData(reset) {
    invalidateRead(this, 'followUps')
    this._courseRequestId = (this._courseRequestId || 0) + 1
    this._participantRequestId = (this._participantRequestId || 0) + 1
    return this.data.activeTab === 'courses'
      ? (this.data.courseViewTab === 'participants' ? this.loadParticipants(true) : this.loadCourses(reset))
      : this.loadFollowUps(reset)
  },

  async loadCourses(reset = true) {
    if (!this.data.teacherName || !this.data.teacherId) {
      this._courseRequestId = (this._courseRequestId || 0) + 1
      this.setData({ loading: false, courseLoadingMore: false, courseRecords: [], reviewRecords: [], courseTotal: 0, courseHasMore: false, summaryCards: [] })
      return
    }
    if (!reset && (this.data.loading || this.data.courseLoadingMore)) return
    const requestId = (this._courseRequestId || 0) + 1
    this._courseRequestId = requestId
    const page = reset ? 1 : this.data.coursePage + 1
    this.setData(reset ? { loading: true, loadError: '', courseLoadingMore: false } : { loadError: '', courseLoadingMore: true })
    try {
      const selectedType = this.data.courseTypes[this.data.courseTypeIndex] || COURSE_TYPES[0]
      const result = await serviceTeacherApi.courses({
        date_from: this.data.courseDateFrom,
        date_to: this.data.courseDateTo,
        all_dates: this.data.courseRangePreset === 'all',
        granularity: 'day',
        activity_type: selectedType.value,
        teacher_id: this.data.teacherId,
        mobile_view: this.data.courseViewTab,
        page,
        page_size: 20,
      })
      if (requestId !== this._courseRequestId) return
      const totals = (result.statistics || []).reduce((summary, item) => ({
        courseCount: summary.courseCount + Number(item.course_count || 0),
        classHours: summary.classHours + Number(item.class_hours || 0),
        participantCount: summary.participantCount + Number(item.participant_count || 0) + Number(item.owner_count || 0),
      }), { courseCount: 0, classHours: 0, participantCount: 0 })
      const activityTypes = [{ value: 'all', label: '全部课程' }].concat(result.activity_types || COURSE_TYPES.slice(1))
      const records = (result.courses || []).map(course => {
        const { participants, ...rest } = course
        return {
          ...rest,
          displayDate: formatCourseDate(course.date),
          timeText: course.start_time ? `${course.start_time}${course.end_time ? `~${course.end_time}` : ''}` : '—',
          teacherText: (course.teachers || []).join('、') || '—',
          activityTypeText: course.activity_type_label === '沙龙活动'
            ? (course.course_subtype || course.course_type || '')
            : (course.activity_type_label || ''),
          newNames: participantNames(course, 'new'),
          oldNames: participantNames(course, 'old'),
          absentNames: participantNames(course, 'absent'),
        }
      })
      const listKey = this.data.courseViewTab === 'reviews' ? 'reviewRecords' : 'courseRecords'
      const list = listKey === 'reviewRecords'
        ? records.map(course => ({ ...course, reviewText: (course.course_review || '').trim() }))
        : records
      const existingCount = reset ? 0 : this.data[listKey].length
      const update = {
        loading: false,
        courseLoadingMore: false,
        courseTypes: activityTypes,
        coursePage: page,
        courseTotal: Number(result.total || 0),
        courseHasMore: existingCount + list.length < Number(result.total || 0),
        summaryCards: [
          { label: '课程数', value: totals.courseCount, unit: '场' },
          { label: '课时数', value: totals.classHours, unit: '课时' },
          { label: '服务总人次', value: totals.participantCount, unit: '人次' },
        ],
      }
      if (reset) {
        update[listKey] = list
        update[listKey === 'reviewRecords' ? 'courseRecords' : 'reviewRecords'] = []
      } else {
        list.forEach((record, index) => { update[`${listKey}[${existingCount + index}]`] = record })
      }
      this.setData(update)
    } catch (error) {
      if (requestId === this._courseRequestId) this.setData({ loading: false, courseLoadingMore: false, loadError: error.message || '课程加载失败，请重试' })
    }
  },

  currentFollowUpDefinition() {
    if (this.data.includeCustomerInfo && this.data.includeFollowUp) return 'both'
    if (this.data.includeCustomerInfo) return 'customer_info'
    if (this.data.includeFollowUp) return 'follow_up'
    return 'none'
  },

  async loadFollowUps(reset) {
    const teacherName = this.data.teacherName
    const isCurrent = beginRead(this, 'followUps', () => teacherName === this.data.teacherName)
    if (!this.data.teacherName) {
      this.setData({ loading: false, followUpRecords: [], summaryCards: [] })
      return
    }
    const page = reset ? 1 : this.data.followUpPage + 1
    this.setData({ loading: true, loadError: '' })
    try {
      const filter = this.data.followUpFilters[this.data.followUpFilterIndex] || FOLLOW_UP_FILTERS[0]
      const definition = this.currentFollowUpDefinition()
      const result = await serviceTeacherApi.list({
        service_teacher: this.data.teacherName,
        follow_up_filter: filter.value,
        follow_up_definition: definition,
        follow_up_days: this.data.followUpDays,
        page,
        page_size: 20,
      })
      if (!isCurrent()) return
      const records = (result.items || []).map(item => ({
        ...item,
        customerInfoAttribution: item.latest_customer_info_content ? item.latest_customer_info_by || '未知' : '',
        followUpAttribution: item.latest_follow_up_content ? item.latest_follow_up_by || '未知' : '',
        displayName: item.nickname || item.name || '—',
        customerInfoAtText: formatDateTime(item.latest_customer_info_at),
        followUpAtText: formatDateTime(item.latest_follow_up_at),
        lastAtText: formatDateTime(item.last_follow_up_at),
        distanceText: daysSince(item.last_follow_up_at),
        isActive: item.is_active === undefined ? item.is_active_30 : item.is_active,
      }))
      const days = this.data.followUpDays
      const labels = definition === 'both'
        ? [`近${days}天两项均录入`, `近${days}天存在未录入`]
        : definition === 'customer_info'
          ? [`近${days}天已录入客户信息`, `近${days}天未录入客户信息`]
          : definition === 'follow_up'
            ? [`近${days}天已录入跟进点`, `近${days}天未录入跟进点`]
            : [`近${days}天有任一录入`, `近${days}天无任何录入`]
      const list = reset ? records : this.data.followUpRecords.concat(records)
      this.setData({
        loading: false,
        followUpRecords: list,
        followUpPage: page,
        followUpTotal: result.total || 0,
        followUpHasMore: list.length < Number(result.total || 0),
        summaryCards: [
          { label: '负责客户', value: result.summary.total || 0, unit: '人' },
          { label: labels[0], value: result.summary.active === undefined ? (result.summary.active_30 || 0) : result.summary.active, unit: '人' },
          { label: labels[1], value: result.summary.inactive === undefined ? (result.summary.inactive_30 || 0) : result.summary.inactive, unit: '人' },
        ],
      })
    } catch (error) {
      if (isCurrent()) this.setData({ loading: false, loadError: error.message || '跟进记录加载失败，请重试' })
    }
  },

  retryLoad() { return this.data.teachers.length ? this.loadActiveData(true) : this.loadMetadata() },
  onUnload() {
    disposeReads(this)
    clearTimeout(this._participantKeywordTimer)
    this._courseRequestId = (this._courseRequestId || 0) + 1
    this._participantRequestId = (this._participantRequestId || 0) + 1
  },


  onTeacherChange(event) {
    const teacherIndex = Number(event.detail.value)
    const selected = this.data.teachers[teacherIndex] || { name: '', customerId: '' }
    this.setData({ teacherIndex, teacherName: selected.name, teacherId: selected.customerId }, () => this.loadActiveData(true))
  },

  onCourseTypeChange(event) {
    this.setData({ courseTypeIndex: Number(event.detail.value) }, () => this.loadActiveData(true))
  },

  onDateFromChange(event) {
    this.setData({ courseRangePreset: 'custom', courseDateFrom: event.detail.value }, () => this.loadActiveData(true))
  },

  onDateToChange(event) {
    this.setData({ courseRangePreset: 'custom', courseDateTo: event.detail.value }, () => this.loadActiveData(true))
  },

  onCourseRangePresetTap(event) {
    const courseRangePreset = event.currentTarget.dataset.value
    const range = presetRange(courseRangePreset)
    this.setData({
      courseRangePreset,
      courseDateFrom: range.from,
      courseDateTo: range.to,
    }, () => this.loadActiveData(true))
  },

  onFollowUpFilterChange(event) {
    this.setData({ followUpFilterIndex: Number(event.detail.value) }, () => this.loadFollowUps(true))
  },

  onFollowUpDaysChange(event) {
    const followUpDays = Math.min(3650, Math.max(1, parseInt(event.detail.value, 10) || 30))
    this.setData({ followUpDays }, () => this.loadFollowUps(true))
  },

  onDefinitionTap(event) {
    const definition = event.currentTarget.dataset.definition
    if (definition === 'customer_info') {
      this.setData({ includeCustomerInfo: !this.data.includeCustomerInfo }, () => this.loadFollowUps(true))
      return
    }
    this.setData({ includeFollowUp: !this.data.includeFollowUp }, () => this.loadFollowUps(true))
  },

  onToggleContent() {
    this.setData({ contentExpanded: !this.data.contentExpanded })
  },

  // 课程记录页：切「课程记录 / 复盘记录」
  onCourseViewTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (tab === this.data.courseViewTab) return
    this._courseRequestId = (this._courseRequestId || 0) + 1
    this._participantRequestId = (this._participantRequestId || 0) + 1
    this.setData({ courseViewTab: tab, loading: false, courseLoadingMore: false, participantLoading: false })
    if (tab === 'participants') this.loadParticipants(true)
    else this.loadCourses(true)
  },

  onToggleParticipantFilters() {
    this.setData({ participantFiltersExpanded: !this.data.participantFiltersExpanded })
  },

  // ---- 参与者：昵称/姓名、客户身份、新人老人 三个筛选，时间跟上面的课程周期一致 ----
  formatParticipant(row) {
    const parts = String(row.course_date || '').split('-')
    return {
      ...row,
      visit_need: recordText(row.visit_need_entries, row.visit_need),
      customer_info: recordText(row.customer_info_entries, row.customer_info),
      follow_up: recordText(row.follow_up_entries, row.follow_up),
      dateText: parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : (row.course_date || ''),
      identityText: row.member_type || row.identity_group || '',
      participantRoleText: row.participant_role === '案主' ? '案主' : '',
    }
  },

  formatParticipantGroup(group) {
    const parts = String(group.course_date || '').split('-')
    const activityTypeLabel = group.activity_type_label || ''
    const participants = group.participants || []
    const firstParticipant = participants[0] || {}
    const courseSubtype = group.course_subtype || firstParticipant.course_subtype || firstParticipant.course_type || ''
    return {
      ...group,
      dateText: parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : (group.course_date || ''),
      participantCount: participants.filter(item => item.arrived).length,
      activityTypeText: activityTypeLabel === '沙龙活动'
        ? courseSubtype
        : activityTypeLabel,
      participants: participants
        .slice()
        .sort((left, right) => Number(right.participant_role === '案主') - Number(left.participant_role === '案主'))
        .map(item => this.formatParticipant(item)),
    }
  },

  async loadParticipants(reset) {
    if (!this.data.teacherId) {
      this._participantRequestId = (this._participantRequestId || 0) + 1
      this.setData({ participantGroups: [], participantTotal: 0, participantTotalParticipants: 0, participantHasMore: false, participantLoading: false })
      return
    }
    if (this.data.participantLoading && !reset) return
    const requestId = (this._participantRequestId || 0) + 1
    this._participantRequestId = requestId
    const page = reset ? 1 : this.data.participantPage + 1
    this.setData({ participantLoading: true, loadError: '' })
    try {
      const selectedType = this.data.courseTypes[this.data.courseTypeIndex] || COURSE_TYPES[0]
      const result = await serviceTeacherApi.courseParticipants({
        teacher_id: this.data.teacherId,
        date_from: this.data.courseDateFrom,
        date_to: this.data.courseDateTo,
        all_dates: this.data.courseRangePreset === 'all',
        activity_type: selectedType.value,
        keyword: this.data.participantSearchKeyword,
        member_type: this.data.participantMemberType,
        identity_group: this.data.participantIdentityGroup,
        page,
        page_size: 20,
      })
      if (requestId !== this._participantRequestId) return
      // 兼容旧后端：返回的是「一行一个参与者」的平铺结构时，按课程重新包成分组
      const rawItems = result.items || []
      const grouped = rawItems.length && rawItems[0] && rawItems[0].participants
        ? rawItems
        : (() => {
            const map = {}
            const list = []
            rawItems.forEach(row => {
              const key = row.course_id || `${row.course_date}|${row.course_name}`
              if (!map[key]) { map[key] = { course_id: key, course_date: row.course_date, course_name: row.course_name, activity_type_label: row.activity_type_label, course_subtype: row.course_subtype, participants: [] }; list.push(map[key]) }
              map[key].participants.push(row)
            })
            return list
          })()
      const groups = grouped.map(group => this.formatParticipantGroup(group))
      const existingCount = reset ? 0 : this.data.participantGroups.length
      const update = {
        participantPage: result.page || page,
        participantTotal: result.total || 0,
        participantTotalParticipants: result.total_participants || 0,
        participantHasMore: existingCount + groups.length < (result.total || 0),
        participantMemberTypes: [{ value: '', label: '全部客户身份' }].concat((result.member_types || []).map(value => ({ value, label: value }))),
      }
      if (reset) update.participantGroups = groups
      else groups.forEach((group, index) => { update[`participantGroups[${existingCount + index}]`] = group })
      this.setData(update)
    } catch (e) {
      if (requestId === this._participantRequestId) this.setData({ loadError: e.message || '参与者加载失败，请重试' })
    } finally {
      if (requestId === this._participantRequestId) this.setData({ participantLoading: false })
    }
  },

  onParticipantKeyword(event) { this.setData({ participantKeyword: event.detail.value }) },
  // 输入即查（防抖 400ms），不用再点按钮
  onParticipantKeywordDebounced(event) {
    this.setData({ participantKeyword: event.detail.value })
    if (this._participantKeywordTimer) clearTimeout(this._participantKeywordTimer)
    this._participantKeywordTimer = setTimeout(() => {
      this.setData({ participantSearchKeyword: (this.data.participantKeyword || '').trim() })
      this.loadParticipants(true)
    }, 400)
  },
  onParticipantSearch() {
    this.setData({ participantSearchKeyword: (this.data.participantKeyword || '').trim() })
    this.loadParticipants(true)
  },
  onParticipantReset() {
    this.setData({
      participantKeyword: '', participantSearchKeyword: '',
      participantMemberType: '', participantMemberTypeIndex: 0,
      participantIdentityGroup: '', participantIdentityIndex: 0,
    })
    this.loadParticipants(true)
  },
  onParticipantMemberType(event) {
    const index = Number(event.detail.value)
    this.setData({ participantMemberTypeIndex: index, participantMemberType: this.data.participantMemberTypes[index].value })
    this.loadParticipants(true)
  },
  onParticipantIdentity(event) {
    const index = Number(event.detail.value)
    this.setData({ participantIdentityIndex: index, participantIdentityGroup: this.data.participantIdentityOptions[index].value })
    this.loadParticipants(true)
  },
  onParticipantCustomer(event) {
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` })
  },
  /** 点某一段内容：显示所有人填写的内容，下面填我自己那份 */
  async onParticipantOpenEdit(event) {
    const isCurrent = beginRead(this, 'participantEditor')
    const groupIndex = Number(event.currentTarget.dataset.group)
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const group = this.data.participantGroups[groupIndex]
    const row = group && group.participants[index]
    if (!row) return
    const titles = { visit_need: '来访需求', customer_info: '客户信息', follow_up: '跟进点' }
    const placeholders = { visit_need: '填写来访需求...', customer_info: '填写客户信息...', follow_up: '填写跟进点...' }
    const noteEntries = row[`${field}_entries`] || []
    const hasReference = noteEntries.length
      ? noteEntries.some(entry => String(entry.content || '').trim())
      : Boolean(String(row[field] || '').trim())
    this.setData({
      participantEditing: {
        groupIndex, index, field, visitId: row.visit_id,
        title: titles[field] || '内容',
        placeholder: placeholders[field] || '填写内容...',
        hasReference,
        nickname: row.nickname, dateText: row.dateText, courseName: row.course_name,
        all: row[field] || '',
        allEntries: noteEntries.map(entry => ({ ...entry, timeText: formatNoteTime(entry.at) })),
      },
      participantDraft: '',
      participantMyNoteId: '',
      participantEditorLoading: !!row.visit_id,
    })
    if (!row.visit_id) return
    try {
      const [mine, people] = await Promise.all([
        customerFollowUpApi.myNote(row.visit_id, field),
        customerFollowUpApi.feedbackPeople(),
      ])
      if (!isCurrent() || !this.data.participantEditing || this.data.participantEditing.visitId !== row.visit_id || this.data.participantEditing.field !== field) return
      const picked = pickerData(people, mine)
      this.setData({
        participantMyNoteId: (mine && mine.id) || '',
        participantDraft: (mine && mine.content) || '',
        feedbackOptions: picked.options,
        feedbackIndex: picked.index,
      })
    } catch (e) {
      if (isCurrent()) {
        wx.showToast({ title: '记录加载失败，请重新打开', icon: 'none' })
        this.setData({ participantEditing: null })
      }
    } finally { if (isCurrent()) this.setData({ participantEditorLoading: false }) }
  },
  onFeedbackChange(event) { this.setData({ feedbackIndex: Number(event.detail.value) }) },
  onParticipantDraft(event) { this.setData({ participantDraft: event.detail.value }) },
  closeParticipantEdit() {
    if (!this.data.participantSaving) {
      invalidateRead(this, 'participantEditor')
      this.setData({ participantEditing: null, participantEditorLoading: false })
    }
  },
  async saveParticipantEdit() {
    const editing = this.data.participantEditing
    const content = (this.data.participantDraft || '').trim()
    if (!editing || !content) { wx.showToast({ title: '内容不能为空', icon: 'none' }); return }
    if (this.data.participantSaving || this.data.participantEditorLoading) return
    this.setData({ participantSaving: true })
    try {
      const attribution = attributionFromPicker(this.data.feedbackOptions, this.data.feedbackIndex)
      if (this.data.participantMyNoteId) await customerFollowUpApi.update(this.data.participantMyNoteId, content, attribution)
      else await customerFollowUpApi.create(editing.visitId, editing.field, content, attribution)
      this.setData({ participantEditing: null, participantDraft: '' })
      wx.showToast({ title: '已保存', icon: 'none' })
      this.loadParticipants(true)
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ participantSaving: false })
    }
  },

  // 复盘内容太长时按行展开/缩略
  onToggleReview(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ [`reviewExpanded.${id}`]: !this.data.reviewExpanded[id] })
  },

  onCustomerTap(event) {
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${event.currentTarget.dataset.id}` })
  },

  async onExport() {
    if (this.data.exporting || !this.data.teacherName) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在导出...' })
    try {
      let fileData
      let filename
      if (this.data.activeTab === 'courses') {
        const selectedType = this.data.courseTypes[this.data.courseTypeIndex] || COURSE_TYPES[0]
        fileData = await serviceTeacherApi.exportCourses({
          service_teacher: this.data.teacherName,
          teacher_id: this.data.teacherId,
          date_from: this.data.courseDateFrom,
          date_to: this.data.courseDateTo,
          all_dates: this.data.courseRangePreset === 'all',
          activity_type: selectedType.value,
        })
        filename = `服务老师课程记录_${safeFilename(this.data.teacherName)}_${Date.now()}.xlsx`
      } else {
        const filter = this.data.followUpFilters[this.data.followUpFilterIndex] || FOLLOW_UP_FILTERS[0]
        fileData = await serviceTeacherApi.exportFollowUps({
          service_teacher: this.data.teacherName,
          follow_up_filter: filter.value,
          follow_up_definition: this.currentFollowUpDefinition(),
          follow_up_days: this.data.followUpDays,
        })
        filename = `服务老师跟进记录_${safeFilename(this.data.teacherName)}_${Date.now()}.xlsx`
      }
      const filePath = `${wx.env.USER_DATA_PATH}/${filename}`
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({
        filePath,
        data: fileData,
        encoding: 'binary',
        success: resolve,
        fail: reject,
      }))
      wx.hideLoading()
      await new Promise((resolve, reject) => wx.openDocument({
        filePath,
        fileType: 'xlsx',
        showMenu: true,
        success: resolve,
        fail: reject,
      }))
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: (error && error.message) || '导出失败', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  },
} }
