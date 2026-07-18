const { clientApi } = require('../../utils/api')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

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
    activityGroups: [],
    activityTotalCount: 0,
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

  async loadActivityTimeline() {
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
        let timeRange = ''
        if (a.start_time) {
          timeRange = a.end_time ? `${a.start_time}–${a.end_time}` : a.start_time
        }
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
            dateLabel: `${month}月 · ${weekday}`,
            dateChip: `${weekday} ${monStr}/${dayStr}`,
            items: [],
          }
        }
        groupMap[date].items.push(item)
      }

      const groups = Object.values(groupMap).sort((a, b) => b.date.localeCompare(a.date))
      this.setData({ activityGroups: groups, activityTotalCount: items.length })
    } catch (e) {
      // ignore
    }
  },

  onGoLogin() {
    const app = getApp()
    app.globalData.token = ''
    wx.navigateTo({ url: '/pages/login/index' })
  },

  onStatTap(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'activity') {
      wx.navigateTo({ url: '/pages/activity-records/index' })
    } else if (type === 'visit') {
      wx.navigateTo({ url: '/pages/transactions/index' })
    }
  },

  onBellTap() {
    wx.navigateTo({ url: '/pages/notifications/index' })
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
