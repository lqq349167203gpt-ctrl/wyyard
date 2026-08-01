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
    isLoggedIn: false,
    customer: null,
    greeting: '',
    unreadCount: 0,
    stats: {
      activity_count: 0,
      visit_count: 0,
      remain_count: 0,
    },
    remainNum: '0',
    remainClass: '',
    remainLabel: '次剩余 · 快来玩吧',
    activityGroups: [],
    activityTotalCount: 0,
    weekCount: 0,
    selectedFollowupActivity: null,
  },

  onShow() {
    const app = getApp()
    const hour = new Date().getHours()
    const greeting = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'
    this.setData({
      isLoggedIn: app.isLoggedIn(),
      customer: app.globalData.customer,
      greeting,
    })
    if (app.isLoggedIn()) {
      this.loadUnreadCount()
      this.loadRemaining()
      this.loadActivityTimeline()
    }
  },

  async loadUnreadCount() {
    try {
      const res = await clientApi.getNotifications()
      this.setData({ unreadCount: res.unread_count || 0 })
    } catch (e) {
      // ignore
    }
  },

  async loadRemaining() {
    try {
      const res = await clientApi.getRemaining()
      const rc = res.remaining
      let remainNum = '0'
      let remainClass = ''
      let remainLabel = '次剩余 · 快来玩吧'
      if (rc === null) {
        remainNum = '∞'
        remainClass = 'inf'
        remainLabel = '不限次 · 随时来约'
      } else if (rc === 0) {
        remainNum = '0'
        remainClass = 'zero'
        remainLabel = '次数 · 用完咯'
      } else if (rc < 0) {
        remainNum = String(rc)
        remainClass = 'zero'
        remainLabel = '次数 · 用完咯'
      } else {
        remainNum = String(rc)
      }
      this.setData({ remainNum, remainClass, remainLabel })
    } catch (e) {
      // ignore
    }
  },

  async loadActivityTimeline() {
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
        if (isToday && status !== 'ended') {
          badge = '今晚'
          badgeClass = 'st-up'
        } else if (a.arrived) {
          badge = '已到场'
          badgeClass = 'st-done'
        } else if (status === 'ended') {
          badge = '未到场'
          badgeClass = 'st-miss'
        } else {
          badge = '已报名'
          badgeClass = 'st-up'
        }

        return {
          ...a,
          status,
          timeRange,
          timeUndecided,
          badge,
          badgeClass,
          isToday,
          meta: [timeRange, a.host || ''].filter(Boolean).join(' · '),
          roleLabel: ROLE_LABELS[a.role] || '参与者',
          displayName: formatActivityName(a.name),
        }
      })

      const groupMap = {}
      for (const item of items) {
        const date = item.date || 'unknown'
        if (!groupMap[date]) {
          const d = new Date(date.replace(/-/g, '/'))
          const dayNum = d.getDate()
          const month = d.getMonth() + 1
          const weekday = WEEKDAYS[d.getDay()]
          const dayStr = String(d.getDate()).padStart(2, '0')
          const monStr = String(d.getMonth() + 1).padStart(2, '0')
          groupMap[date] = {
            date,
            dayNum,
            month,
            weekday,
            isToday: date === todayStr,
            isPast: date < todayStr,
            dateLabel: `${month}月 · ${weekday}`,
            dateChip: `${weekday} ${monStr}/${dayStr}`,
            items: [],
          }
        }
        groupMap[date].items.push(item)
      }

      const groups = Object.values(groupMap).sort((a, b) => {
        if (a.isToday) return -1
        if (b.isToday) return 1

        const aIsFuture = a.date > todayStr
        const bIsFuture = b.date > todayStr
        if (aIsFuture !== bIsFuture) return aIsFuture ? -1 : 1

        // 未来活动按由近到远；过去活动按由近到远。
        return aIsFuture
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date)
      })

      // 最多显示最近7场活动
      const MAX_SHOW = 7
      let count = 0
      const truncated = []
      for (const g of groups) {
        if (count >= MAX_SHOW) break
        const remaining = MAX_SHOW - count
        if (g.items.length <= remaining) {
          truncated.push(g)
          count += g.items.length
        } else {
          truncated.push({ ...g, items: g.items.slice(0, remaining) })
          count = MAX_SHOW
        }
      }

      // 本周场数统计
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      const weekCount = items.filter(a => {
        if (!a.date) return false
        const d = new Date(a.date.replace(/-/g, '/'))
        return d >= weekStart && d <= weekEnd
      }).length

      this.setData({
        activityGroups: truncated,
        activityTotalCount: items.length,
        weekCount,
        'stats.activity_count': items.length,
      })
    } catch (e) {
      // ignore
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },

  onRecordTap(e) {
    const type = e.currentTarget.dataset.type
    const routes = {
      transactions: '/pages/transactions/index',
      activity: '/pages/activity-records/index',
      cancel: '/pages/deductions/index',
    }
    const url = routes[type]
    if (!url) return
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '功能开发中', icon: 'none' }),
    })
  },

  onBellTap() {
    wx.navigateTo({ url: '/pages/notifications/index' })
  },

  onViewAll() {
    wx.navigateTo({
      url: '/pages/activity-records/index',
      fail: () => wx.showToast({ title: '功能开发中', icon: 'none' }),
    })
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/activity-detail/index?id=${id}` })
  },

  onFollowupTap(e) {
    const activityKey = e.currentTarget.dataset.key
    let activity = null
    for (const group of this.data.activityGroups) {
      activity = group.items.find(item => item.activity_key === activityKey)
      if (activity) break
    }
    if (activity) this.setData({ selectedFollowupActivity: activity })
  },

  onFollowupClose() {
    this.setData({ selectedFollowupActivity: null })
  },

  onFollowupSaved() {
    this.setData({ selectedFollowupActivity: null })
    this.loadActivityTimeline()
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.logout()
          this.setData({ isLoggedIn: false, customer: null })
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      },
    })
  },
})
