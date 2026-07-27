const { clientApi } = require('../../utils/api')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const ROLE_LABELS = {
  参与者: '参与者',
  老师: '老师',
  课程老师: '老师',
  成就君: '成就君',
  主持人: '成就君',
  案主: '案主',
}

function formatActivityName(name) {
  return (name || '').replace(/\s*【[^】]*】\s*$/, '').trim()
}

Page({
  data: {
    allItems: [],
    groups: [],
    totalCount: 0,
    signedUpCount: 0,
    arrivedCount: 0,
    missedCount: 0,
    activeTab: 'all',
    loading: true,
    selectedFollowupActivity: null,
  },

  onShow() {
    this.loadActivityRecords()
  },

  async loadActivityRecords() {
    this.setData({ loading: true })
    try {
      const res = await clientApi.getActivityRecords()
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
          if (a.date < todayStr) status = 'ended'
        }

        let timeRange = ''
        let timeUndecided = false
        if (a.start_time) {
          timeRange = a.end_time ? `${a.start_time}–${a.end_time}` : a.start_time
        } else {
          timeRange = '未定'
          timeUndecided = true
        }

        const isToday = a.date === todayStr
        let badge = ''
        let badgeClass = ''
        let filterType = ''
        if (isToday && status !== 'ended') {
          badge = '今晚'
          badgeClass = 'st-up'
          filterType = 'signedup'
        } else if (a.arrived) {
          badge = '已到场'
          badgeClass = 'st-done'
          filterType = 'arrived'
        } else if (status === 'ended') {
          badge = '未到场'
          badgeClass = 'st-miss'
          filterType = 'missed'
        } else {
          badge = '已报名'
          badgeClass = 'st-up'
          filterType = 'signedup'
        }

        return {
          ...a,
          status,
          timeRange,
          timeUndecided,
          badge,
          badgeClass,
          filterType,
          isToday,
          roleLabel: ROLE_LABELS[a.role] || '参与者',
          displayName: formatActivityName(a.name),
        }
      })

      this._allItems = items
      const signedUpCount = items.filter(i => i.filterType === 'signedup').length
      const arrivedCount = items.filter(i => i.filterType === 'arrived').length
      const missedCount = items.filter(i => i.filterType === 'missed').length

      this.setData({
        allItems: items,
        totalCount: items.length,
        signedUpCount,
        arrivedCount,
        missedCount,
        loading: false,
      })
      this._buildGroups(items)
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _buildGroups(items) {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const activeTab = this.data.activeTab

    const filtered = activeTab === 'all' ? items : items.filter(i => i.filterType === activeTab)

    // 按日期分组
    const groupMap = {}
    for (const item of filtered) {
      const date = item.date || 'unknown'
      if (!groupMap[date]) {
        const d = new Date(date.replace(/-/g, '/'))
        const month = d.getMonth() + 1
        const weekday = WEEKDAYS[d.getDay()]
        const dayStr = String(d.getDate()).padStart(2, '0')
        const monStr = String(month).padStart(2, '0')
        const isToday = date === todayStr
        const isPast = date < todayStr
        groupMap[date] = {
          date,
          month,
          weekday,
          isToday,
          isPast,
          dateChip: isToday ? `今天 ${monStr}/${dayStr}` : `${weekday} ${monStr}/${dayStr}`,
          items: [],
        }
      }
      groupMap[date].items.push(item)
    }

    // 日期降序排列
    const dateGroups = Object.values(groupMap).sort((a, b) => b.date.localeCompare(a.date))

    // 按月份分组
    const monthMap = {}
    for (const dg of dateGroups) {
      const m = dg.month
      if (!monthMap[m]) {
        monthMap[m] = { month: m, dateGroups: [], totalCount: 0 }
      }
      // 日期胶囊小旋转:每月内第 1/3/5.. 个左倾,每第 3 个右倾(同设计稿 nth-child 规则)
      const nth = monthMap[m].dateGroups.length + 1
      dg.chipTilt = nth % 3 === 0 ? 'tilt-r' : (nth % 2 === 1 ? 'tilt-l' : '')
      monthMap[m].dateGroups.push(dg)
      monthMap[m].totalCount += dg.items.length
    }

    const groups = Object.values(monthMap).sort((a, b) => b.month - a.month)
    this.setData({ groups })
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    this._buildGroups(this.data.allItems)
  },

  onFollowupTap(e) {
    const activityKey = e.currentTarget.dataset.key
    const activity = this.data.allItems.find(item => item.activity_key === activityKey)
    if (activity) this.setData({ selectedFollowupActivity: activity })
  },

  onFollowupClose() {
    this.setData({ selectedFollowupActivity: null })
  },

  onFollowupSaved() {
    this.setData({ selectedFollowupActivity: null })
    this.loadActivityRecords()
  },
})
