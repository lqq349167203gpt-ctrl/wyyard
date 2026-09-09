const { serviceTeacherApi } = require('../../utils/api')

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
  return presetRange('month')
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function daysSince(value) {
  if (!value) return '从未录入'
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  return days === 0 ? '今天' : `${days}天前`
}

function participantNames(course, group) {
  return (course.participants || [])
    .filter(item => group === 'new' ? item.identity_group === '新人' : item.identity_group !== '新人')
    .map(item => item.nickname)
    .filter(Boolean)
}

function safeFilename(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '-')
}

Page({
  data: {
    activeTab: 'courses',
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
    followUpRecords: [],
    followUpPage: 1,
    followUpTotal: 0,
    followUpHasMore: false,
  },

  async onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('service-teacher')) {
      wx.showToast({ title: '暂无服务老师权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/service-teachers/index')
    await this.loadMetadata()
  },

  async onPullDownRefresh() {
    await this.loadActiveData(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.activeTab === 'follow-ups' && this.data.followUpHasMore && !this.data.loading) {
      this.loadFollowUps(false)
    }
  },

  async loadMetadata() {
    this.setData({ loading: true })
    try {
      const metadata = await serviceTeacherApi.metadata()
      const optionMap = {}
      ;(metadata.teacher_options || []).forEach(item => { optionMap[item.name] = item.customer_id || '' })
      const teachers = (metadata.teachers || []).map(name => ({ name, customerId: optionMap[name] || '' }))
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
      this.setData({ loading: false })
    }
  },

  loadActiveData(reset) {
    return this.data.activeTab === 'courses' ? this.loadCourses() : this.loadFollowUps(reset)
  },

  async loadCourses() {
    if (!this.data.teacherName || !this.data.teacherId) {
      this.setData({ loading: false, courseRecords: [], summaryCards: [] })
      return
    }
    this.setData({ loading: true })
    try {
      const selectedType = this.data.courseTypes[this.data.courseTypeIndex] || COURSE_TYPES[0]
      const result = await serviceTeacherApi.courses({
        date_from: this.data.courseDateFrom,
        date_to: this.data.courseDateTo,
        all_dates: this.data.courseRangePreset === 'all',
        granularity: 'day',
        activity_type: selectedType.value,
        teacher_id: this.data.teacherId,
      })
      const totals = (result.statistics || []).reduce((summary, item) => ({
        courseCount: summary.courseCount + Number(item.course_count || 0),
        classHours: summary.classHours + Number(item.class_hours || 0),
        participantCount: summary.participantCount + Number(item.participant_count || 0),
      }), { courseCount: 0, classHours: 0, participantCount: 0 })
      const activityTypes = [{ value: 'all', label: '全部课程' }].concat(result.activity_types || COURSE_TYPES.slice(1))
      const records = (result.courses || []).map(course => ({
        ...course,
        timeText: course.start_time ? `${course.start_time}${course.end_time ? `~${course.end_time}` : ''}` : '—',
        teacherText: (course.teachers || []).join('、') || '—',
        newNames: participantNames(course, 'new'),
        oldNames: participantNames(course, 'old'),
      }))
      this.setData({
        loading: false,
        courseTypes: activityTypes,
        courseRecords: records,
        summaryCards: [
          { label: '课程数', value: totals.courseCount, unit: '场' },
          { label: '课时数', value: totals.classHours, unit: '课时' },
          { label: '参与人次', value: totals.participantCount, unit: '人次' },
        ],
      })
    } catch (error) {
      this.setData({ loading: false, courseRecords: [], summaryCards: [] })
    }
  },

  currentFollowUpDefinition() {
    if (this.data.includeCustomerInfo && this.data.includeFollowUp) return 'both'
    if (this.data.includeCustomerInfo) return 'customer_info'
    if (this.data.includeFollowUp) return 'follow_up'
    return 'none'
  },

  async loadFollowUps(reset) {
    if (!this.data.teacherName) {
      this.setData({ loading: false, followUpRecords: [], summaryCards: [] })
      return
    }
    const page = reset ? 1 : this.data.followUpPage + 1
    this.setData({ loading: true })
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
      const records = (result.items || []).map(item => ({
        ...item,
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
      this.setData({ loading: false })
    }
  },

  onTabTap(event) {
    const activeTab = event.currentTarget.dataset.tab
    if (activeTab === this.data.activeTab) return
    this.setData({ activeTab, summaryCards: [], contentExpanded: false }, () => this.loadActiveData(true))
  },

  onTeacherChange(event) {
    const teacherIndex = Number(event.detail.value)
    const selected = this.data.teachers[teacherIndex] || { name: '', customerId: '' }
    this.setData({ teacherIndex, teacherName: selected.name, teacherId: selected.customerId }, () => this.loadActiveData(true))
  },

  onCourseTypeChange(event) {
    this.setData({ courseTypeIndex: Number(event.detail.value) }, () => this.loadCourses())
  },

  onDateFromChange(event) {
    this.setData({ courseRangePreset: 'custom', courseDateFrom: event.detail.value }, () => this.loadCourses())
  },

  onDateToChange(event) {
    this.setData({ courseRangePreset: 'custom', courseDateTo: event.detail.value }, () => this.loadCourses())
  },

  onCourseRangePresetTap(event) {
    const courseRangePreset = event.currentTarget.dataset.value
    const range = presetRange(courseRangePreset)
    this.setData({
      courseRangePreset,
      courseDateFrom: range.from,
      courseDateTo: range.to,
    }, () => this.loadCourses())
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
})
