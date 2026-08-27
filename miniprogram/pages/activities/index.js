const { classRecordApi, spaceApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')
const { BADGE_COLORS } = require('../../utils/activity-constants')
const { canEditRecord } = require('../../utils/record-ownership')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(n) { return n < 10 ? '0' + n : '' + n }

function buildCalendar(year, month, selectedDate, calendarCounts) {
  const today = formatDate(new Date())
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7
  const days = []

  for (let i = 0; i < totalCells; i++) {
    let day, date, isCurrent
    if (i < firstDay) {
      day = daysInPrev - firstDay + 1 + i
      const m = month === 0 ? 12 : month
      const y = month === 0 ? year - 1 : year
      date = `${y}-${pad(m)}-${pad(day)}`
      isCurrent = false
    } else if (i >= firstDay + daysInMonth) {
      day = i - firstDay - daysInMonth + 1
      const m = month === 11 ? 1 : month + 2
      const y = month === 11 ? year + 1 : year
      date = `${y}-${pad(m)}-${pad(day)}`
      isCurrent = false
    } else {
      day = i - firstDay + 1
      date = `${year}-${pad(month + 1)}-${pad(day)}`
      isCurrent = true
    }
    days.push({
      day,
      date,
      isCurrent,
      isSelected: date === selectedDate,
      isToday: date === today,
      count: (calendarCounts || {})[date] || 0,
    })
  }
  return days
}

// 按时段分组：上午 <12:00 / 下午 12:00-18:00 / 晚上 >=18:00 / 其他（无时间）
function groupByTimeSlot(records) {
  const slots = [
    { label: '上午', items: [] },
    { label: '下午', items: [] },
    { label: '晚上', items: [] },
    { label: '其他', items: [] },
  ]
  records.forEach(r => {
    const m = /^(\d{1,2})/.exec(r.startTime || '')
    const h = m ? parseInt(m[1], 10) : NaN
    if (isNaN(h)) slots[3].items.push(r)
    else if (h < 12) slots[0].items.push(r)
    else if (h < 18) slots[1].items.push(r)
    else slots[2].items.push(r)
  })
  return slots.filter(s => s.items.length > 0)
}

Page({
  data: {
    hasPagePermission: true,
    currentDate: '',
    currentDateShort: '',
    currentWeekday: '',
    calendarExpanded: false,
    calYear: 0,
    calMonth: 0,
    calendarDays: [],
    weekdays: WEEKDAYS,
    spaces: [],
    spaceIndex: 0,
    spaceId: '',
    currentSpaceName: '',
    records: [],
    timeGroups: [],
    participants: [],
    participantText: '',
    loading: true,
  },

  async onLoad(options) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('daily-activities')) {
      this.setData({ hasPagePermission: false })
      return
    }
    const date = options.date || wx.getStorageSync('activity_selected_date') || formatDate(new Date())
    const d = new Date(date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
    })
    await this.loadSpaces()
    this.loadData()
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  _formatDateShort(date) {
    const d = new Date(date)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  // ---------- 日历 ----------

  onCalendarToggle() {
    if (this.data.calendarExpanded) {
      this.setData({ calendarExpanded: false })
    } else {
      const counts = this._calendarCounts || {}
      this.setData({
        calendarExpanded: true,
        calendarDays: buildCalendar(this.data.calYear, this.data.calMonth, this.data.currentDate, counts),
      })
    }
  },

  onCalendarClose() {
    this.setData({ calendarExpanded: false })
  },

  onPrevMonth() {
    let { calYear, calMonth } = this.data
    calMonth--
    if (calMonth < 0) { calMonth = 11; calYear-- }
    const counts = this._calendarCounts || {}
    this.setData({
      calYear, calMonth,
      calendarDays: buildCalendar(calYear, calMonth, this.data.currentDate, counts),
    })
  },

  onNextMonth() {
    let { calYear, calMonth } = this.data
    calMonth++
    if (calMonth > 11) { calMonth = 0; calYear++ }
    const counts = this._calendarCounts || {}
    this.setData({
      calYear, calMonth,
      calendarDays: buildCalendar(calYear, calMonth, this.data.currentDate, counts),
    })
  },

  onCalendarDayTap(e) {
    const date = e.currentTarget.dataset.date
    const d = new Date(date)
    const counts = this._calendarCounts || {}
    wx.setStorageSync('activity_selected_date', date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      calendarExpanded: false,
      calendarDays: buildCalendar(d.getFullYear(), d.getMonth(), date, counts),
    })
    this.loadData()
  },

  // ---------- 空间 ----------

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      if (spaces.length === 0) return
      const savedIndex = wx.getStorageSync('activity_space_index') || 0
      const spaceIndex = Math.min(savedIndex, spaces.length - 1)
      const space = spaces[spaceIndex]
      this.setData({
        spaces, spaceIndex,
        spaceId: space?.id || '',
        currentSpaceName: space?.name || '',
      })
    } catch (e) {
      console.error('加载空间失败:', e)
    }
  },

  onSpaceChange(e) {
    const index = e.detail.value
    const space = this.data.spaces[index]
    this.setData({
      spaceIndex: index,
      spaceId: space?.id || '',
      currentSpaceName: space?.name || '',
    })
    wx.setStorageSync('activity_space_index', index)
    this.loadData(space?.id || '')
  },

  // ---------- 数据 ----------

  async loadData(spaceId) {
    const requestSeq = (this._loadSeq || 0) + 1
    this._loadSeq = requestSeq
    const requestedDate = this.data.currentDate
    this.setData({ loading: true })
    try {
      const sid = spaceId !== undefined ? spaceId : this.data.spaceId
      const dashboard = await classRecordApi.dashboard(requestedDate, sid || undefined)
      if (requestSeq !== this._loadSeq || requestedDate !== this.data.currentDate || sid !== this.data.spaceId) return
      const records = []
      const rawMap = {}

      if (dashboard.class_records) {
        dashboard.class_records.forEach(r => {
          const badge = r.course_type || '沙龙'
          rawMap[`class_record_${r.id}`] = r
          records.push({
            id: r.id, badge,
            name: r.activity_name || r.course_name || '',
            color: BADGE_COLORS[badge] || BADGE_COLORS['沙龙'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || []).join('、'),
            deductionCount: r.membership_deduction_count,
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'class_record',
            isPublicWelfare: r.is_public_welfare || false,
            isPublished: r.is_published || false,
          })
        })
      }

      if (dashboard.gcs_sessions) {
        dashboard.gcs_sessions.forEach(r => {
          const owner = r.owner_name || ''
          rawMap[`group_case_${r.id}`] = r
          records.push({
            id: r.id, badge: '觉醒',
            name: r.name || (owner ? `觉醒游戏·${owner}` : '觉醒游戏'),
            color: BADGE_COLORS['觉醒'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || [])[0] || r.achiever_name || r.host_name || '',
            deductionCount: r.membership_deduction_count,
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'group_case',
            isPublished: r.is_published || false,
          })
        })
      }

      if (dashboard.ers_sessions) {
        dashboard.ers_sessions.forEach(r => {
          const achiever = r.achiever_name || ''
          rawMap[`emotional_release_${r.id}`] = r
          records.push({
            id: r.id, badge: '情绪释放',
            name: r.name || (achiever ? `情绪释放·${achiever}` : '情绪释放'),
            color: BADGE_COLORS['情绪释放'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || [])[0] || r.achiever_name || r.host_name || '',
            deductionCount: r.membership_deduction_count,
            participants: 0,
            space: r.space_name || '',
            source: 'emotional_release',
            isPublished: r.is_published || false,
          })
        })
      }

      if (dashboard.eks_sessions) {
        dashboard.eks_sessions.forEach(r => {
          const teacher = (r.teacher_names || [])[0] || ''
          rawMap[`energy_knot_${r.id}`] = r
          records.push({
            id: r.id, badge: '能量结',
            name: r.name || (teacher ? `能量结·${teacher}` : '能量结'),
            color: BADGE_COLORS['能量结'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || []).join('、'),
            deductionCount: r.membership_deduction_count,
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'energy_knot',
            isPublished: r.is_published || false,
          })
        })
      }

      if (dashboard.ics_sessions) {
        dashboard.ics_sessions.forEach(r => {
          rawMap[`internal_course_${r.id}`] = r
          records.push({
            id: r.id, badge: '内部课程',
            name: r.course_name || r.course_type || '',
            color: BADGE_COLORS['内部课程'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || (r.teacher_names || [])[0] || '',
            deductionCount: r.membership_deduction_count,
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'internal_course',
            isPublished: r.is_published || false,
          })
        })
      }

      records.sort((a, b) => (a.time || '').localeCompare(b.time || ''))

      // 补充列表展示字段
      records.forEach(r => {
        const parts = (r.time || '').split('-')
        r.startTime = parts[0] || ''
        r.endTime = parts.length > 1 ? parts[1] : ''
        r.key = `${r.source}_${r.id}`
        const rawRecord = rawMap[r.key] || {}
        r.canEdit = canEditRecord(rawRecord, 'activities')
        r.createdBy = rawRecord.created_by || ''
        r.displayName = r.name || r.badge
        const typeParts = []
        if (r.name) typeParts.push(r.badge)
        if (r.isPublicWelfare) typeParts.push('公益')
        r.typeText = typeParts.join(' · ')
        const metaParts = []
        if (r.teacher) metaParts.push(r.teacher)
        if (r.deductionCount > 0) metaParts.push(`扣卡 ${r.deductionCount} 次`)
        r.metaText = metaParts.join(' · ')
      })
      const timeGroups = groupByTimeSlot(records)

      // 收集当天所有参与者（去重）
      const allSources = (dashboard.class_records || [])
        .concat(dashboard.gcs_sessions || [])
        .concat(dashboard.ers_sessions || [])
        .concat(dashboard.eks_sessions || [])
        .concat(dashboard.ics_sessions || [])
      const participantSet = new Set()
      allSources.forEach(r => {
        (r.participant_names || []).forEach(name => { if (name) participantSet.add(name) })
      })
      const participants = []
      participantSet.forEach(function(v) { participants.push(v) })

      // 保存日历计数，供展开时使用
      this._calendarCounts = dashboard.calendar_counts || {}
      this._rawMap = rawMap
      this.setData({ records, timeGroups, participants, participantText: participants.join('、'), loading: false })
    } catch (e) {
      console.error('加载活动失败:', e)
      if (requestSeq === this._loadSeq) this.setData({ loading: false })
    }
  },

  // ---------- 导航 ----------

  onActivityTap(e) {
    const record = e.currentTarget.dataset.record
    if (!record || !record.id) return
    const raw = this._rawMap[`${record.source}_${record.id}`]
    getApp().globalData._selectedActivity = raw || record
    getApp().globalData._selectedActivitySource = record.source
    wx.navigateTo({ url: '/pages/activity-detail/index' })
  },

  onCreateTap() {
    const date = this.data.currentDate
    const spaceId = this.data.spaceId
    wx.navigateTo({ url: `/pages/activity-create/index?date=${date}&spaceId=${spaceId}` })
  },

  onFabLongPress() {
    wx.navigateTo({ url: `/pages/voice-chat/index?mode=activity&date=${this.data.currentDate}&spaceId=${this.data.spaceId}` })
  },
})
