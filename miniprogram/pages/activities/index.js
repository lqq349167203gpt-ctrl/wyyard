const { classRecordApi, spaceApi } = require('../../utils/api')
const { formatDate, getWeekDates } = require('../../utils/util')

// 标签颜色（level-1 标签 + 活动类型）
const BADGE_COLORS = {
  '沙龙': '#3370ff',
  '觉醒': '#7c5cfc',
  '情绪释放': '#d97070',
  '能量结': '#d9944a',
  '内部课程': '#5ba88a',
  'OH卡': '#c772a0',
}

Page({
  data: {
    currentDate: formatDate(new Date()),
    currentDateShort: '',
    weekDates: [],
    spaces: [],
    spaceIndex: 0,
    spaceId: '',
    currentSpaceName: '',
    records: [],
    loading: true,
    scrollLeft: 0,
  },

  async onLoad() {
    this.setData({
      weekDates: getWeekDates(new Date()),
      currentDateShort: this.formatDateShort(new Date()),
    })
    await this.loadSpaces()
    this.loadData()
  },

  onShow() {
    if (!getApp().checkLogin()) return
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      if (spaces.length === 0) return

      const savedIndex = wx.getStorageSync('activity_space_index') || 0
      const spaceIndex = Math.min(savedIndex, spaces.length - 1)
      const space = spaces[spaceIndex]

      this.setData({
        spaces,
        spaceIndex,
        spaceId: space?.id || '',
        currentSpaceName: space?.name || '',
      })
    } catch (e) {
      console.error('加载空间失败:', e)
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const dashboard = await classRecordApi.dashboard(this.data.currentDate, this.data.spaceId || undefined)
      const records = []

      // 原始数据存储（供详情编辑用）
      this._rawMap = {}

      // 课程活动 — badge: course_type(有则显示) 或 沙龙(兜底), name: activity_name || course_name
      if (dashboard.class_records) {
        dashboard.class_records.forEach(r => {
          const badge = r.course_type || '沙龙'
          this._rawMap[`class_record_${r.id}`] = r
          records.push({
            id: r.id,
            badge,
            name: r.activity_name || r.course_name || '',
            color: BADGE_COLORS['沙龙'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || []).join('、'),
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'class_record',
            isPublicWelfare: r.is_public_welfare || false,
          })
        })
      }

      // 觉醒游戏
      if (dashboard.gcs_sessions) {
        dashboard.gcs_sessions.forEach(r => {
          const owner = r.owner_name || ''
          this._rawMap[`group_case_${r.id}`] = r
          const defaultName = owner ? `觉醒游戏·${owner}` : '觉醒游戏'
          records.push({
            id: r.id,
            badge: '觉醒',
            name: r.name || defaultName,
            color: BADGE_COLORS['觉醒'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'group_case',
          })
        })
      }

      // 情绪释放
      if (dashboard.ers_sessions) {
        dashboard.ers_sessions.forEach(r => {
          this._rawMap[`emotional_release_${r.id}`] = r
          records.push({
            id: r.id,
            badge: '情绪释放',
            name: r.name || '',
            color: BADGE_COLORS['情绪释放'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: 0,
            space: r.space_name || '',
            source: 'emotional_release',
          })
        })
      }

      // 能量结
      if (dashboard.eks_sessions) {
        dashboard.eks_sessions.forEach(r => {
          this._rawMap[`energy_knot_${r.id}`] = r
          records.push({
            id: r.id,
            badge: '能量结',
            name: r.name || '',
            color: BADGE_COLORS['能量结'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || []).join('、'),
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'energy_knot',
          })
        })
      }

      // 内部课程
      if (dashboard.ics_sessions) {
        dashboard.ics_sessions.forEach(r => {
          this._rawMap[`internal_course_${r.id}`] = r
          records.push({
            id: r.id,
            badge: '内部课程',
            name: r.course_name || '',
            color: BADGE_COLORS['内部课程'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'internal_course',
          })
        })
      }

      // OH卡
      if (dashboard.ocr_sessions) {
        dashboard.ocr_sessions.forEach(r => {
          this._rawMap[`oh_card_${r.id}`] = r
          records.push({
            id: r.id,
            badge: 'OH卡',
            name: r.name || '',
            color: BADGE_COLORS['OH卡'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
            source: 'oh_card',
          })
        })
      }

      // 按时间排序
      records.sort((a, b) => (a.time || '').localeCompare(b.time || ''))

      // 更新日历周的活动场数
      const calCounts = dashboard.calendar_counts || {}
      const weekDates = this.data.weekDates.map(d => ({
        ...d,
        count: calCounts[d.date] || 0,
      }))

      this.setData({ records, weekDates, loading: false })
    } catch (e) {
      console.error('加载活动失败:', e)
      this.setData({ loading: false })
    }
  },

  formatDateShort(date) {
    const d = new Date(date)
    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${month}月${day}日`
  },

  onDateTap(e) {
    const date = e.currentTarget.dataset.date
    this.setData({
      currentDate: date,
      currentDateShort: this.formatDateShort(date),
    })
    this.loadData()
  },

  onDateChange(e) {
    const date = e.detail.value
    this.setData({
      currentDate: date,
      currentDateShort: this.formatDateShort(date),
    })
    this.loadData()
  },

  onActivityTap(e) {
    const record = e.currentTarget.dataset.record
    if (!record || !record.id) return
    const raw = this._rawMap[`${record.source}_${record.id}`]
    getApp().globalData._selectedActivity = raw || record
    getApp().globalData._selectedActivitySource = record.source
    wx.navigateTo({ url: '/pages/activity-detail/index' })
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
    this.loadData()
  },

  onCreateTap() {
    const date = this.data.currentDate
    const spaceId = this.data.spaceId
    wx.navigateTo({ url: `/pages/activity-create/index?date=${date}&spaceId=${spaceId}` })
  },
})
