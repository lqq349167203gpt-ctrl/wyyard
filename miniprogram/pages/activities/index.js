const { activityWithdrawalApi, classRecordApi, spaceApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')
const { BADGE_COLORS } = require('../../utils/activity-constants')
const { canEditRecord, isAreaViewOnly } = require('../../utils/record-ownership')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const SHARED_SCHEDULE_DATE_KEY = 'schedule_selected_date'

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

function parseLocalDate(date) {
  const parts = String(date || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null

  return new Date(parts[0], parts[1] - 1, parts[2])
}

function buildWeekPages(selectedDate, calendarCounts) {
  const selected = parseLocalDate(selectedDate)
  if (!selected) return []

  const mondayOffset = (selected.getDay() + 6) % 7
  const monday = new Date(selected)
  monday.setDate(selected.getDate() - mondayOffset)
  const selectedWeekdayIndex = mondayOffset

  return [-1, 0, 1].map(weekOffset => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const dateValue = new Date(monday)
      dateValue.setDate(monday.getDate() + weekOffset * 7 + index)
      const date = formatDate(dateValue)
      return {
        date,
        day: dateValue.getDate(),
        weekday: WEEKDAYS[dateValue.getDay()],
        count: (calendarCounts || {})[date] || 0,
        isSelected: index === selectedWeekdayIndex,
      }
    })
    return { key: `week-slot-${weekOffset + 1}`, days }
  })
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

function formatRemainingCount(count) {
  if (count === -999) return '不限次'
  if (count === null || count === undefined || count === '') return '未记录'
  return `剩 ${count} 次`
}

