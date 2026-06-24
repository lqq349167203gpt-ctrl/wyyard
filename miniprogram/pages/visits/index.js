const { classRecordApi, visitApi, spaceApi } = require('../../utils/api')
const { formatDate, getWeekDates } = require('../../utils/util')

Page({
  data: {
    currentDate: formatDate(new Date()),
    currentDateShort: '',
    weekDates: [],
    visits: [],
    visitCounts: {},
    spaces: [],
    spaceIndex: 0,
    spaceId: '',
    currentSpaceName: '',
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
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      if (spaces.length === 0) return

      // 读取上次选择的空间索引，默认选择第一个空间
      const savedIndex = wx.getStorageSync('visit_space_index') || 0
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
      const [dashboard, counts] = await Promise.all([
        classRecordApi.dashboard(this.data.currentDate, this.data.spaceId || undefined),
        visitApi.counts({
          start_date: this.data.weekDates[0]?.date,
          end_date: this.data.weekDates[6]?.date,
          space_id: this.data.spaceId || undefined,
        }),
      ])

      this.setData({
        visits: dashboard.visits || [],
        visitCounts: counts || {},
        loading: false,
      })

      // 更新周视图上的计数
      this.updateWeekCounts(counts || {})
    } catch (e) {
      console.error('加载数据失败:', e)
      this.setData({ loading: false })
    }
  },

  updateWeekCounts(counts) {
    const weekDates = this.data.weekDates.map(d => ({
      ...d,
      count: counts[d.date] || 0,
    }))
    this.setData({ weekDates })
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

  onSpaceChange(e) {
    const index = e.detail.value
    const space = this.data.spaces[index]
    this.setData({
      spaceIndex: index,
      spaceId: space?.id || '',
      currentSpaceName: space?.name || '',
    })
    // 保存选择的空间索引
    wx.setStorageSync('visit_space_index', index)
    this.loadData()
  },

  onAddTap() {
    wx.navigateTo({ url: `/pages/visit-create/index?date=${this.data.currentDate}&spaceId=${this.data.spaceId}` })
  },

  onVisitTap(e) {
    const visit = e.currentTarget.dataset.visit
    wx.navigateTo({ url: `/pages/visit-detail/index?id=${visit.id}` })
  },

  onEditTap(e) {
    const visit = e.currentTarget.dataset.visit
    wx.navigateTo({ url: `/pages/visit-edit/index?id=${visit.id}` })
  },

  onProfileTap(e) {
    const visit = e.detail.visit
    if (visit.customer_id) {
      wx.navigateTo({ url: `/pages/customer-profile/index?id=${visit.customer_id}` })
    }
  },

  onArrivalTap(e) {
    const { visit, arrivalTime } = e.detail
    const arrived = !!arrivalTime

    visitApi.update(visit.id, {
      arrived,
      arrival_time: arrivalTime || null,
    }).then(() => {
      wx.showToast({ title: arrived ? '已确认到场' : '已取消到场' })
      this.loadData()
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  onDeleteTap(e) {
    const visit = e.currentTarget.dataset.visit
    wx.showModal({
      title: '确认删除',
      content: `确定删除 ${visit.nickname} 的邀约记录？`,
      success: (res) => {
        if (res.confirm) {
          visitApi.delete(visit.id).then(() => {
            wx.showToast({ title: '已删除' })
            this.loadData()
          }).catch(err => {
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      },
    })
  },
})
