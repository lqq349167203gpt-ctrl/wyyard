const { clientApi } = require('../../utils/api')

Page({
  data: {
    loading: true,
    activities: [],
    grouped: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
  },

  onLoad() {
    this.loadActivities()
  },

  onShow() {
    // 每次显示时刷新（可能从详情页返回）
    this.loadActivities()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.loadActivities().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  loadActivities() {
    this.setData({ loading: true })
    return clientApi.listActivities(1, this.data.pageSize)
      .then(res => {
        const grouped = this._groupByDate(res.items || [])
        this.setData({
          activities: res.items || [],
          grouped,
          total: res.total || 0,
          page: 1,
          hasMore: (res.items || []).length >= this.data.pageSize,
          loading: false,
        })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  loadMore() {
    const nextPage = this.data.page + 1
    this.setData({ loading: true })
    clientApi.listActivities(nextPage, this.data.pageSize)
      .then(res => {
        const all = [...this.data.activities, ...(res.items || [])]
        const grouped = this._groupByDate(all)
        this.setData({
          activities: all,
          grouped,
          page: nextPage,
          hasMore: (res.items || []).length >= this.data.pageSize,
          loading: false,
        })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  _groupByDate(items) {
    const map = {}
    for (const item of items) {
      const date = item.date || '未知日期'
      if (!map[date]) {
        map[date] = { date, weekday: this._getWeekday(date), items: [] }
      }
      map[date].items.push(item)
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  },

  _getWeekday(dateStr) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const d = new Date(dateStr.replace(/-/g, '/'))
    return days[d.getDay()]
  },

  onTapActivity(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity-detail/index?id=${id}` })
  },
})
