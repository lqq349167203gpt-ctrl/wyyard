const { clientApi } = require('../../utils/api')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

Page({
  data: {
    groups: [],
    totalCount: 0,
    loading: true,
  },

  onShow() {
    this.loadActivityRecords()
  },

  async loadActivityRecords() {
    this.setData({ loading: true })
    try {
      const res = await clientApi.getActivityRecords()
      const now = new Date()
      const items = (res.items || []).map(a => {
        let status = ''
        if (a.date && a.start_time) {
          const actStart = new Date(`${a.date}T${a.start_time}:00`)
          if (!isNaN(actStart.getTime())) {
            if (a.end_time) {
              const actEnd = new Date(`${a.date}T${a.end_time}:00`)
              if (!isNaN(actEnd.getTime()) && now >= actEnd) status = 'ended'
            }
            if (!status && now >= actStart) status = 'ongoing'
          }
        }
        if (!status && a.date) {
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          if (a.date < todayStr) status = 'ended'
        }
        // 时间范围
        let timeRange = ''
        if (a.start_time) {
          timeRange = a.end_time ? `${a.start_time}–${a.end_time}` : a.start_time
        }
        // 状态标签
        let badge = ''
        let badgeClass = ''
        if (a.arrived) {
          badge = '已到场'
          badgeClass = 'st-done'
        } else if (status === 'ended') {
          badge = '未到场'
          badgeClass = 'st-missed'
        } else if (status === 'ongoing') {
          badge = '进行中'
          badgeClass = 'st-up'
        } else {
          badge = '已报名'
          badgeClass = 'st-up'
        }
        return {
          ...a,
          status,
          timeRange,
          badge,
          badgeClass,
          meta: [timeRange, a.host || ''].filter(Boolean).join(' · '),
        }
      })

      // 按日期分组
      const groupMap = {}
      for (const item of items) {
        const date = item.date || 'unknown'
        if (!groupMap[date]) {
          const d = new Date(date.replace(/-/g, '/'))
          const dayNum = d.getDate()
          const month = d.getMonth() + 1
          const weekday = WEEKDAYS[d.getDay()]
          const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          groupMap[date] = {
            date,
            dayNum,
            month,
            weekday,
            isToday,
            dateLabel: `${month}月 · ${weekday}`,
            items: [],
          }
        }
        groupMap[date].items.push(item)
      }

      const groups = Object.values(groupMap).sort((a, b) => b.date.localeCompare(a.date))
      this.setData({ groups, totalCount: items.length, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    }
  },
})