function buildParticipantList(raw, source, visitMap) {
  if (!raw) return []
  const withdrawnIds = new Set(raw.withdrawn_participant_ids || [])
  const visits = visitMap || {}
  const decorateParticipant = function(item) {
    const visit = visits[item.id]
    const memberType = visit && visit.member_type ? visit.member_type : '未记录'
    const remainingText = visit ? formatRemainingCount(visit.remaining_count) : '未记录'
    const inviter = visit && visit.referrer_handler ? visit.referrer_handler : '未记录'
    const needs = visit && visit.needs ? visit.needs : '未填写'
    const expectedTime = visit && visit.visit_time ? visit.visit_time : '未填写'
    const metaItems = []
    if (memberType !== '未记录') metaItems.push(memberType)
    if (remainingText !== '未记录') metaItems.push(remainingText)
    if (inviter !== '未记录') metaItems.push(`${inviter}邀约`)
    if (expectedTime !== '未填写') metaItems.push(`预计 ${expectedTime}`)
    return {
      id: item.id,
      nickname: item.nickname || item.name || '未命名客户',
      avatar: (item.nickname || item.name || '客').slice(0, 1),
      withdrawn: Boolean(item.withdrawn || withdrawnIds.has(item.id)),
      memberType,
      remainingText,
      inviter,
      needs,
      expectedTime,
      metaItems,
      hasNeeds: needs !== '未填写',
      hasVisitInfo: Boolean(visit),
    }
  }
  // dashboard 的 participants 已按当前账号“资料可见范围”过滤，不能回退到原始 ID 列表。
  const participants = (Array.isArray(raw.participants) ? raw.participants : [])
    .filter(function(item) { return item && item.id })
    .map(decorateParticipant)

  if (['group_case', 'emotional_release', 'energy_knot'].includes(source)
    && raw.owner_id
    && raw.owner_name
    && !participants.some(function(item) { return item.id === raw.owner_id })) {
    participants.unshift(decorateParticipant({
      id: raw.owner_id,
      nickname: raw.owner_name,
      withdrawn: withdrawnIds.has(raw.owner_id),
    }))
  }
  return participants
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
    weekPages: [],
    weekSwiperCurrent: 1,
    weekSwiperDuration: 260,
    dateSwitching: false,
    weekdays: WEEKDAYS,
    spaces: [],
    spaceIndex: 0,
    spaceId: '',
    currentSpaceName: '',
    records: [],
    timeGroups: [],
    participants: [],
    participantText: '',
    withdrawalCourses: [],
    withdrawalMode: 'withdraw',
    withdrawalCourseIndex: 0,
    withdrawalParticipants: [],
    withdrawalParticipantIndex: 0,
    showWithdrawal: false,
    withdrawing: false,
    showParticipantSheet: false,
    participantSheetTitle: '',
    participantSheetMeta: '',
    participantSheetList: [],
    loading: true,
    isViewOnly: false,
  },

  async onLoad(options) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('daily-activities')) {
      this.setData({ hasPagePermission: false })
      return
    }
    this.setData({ isViewOnly: isAreaViewOnly('activities') })
    const date = options.date || wx.getStorageSync(SHARED_SCHEDULE_DATE_KEY) || wx.getStorageSync('activity_selected_date') || formatDate(new Date())
    const d = parseLocalDate(date) || new Date()
    wx.setStorageSync(SHARED_SCHEDULE_DATE_KEY, date)
    wx.setStorageSync('visit_selected_date', date)
    wx.setStorageSync('activity_selected_date', date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      weekPages: buildWeekPages(date, {}),
    })
    await this.loadSpaces()
    this.loadData()
  },

  onShow() {
    if (!getApp().checkLogin()) return
    const sharedDate = wx.getStorageSync(SHARED_SCHEDULE_DATE_KEY)
    if (sharedDate && this.data.currentDate && sharedDate !== this.data.currentDate && parseLocalDate(sharedDate)) {
      this._selectDate(sharedDate)
      return
    }
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  _formatDateShort(date) {
    const d = parseLocalDate(date) || new Date()
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
    this._selectDate(date)
  },

  _selectDate(date, fromWeekSwipe = false) {
    const d = parseLocalDate(date)
    if (!d) return
    const counts = this._calendarCounts || {}
    const useSoftTransition = fromWeekSwipe && !this.data.loading && this.data.records.length > 0
    wx.setStorageSync(SHARED_SCHEDULE_DATE_KEY, date)
    wx.setStorageSync('activity_selected_date', date)
    wx.setStorageSync('visit_selected_date', date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      calendarExpanded: false,
      calendarDays: buildCalendar(d.getFullYear(), d.getMonth(), date, counts),
      weekPages: buildWeekPages(date, counts),
      weekSwiperCurrent: 1,
      dateSwitching: useSoftTransition,
    }, () => {
      if (!fromWeekSwipe) return
      wx.nextTick(() => {
        this._weekSwiperRecentering = false
        this.setData({ weekSwiperDuration: 260 })
      })
    })
    this.loadData(undefined, { silent: useSoftTransition })
  },

  onWeekSwiperChange(e) {
    const current = Number(e.detail.current)
    if (this._weekSwiperRecentering || current === 1) {
      if (this.data.weekSwiperCurrent !== current) {
        this.setData({ weekSwiperCurrent: current })
      }
      return
    }

    const selected = parseLocalDate(this.data.currentDate)
    if (!selected) return
    selected.setDate(selected.getDate() + (current === 0 ? -7 : 7))

    this._weekSwiperRecentering = true
    this.setData({ weekSwiperCurrent: current, weekSwiperDuration: 0 }, () => {
      this._selectDate(formatDate(selected), true)
    })
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

  async loadData(spaceId, options = {}) {
    const requestSeq = (this._loadSeq || 0) + 1
    this._loadSeq = requestSeq
    const requestedDate = this.data.currentDate
    if (!options.silent) this.setData({ loading: true })
    try {
      const sid = spaceId !== undefined ? spaceId : this.data.spaceId
      const dashboard = await classRecordApi.dashboard(requestedDate, sid || undefined)
      if (requestSeq !== this._loadSeq || requestedDate !== this.data.currentDate || String(sid || '') !== String(this.data.spaceId || '')) return
      const records = []
      const rawMap = {}
      const visitMap = {}
      ;(dashboard.visits || []).forEach(function(visit) {
        const customerId = visit.customer_id || ''
        if (customerId && !visitMap[customerId]) visitMap[customerId] = visit
      })
      this._visitMap = visitMap

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
            participants: r.visible_participant_count != null ? r.visible_participant_count : (r.participant_ids?.length || 0),
            space: r.space_name || '',
            source: 'class_record',
            isPublicWelfare: r.is_public_welfare || false,
            isBookClubWelfare: badge === '读书会' && !!r.is_public_welfare,
            isPublished: r.is_published || false,
          })
        })
      }

      if (dashboard.gcs_sessions) {
        dashboard.gcs_sessions.forEach(r => {
          const owner = r.owner_name || ''
          rawMap[`group_case_${r.id}`] = r
          records.push({
            id: r.id, badge: '觉醒游戏',
            name: r.name || (owner ? `觉醒游戏·${owner}` : '觉醒游戏'),
            color: BADGE_COLORS['觉醒游戏'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || [])[0] || r.achiever_name || r.host_name || '',
            deductionCount: r.membership_deduction_count,
            participants: r.visible_participant_count != null ? r.visible_participant_count : (r.participant_ids?.length || 0),
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
            participants: r.visible_participant_count != null ? r.visible_participant_count : (r.participant_ids?.length || 0),
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
            participants: r.visible_participant_count != null ? r.visible_participant_count : (r.participant_ids?.length || 0),
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
            participants: r.visible_participant_count != null ? r.visible_participant_count : (r.participant_ids?.length || 0),
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
        const rosterParticipants = buildParticipantList(rawRecord, r.source, visitMap)
        r.canEdit = canEditRecord(rawRecord, 'activities')
        r.createdBy = rawRecord.created_by || ''
        r.displayName = r.name || r.badge
        const typeParts = []
        if (r.name) typeParts.push(r.badge)
        if (r.isPublicWelfare && !r.isBookClubWelfare) typeParts.push('公益')
        r.typeText = typeParts.join(' · ')
        const metaParts = []
        if (r.teacher) metaParts.push(r.teacher)
        if (r.deductionCount > 0) metaParts.push(`扣卡 ${r.deductionCount} 次`)
        r.metaText = metaParts.join(' · ')
        r.rosterCount = rosterParticipants.length
        r.participantRosterText = rosterParticipants.length
          ? `${rosterParticipants.length} 人 · ${rosterParticipants.map(function(item) { return item.nickname }).join('、')}`
          : '0 人'
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

      const withdrawalCourses = []
      const withdrawalSources = [
        { recordType: 'class', typeLabel: '沙龙', records: dashboard.class_records || [], owner: false },
        { recordType: 'gcs', typeLabel: '觉醒游戏', records: dashboard.gcs_sessions || [], owner: true },
        { recordType: 'ers', typeLabel: '情绪释放', records: dashboard.ers_sessions || [], owner: true },
        { recordType: 'eks', typeLabel: '能量结', records: dashboard.eks_sessions || [], owner: true },
        { recordType: 'ics', typeLabel: '内部课程', records: dashboard.ics_sessions || [], owner: false },
      ]
      withdrawalSources.forEach(function(source) {
        source.records.filter(function(record) {
          return canEditRecord(record, 'activities')
        }).forEach(function(record) {
          const withdrawnIds = new Set(record.withdrawn_participant_ids || [])
          const registered = (record.participants || []).slice()
          if (source.owner && record.owner_id && record.owner_name && !registered.some(function(item) { return item.id === record.owner_id })) {
            registered.unshift({
              id: record.owner_id,
              nickname: record.owner_name || '案主',
              withdrawn: withdrawnIds.has(record.owner_id),
            })
          }
          const activeParticipants = registered.filter(function(participant) {
            return participant.id && !participant.withdrawn
          })
          const withdrawnParticipants = registered.filter(function(participant) {
            return participant.id && participant.withdrawn
          })
          if (!activeParticipants.length && !withdrawnParticipants.length) return
          const name = record.activity_name || record.course_name || record.name || source.typeLabel
          withdrawalCourses.push({
            id: record.id,
            recordType: source.recordType,
            label: `${record.start_time ? record.start_time + ' ' : ''}${source.typeLabel} · ${name}`,
            activeParticipants,
            withdrawnParticipants,
          })
        })
      })
      this._allWithdrawalCourses = withdrawalCourses
      const withdrawalMode = withdrawalCourses.some(function(course) { return course.activeParticipants.length > 0 }) ? 'withdraw' : 'restore'
      const visibleWithdrawalCourses = withdrawalCourses.filter(function(course) {
        return withdrawalMode === 'withdraw' ? course.activeParticipants.length > 0 : course.withdrawnParticipants.length > 0
      })
      const withdrawalParticipants = visibleWithdrawalCourses.length > 0
        ? (withdrawalMode === 'withdraw' ? visibleWithdrawalCourses[0].activeParticipants : visibleWithdrawalCourses[0].withdrawnParticipants)
        : []

      // 保存日历计数，供展开时使用
      this._calendarCounts = dashboard.calendar_counts || {}
      this._rawMap = rawMap
      this.setData({
        records,
        timeGroups,
        participants,
        participantText: participants.join('、'),
        withdrawalCourses: visibleWithdrawalCourses,
        withdrawalMode,
        withdrawalCourseIndex: 0,
        withdrawalParticipants,
        withdrawalParticipantIndex: 0,
        weekPages: buildWeekPages(requestedDate, dashboard.calendar_counts || {}),
        loading: false,
        dateSwitching: false,
      })
    } catch (e) {
      console.error('加载活动失败:', e)
      if (requestSeq === this._loadSeq) this.setData({ loading: false, dateSwitching: false })
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

  onParticipantsOpen(e) {
    const record = e.currentTarget.dataset.record
    if (!record || !record.id) return
    const raw = this._rawMap && this._rawMap[`${record.source}_${record.id}`]
    if (!raw) return

    const participants = buildParticipantList(raw, record.source, this._visitMap)

    this.setData({
      showParticipantSheet: true,
      participantSheetTitle: record.displayName || record.name || record.badge || '课程参与人员',
      participantSheetMeta: [record.displayName || record.name || record.badge || '', (record.time || '').replace('-', '–')]
        .filter(Boolean)
        .join(' · '),
      participantSheetList: participants,
    })
  },

  onParticipantSheetClose() {
    this.setData({ showParticipantSheet: false })
  },

  onParticipantProfileTap(e) {
    const customerId = e.currentTarget.dataset.id
    if (!customerId) return
    this.setData({ showParticipantSheet: false })
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${customerId}` })
  },

  onWithdrawalOpen() {
    if (!this.data.withdrawalCourses.length) {
      wx.showToast({ title: '当日没有可办理的退课记录', icon: 'none' })
      return
    }
    const firstCourse = this.data.withdrawalCourses[0]
    this.setData({
      showWithdrawal: true,
      withdrawalCourseIndex: 0,
      withdrawalParticipantIndex: 0,
      withdrawalParticipants: this.data.withdrawalMode === 'withdraw'
        ? firstCourse.activeParticipants
        : firstCourse.withdrawnParticipants,
    })
  },

  onWithdrawalModeChange(e) {
    if (this.data.withdrawing) return
    const withdrawalMode = e.currentTarget.dataset.mode
    const withdrawalCourses = (this._allWithdrawalCourses || []).filter(function(course) {
      return withdrawalMode === 'withdraw' ? course.activeParticipants.length > 0 : course.withdrawnParticipants.length > 0
    })
    if (!withdrawalCourses.length) {
      wx.showToast({ title: withdrawalMode === 'withdraw' ? '没有可退课人员' : '没有可恢复人员', icon: 'none' })
      return
    }
    const firstCourse = withdrawalCourses[0]
    this.setData({
      withdrawalMode,
      withdrawalCourses,
      withdrawalCourseIndex: 0,
      withdrawalParticipants: firstCourse
        ? (withdrawalMode === 'withdraw' ? firstCourse.activeParticipants : firstCourse.withdrawnParticipants)
        : [],
      withdrawalParticipantIndex: 0,
    })
  },

  onWithdrawalClose() {
    if (this.data.withdrawing) return
    this.setData({ showWithdrawal: false })
  },

  onWithdrawalCourseChange(e) {
    const withdrawalCourseIndex = Number(e.detail.value)
    const course = this.data.withdrawalCourses[withdrawalCourseIndex]
    this.setData({
      withdrawalCourseIndex,
      withdrawalParticipants: course
        ? (this.data.withdrawalMode === 'withdraw' ? course.activeParticipants : course.withdrawnParticipants)
        : [],
      withdrawalParticipantIndex: 0,
    })
  },

  onWithdrawalParticipantChange(e) {
    this.setData({ withdrawalParticipantIndex: Number(e.detail.value) })
  },

  async onWithdrawalConfirm() {
    const course = this.data.withdrawalCourses[this.data.withdrawalCourseIndex]
    const participant = this.data.withdrawalParticipants[this.data.withdrawalParticipantIndex]
    if (!course || !participant || this.data.withdrawing) return
    this.setData({ withdrawing: true })
    try {
      if (this.data.withdrawalMode === 'withdraw') {
        await activityWithdrawalApi.withdraw(course.recordType, course.id, participant.id)
      } else {
        await activityWithdrawalApi.restore(course.recordType, course.id, participant.id)
      }
      wx.showToast({ title: this.data.withdrawalMode === 'withdraw' ? '已办理退课' : '已恢复参与', icon: 'success' })
      this.setData({ showWithdrawal: false, withdrawing: false })
      await this.loadData()
    } catch (e) {
      this.setData({ withdrawing: false })
    }
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
