const { clientApi } = require('../../utils/api')

Page({
  data: {
    notifications: [],
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
      const items = (res.items || []).map(n => ({
        ...n,
        time_text: this._formatTime(n.created_at),
      }))
      this.setData({
        notifications: items,
        unreadCount: res.unread_count || 0,
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _formatTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mi = pad(d.getMinutes())
    if (d.toDateString() === now.toDateString()) {
      return `${hh}:${mi}`
    }
    return `${mm}-${dd} ${hh}:${mi}`
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
          unreadCount: notifications.filter(n => !n.is_read).length,
        })
      } catch (e) {
        // ignore
      }
    }
  },
})
