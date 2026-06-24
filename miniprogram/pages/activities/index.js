const { classRecordApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')

const TYPE_COLORS = {
  '课表': '#4a90d9',
  '读书会': '#8b72c7',
  '情绪释放': '#d97070',
  '能量结': '#d9944a',
  '内部课程': '#5ba88a',
  'OH卡': '#c772a0',
  '沙龙': '#bfa060',
}

Page({
  data: {
    date: formatDate(new Date()),
    records: [],
    loading: true,
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    if (!getApp().checkLogin()) return
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const dashboard = await classRecordApi.dashboard(this.data.date)
      // 合并所有活动类型到一个列表
      const records = []

      // 课表
      if (dashboard.class_records) {
        dashboard.class_records.forEach(r => {
          records.push({
            id: r.id,
            name: r.course_name,
            type: '课表',
            color: TYPE_COLORS['课表'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || []).join('、'),
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
          })
        })
      }

      // 读书会
      if (dashboard.group_case_sessions) {
        dashboard.group_case_sessions.forEach(r => {
          records.push({
            id: r.id,
            name: r.name || '读书会',
            type: '读书会',
            color: TYPE_COLORS['读书会'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
          })
        })
      }

      // 情绪释放
      if (dashboard.emotional_release_sessions) {
        dashboard.emotional_release_sessions.forEach(r => {
          records.push({
            id: r.id,
            name: r.name || '情绪释放',
            type: '情绪释放',
            color: TYPE_COLORS['情绪释放'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: 0,
            space: r.space_name || '',
          })
        })
      }

      // 能量结
      if (dashboard.energy_knot_sessions) {
        dashboard.energy_knot_sessions.forEach(r => {
          records.push({
            id: r.id,
            name: r.name || '能量结',
            type: '能量结',
            color: TYPE_COLORS['能量结'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: (r.teacher_names || []).join('、'),
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
          })
        })
      }

      // 内部课程
      if (dashboard.internal_course_sessions) {
        dashboard.internal_course_sessions.forEach(r => {
          records.push({
            id: r.id,
            name: r.course_name || '内部课程',
            type: '内部课程',
            color: TYPE_COLORS['内部课程'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: r.participant_ids?.length || 0,
            space: '',
          })
        })
      }

      // OH卡
      if (dashboard.oh_card_reading_sessions) {
        dashboard.oh_card_reading_sessions.forEach(r => {
          records.push({
            id: r.id,
            name: r.name || 'OH卡',
            type: 'OH卡',
            color: TYPE_COLORS['OH卡'],
            time: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
            teacher: r.host_name || '',
            participants: r.participant_ids?.length || 0,
            space: r.space_name || '',
          })
        })
      }

      // 按时间排序
      records.sort((a, b) => (a.time || '').localeCompare(b.time || ''))

      this.setData({ records, loading: false })
    } catch (e) {
      console.error('加载活动失败:', e)
      this.setData({ loading: false })
    }
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
    this.loadData()
  },
})
