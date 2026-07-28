const { clientApi } = require('../../utils/api')

Page({
  data: {
    notifications: [],
    groups: [],
    loading: true,
    unreadCount: 0,
  },

  onShow() {
    this.loadNotifications()
  },

  async loadNotifications() {
    this.setData({ loading: true })
    try {
      const res = await clientApi.getNotifications()
      const items = (res.items || []).filter(n => n.type !== 'deduction').map(n => {
        const d = new Date(n.created_at)
        return {
          ...n,
          time_text: this._formatTime(d),
          day_label: this._dayLabel(d),
          meta_text: this._buildMeta(n),
          activity_date_text: this._buildActivityDate(n),
        }
      })
      const groups = this._groupByDay(items)
      this.setData({
        notifications: items,
        groups,
        unreadCount: res.unread_count || 0,
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _formatTime(d) {
    if (!d || isNaN(d.getTime())) return ''
    const now = new Date()
    const diff = now - d
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()

    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    if (isToday) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    if (isYesterday) return `昨天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  _dayLabel(d) {
    if (!d || isNaN(d.getTime())) return '其他'
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return '今天'
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return '昨天'
    if (d.getFullYear() !== now.getFullYear()) {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  _buildMeta(n) {
    return n.operator || ''
  },

  _buildActivityDate(n) {
    const activityTypes = [
      'activity_assigned',
      'activity_changed',
      'activity_cancelled',
      'signup_cancelled',
      'arrival_confirmed',
    ]
    const isActivityMessage = activityTypes.includes(n.type)
    if (!isActivityMessage || !n.activity_date) return ''

    const parts = String(n.activity_date).split('-')
    if (parts.length !== 3) return n.activity_date
    return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`
  },

  _groupByDay(items) {
    const map = []
    for (const item of items) {
      const last = map[map.length - 1]
      if (last && last.day === item.day_label) {
        last.items.push(item)
      } else {
        map.push({ day: item.day_label, items: [item] })
      }
    }
    return map
  },

  async onTapItem(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.notifications.find(n => n.id === id)
    if (item && !item.is_read) {
      try {
        await clientApi.markNotificationRead(id)
        const notifications = this.data.notifications.map(n =>
          n.id === id ? { ...n, is_read: true } : n
        )
        this.setData({
          notifications,
          groups: this._groupByDay(notifications),
          unreadCount: notifications.filter(n => !n.is_read).length,
        })
      } catch (e) {
        // ignore
      }
    }
  },
})
