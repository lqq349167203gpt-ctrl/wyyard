const { visitApi, spaceApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(n) { return n < 10 ? '0' + n : '' + n }

function buildCalendar(year, month, selectedDate, calendarCounts) {
  const today = formatDate(new Date())
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7
  const days = []

  for (let i = 0; i < totalCells; i++) {
    let day, date, isCurrent
    if (i < firstDay) {
      day = daysInPrev - firstDay + 1 + i
      const m = month === 0 ? 12 : month
      const y = month === 0 ? year - 1 : year
      date = `${y}-${pad(m)}-${pad(day)}`
      isCurrent = false
    } else if (i >= firstDay + daysInMonth) {
      day = i - firstDay - daysInMonth + 1
      const m = month === 11 ? 1 : month + 2
      const y = month === 11 ? year + 1 : year
      date = `${y}-${pad(m)}-${pad(day)}`
      isCurrent = false
    } else {
      day = i - firstDay + 1
      date = `${year}-${pad(month + 1)}-${pad(day)}`
      isCurrent = true
    }
    days.push({
      day,
      date,
      isCurrent,
      isSelected: date === selectedDate,
      isToday: date === today,
      count: (calendarCounts || {})[date] || 0,
    })
  }
  return days
}

Page({
  data: {
    currentDate: '',
    currentDateShort: '',
    currentWeekday: '',
    calendarExpanded: false,
    calYear: 0,
    calMonth: 0,
    calendarDays: [],
    weekdays: WEEKDAYS,
    visits: [],
    visitCounts: {},
    spaces: [],
    spaceIndex: 0,
    spaceId: '',
    currentSpaceName: '',
    loading: true,
    leaderMap: {},
    editMode: false,
  },

  async onLoad() {
    const now = new Date()
    const date = formatDate(now)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[now.getDay()],
      calYear: now.getFullYear(),
      calMonth: now.getMonth(),
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

  _formatDateShort(date) {
    const d = new Date(date)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  // ---------- 日历 ----------

  onCalendarToggle() {
    if (this.data.calendarExpanded) {
      this.setData({ calendarExpanded: false })
    } else {
      const counts = this._calendarCounts || {}
      this.setData({
        calendarExpanded: true,
        calendarDays: buildCalendar(this.data.calYear, this.data.calMonth, this.data.currentDate, counts),
      })
    }
  },

  onCalendarClose() {
    this.setData({ calendarExpanded: false })
  },

  onPrevMonth() {
    let { calYear, calMonth } = this.data
    calMonth--
    if (calMonth < 0) { calMonth = 11; calYear-- }
    const counts = this._calendarCounts || {}
    this.setData({
      calYear, calMonth,
      calendarDays: buildCalendar(calYear, calMonth, this.data.currentDate, counts),
    })
  },

  onNextMonth() {
    let { calYear, calMonth } = this.data
    calMonth++
    if (calMonth > 11) { calMonth = 0; calYear++ }
    const counts = this._calendarCounts || {}
    this.setData({
      calYear, calMonth,
      calendarDays: buildCalendar(calYear, calMonth, this.data.currentDate, counts),
    })
  },

  onCalendarDayTap(e) {
    const date = e.currentTarget.dataset.date
    const d = new Date(date)
    const counts = this._calendarCounts || {}
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      calendarExpanded: false,
      calendarDays: buildCalendar(d.getFullYear(), d.getMonth(), date, counts),
      editMode: false,
    })
    this.loadData()
  },

  // ---------- 空间 ----------

  async loadSpaces() {
    try {
      const spaces = await spaceApi.list()
      if (spaces.length === 0) return
      const savedIndex = wx.getStorageSync('visit_space_index') || 0
      const spaceIndex = Math.min(savedIndex, spaces.length - 1)
      const space = spaces[spaceIndex]
      this.setData({
        spaces, spaceIndex,
        spaceId: space?.id || '',
        currentSpaceName: space?.name || '',
      })
    } catch (e) {
      console.error('加载空间失败:', e)
    }
  },

  onSpaceChange(e) {
    const index = e.detail.value
    const space = this.data.spaces[index]
    this.setData({
      spaceIndex: index,
      spaceId: space?.id || '',
      currentSpaceName: space?.name || '',
      editMode: false,
    })
    wx.setStorageSync('visit_space_index', index)
    this.loadData(space?.id || '')
  },

  // ---------- 数据 ----------

  async loadData(spaceId) {
    if (this._loading) return
    this._loading = true
    this.setData({ loading: true })
    try {
      const sid = spaceId !== undefined ? spaceId : this.data.spaceId
      const [visits, counts] = await Promise.all([
        visitApi.listLight(this.data.currentDate, sid || undefined),
        visitApi.counts({
          start_date: this._monthStart(),
          end_date: this._monthEnd(),
          space_id: sid || undefined,
        }),
      ])

      const sorted = this.applySavedOrder(visits || [])
      const leaderMap = this.buildLeaderMap(sorted)

      this._calendarCounts = counts || {}
      this.setData({
        visits: sorted,
        visitCounts: counts || {},
        leaderMap,
        loading: false,
      })
    } catch (e) {
      console.error('加载数据失败:', e)
      this.setData({ loading: false })
    } finally {
      this._loading = false
    }
  },

  _monthStart() {
    const { calYear, calMonth } = this.data
    return `${calYear}-${pad(calMonth + 1)}-01`
  },

  _monthEnd() {
    const { calYear, calMonth } = this.data
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    return `${calYear}-${pad(calMonth + 1)}-${pad(lastDay)}`
  },

  // ---- 排序存储 ----

  _orderKey() {
    return `visit_order_${this.data.currentDate}_${this.data.spaceId || ''}`
  },

  applySavedOrder(visits) {
    let savedOrder = []
    try { savedOrder = JSON.parse(wx.getStorageSync(this._orderKey()) || '[]') } catch {}
    if (!savedOrder.length) {
      wx.setStorageSync(this._orderKey(), JSON.stringify(visits.map(v => v.id)))
      return visits
    }
    const orderMap = new Map(savedOrder.map((id, i) => [id, i]))
    const sorted = [...visits].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
    const merged = sorted.map(v => v.id)
    wx.setStorageSync(this._orderKey(), JSON.stringify(merged))
    return sorted
  },

  saveOrder() {
    const order = this.data.visits.map(v => v.id)
    wx.setStorageSync(this._orderKey(), JSON.stringify(order))
  },

  // ---- 组长映射 ----

  buildLeaderMap(visits) {
    const leaderMap = {}
    let currentLeader = ''
    for (const v of visits) {
      if (v.is_leader) {
        currentLeader = v.nickname
        leaderMap[v.customer_id] = ''
      } else if (currentLeader) {
        leaderMap[v.customer_id] = currentLeader
      }
    }
    return leaderMap
  },

  // ---- 编辑模式 ----

  onToggleEditMode() {
    this.setData({ editMode: !this.data.editMode })
  },

  onMoveUp(e) {
    const visit = e.detail.visit
    const visits = [...this.data.visits]
    const idx = visits.findIndex(v => v.id === visit.id)
    if (idx <= 0) return
    [visits[idx - 1], visits[idx]] = [visits[idx], visits[idx - 1]]
    const leaderMap = this.buildLeaderMap(visits)
    this.setData({ visits, leaderMap })
    this.saveOrder()
  },

  onMoveDown(e) {
    const visit = e.detail.visit
    const visits = [...this.data.visits]
    const idx = visits.findIndex(v => v.id === visit.id)
    if (idx < 0 || idx >= visits.length - 1) return
    [visits[idx], visits[idx + 1]] = [visits[idx + 1], visits[idx]]
    const leaderMap = this.buildLeaderMap(visits)
    this.setData({ visits, leaderMap })
    this.saveOrder()
  },

  // ---- 导航 ----

  onAddTap() {
    wx.navigateTo({ url: `/pages/visit-create/index?date=${this.data.currentDate}&spaceId=${this.data.spaceId}` })
  },

  onVisitTap(e) {
    if (this.data.editMode) return
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
      wx.showToast({ title: arrived ? '已确认到店' : '已取消到店' })
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
