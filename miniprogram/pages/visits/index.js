const { visitApi, spaceApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')
const { canEditRecord, isAreaViewOnly } = require('../../utils/record-ownership')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const SHARED_SCHEDULE_DATE_KEY = 'schedule_selected_date'

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

function parseLocalDate(date) {
  const parts = String(date || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function buildWeekPages(selectedDate, calendarCounts) {
  const selected = parseLocalDate(selectedDate)
  if (!selected) return []
  const mondayOffset = (selected.getDay() + 6) % 7
  const monday = new Date(selected)
  monday.setDate(selected.getDate() - mondayOffset)
  const selectedWeekdayIndex = mondayOffset

  return [-1, 0, 1].map(weekOffset => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const dateValue = new Date(monday)
      dateValue.setDate(monday.getDate() + weekOffset * 7 + index)
      const date = formatDate(dateValue)
      return {
        date,
        day: dateValue.getDate(),
        weekday: WEEKDAYS[dateValue.getDay()],
        count: (calendarCounts || {})[date] || 0,
        // 前后周也预先标记同一星期，滑动过程中选中态不会突然消失。
        isSelected: index === selectedWeekdayIndex,
      }
    })
    // 槽位 key 保持固定，复位时只更新内容，避免 swiper 反复销毁页面后出现白屏。
    return { key: `week-slot-${weekOffset + 1}`, days }
  })
}

Page({
  data: {
    hasPagePermission: true,
    currentDate: '',
    currentDateShort: '',
    currentWeekday: '',
    calendarExpanded: false,
    calYear: 0,
    calMonth: 0,
    calendarDays: [],
    weekPages: [],
    weekSwiperCurrent: 1,
    weekSwiperDuration: 260,
    dateSwitching: false,
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
    todayVisitCount: 0,
    todayArrivedCount: 0,
    isViewOnly: false,
  },

  async onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('class-records')) {
      this.setData({ hasPagePermission: false })
      return
    }
    this.setData({ isViewOnly: isAreaViewOnly('visits') })
    const now = new Date()
    const savedDate = wx.getStorageSync(SHARED_SCHEDULE_DATE_KEY) || wx.getStorageSync('visit_selected_date')
    const date = savedDate || formatDate(now)
    const d = parseLocalDate(date) || now
    wx.setStorageSync(SHARED_SCHEDULE_DATE_KEY, date)
    wx.setStorageSync('visit_selected_date', date)
    wx.setStorageSync('activity_selected_date', date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      weekPages: buildWeekPages(date, {}),
    })
    await this.loadSpaces()
    await this.loadData()
    this._initialized = true
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (!this._initialized) return

    const sharedDate = wx.getStorageSync(SHARED_SCHEDULE_DATE_KEY)
    if (sharedDate && sharedDate !== this.data.currentDate && parseLocalDate(sharedDate)) {
      this._selectDate(sharedDate)
      return
    }

    const restoreScrollTop = this._returningFromChild
      ? Number(this._returnScrollTop || 0)
      : undefined
    this._returningFromChild = false
    this._needRefresh = false
    // 返回页面时保留现有列表，仅在后台同步数据，避免列表卸载导致闪屏和回到顶部。
    this.loadData(undefined, { silent: true, restoreScrollTop })
  },

  onPageScroll(e) {
    this._lastScrollTop = Number(e.scrollTop) || 0
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
      wx.pageScrollTo({ scrollTop: 0, duration: 100 })
    })
  },

  _formatDateShort(date) {
    const d = parseLocalDate(date) || new Date()
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
    this._selectDate(date)
  },

  _selectDate(date, fromWeekSwipe = false) {
    const d = parseLocalDate(date)
    if (!d) return
    const counts = this._calendarCounts || {}
    const useSoftTransition = fromWeekSwipe && !this.data.loading && this.data.visits.length > 0
    wx.setStorageSync(SHARED_SCHEDULE_DATE_KEY, date)
    wx.setStorageSync('visit_selected_date', date)
    wx.setStorageSync('activity_selected_date', date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      calendarExpanded: false,
      calendarDays: buildCalendar(d.getFullYear(), d.getMonth(), date, counts),
      weekPages: buildWeekPages(date, counts),
      weekSwiperCurrent: 1,
      editMode: false,
      dateSwitching: useSoftTransition,
    }, () => {
      if (!fromWeekSwipe) return
      wx.nextTick(() => {
        this._weekSwiperRecentering = false
        this.setData({ weekSwiperDuration: 260 })
      })
    })
    this.loadData(undefined, { silent: useSoftTransition })
  },

  onWeekSwiperChange(e) {
    const current = Number(e.detail.current)
    if (this._weekSwiperRecentering || current === 1) {
      if (this.data.weekSwiperCurrent !== current) {
        this.setData({ weekSwiperCurrent: current })
      }
      return
    }

    const selected = parseLocalDate(this.data.currentDate)
    if (!selected) return
    selected.setDate(selected.getDate() + (current === 0 ? -7 : 7))

    this._weekSwiperRecentering = true
    // 先同步真实页码，再无动画回到中间槽位；否则 current 一直保留 1，连续滑动后不会真正复位。
    this.setData({ weekSwiperCurrent: current, weekSwiperDuration: 0 }, () => {
      this._selectDate(formatDate(selected), true)
    })
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

  async loadData(spaceId, options = {}) {
    if (this._loading) {
      this._pendingLoad = { spaceId, options }
      return
    }
    this._loading = true
    const silent = Boolean(options.silent)
    if (!silent) this.setData({ loading: true })
    try {
      const sid = spaceId !== undefined ? spaceId : this.data.spaceId
      const reqDate = this.data.currentDate
      const [visits, counts] = await Promise.all([
        visitApi.listLight(reqDate, sid || undefined),
        visitApi.counts({
          start_date: this._countRangeStart(),
          end_date: this._countRangeEnd(),
          space_id: sid || undefined,
        }),
      ])
      const currentSpaceId = this.data.spaceId || ''
      if (reqDate !== this.data.currentDate || String(sid || '') !== String(currentSpaceId)) return
      // 迁移 localStorage 排序到后端 sort_order
      await this._migrateLocalOrder(visits || [])

      const visibleVisits = (visits || []).map(v => Object.assign({}, v, {
        can_edit: canEditRecord(v, 'visits'),
        // 轻量邀约接口已按当前账号返回本人填写的来访需求。
        needs: v.needs || '',
      }))
      const leaderMap = this.buildLeaderMap(visibleVisits)

      this._calendarCounts = counts || {}
      const nextData = {
        visits: visibleVisits,
        visitCounts: counts || {},
        weekPages: buildWeekPages(reqDate, counts || {}),
        leaderMap,
        todayVisitCount: visibleVisits.length,
        todayArrivedCount: visibleVisits.filter(v => v.arrived && !v.cancelled).length,
        loading: false,
        dateSwitching: false,
      }
      this.setData(nextData, () => {
        if (Number.isFinite(options.restoreScrollTop)) {
          wx.nextTick(() => {
            wx.pageScrollTo({ scrollTop: options.restoreScrollTop, duration: 0 })
          })
        }
      })
    } catch (e) {
      console.error('加载数据失败:', e)
      if (!this._pendingLoad) this.setData({ loading: false, dateSwitching: false })
    } finally {
      this._loading = false
      const pendingLoad = this._pendingLoad
      this._pendingLoad = null
      if (pendingLoad) this.loadData(pendingLoad.spaceId, pendingLoad.options)
    }
  },

  async _migrateLocalOrder(visits) {
    const key = `visit_order_${this.data.currentDate}_${this.data.spaceId || ''}`
    let savedOrder = []
    try { savedOrder = JSON.parse(wx.getStorageSync(key) || '[]') } catch {}
    if (!savedOrder.length || !visits.length) return
    // 过滤出当天实际存在的 id，保持 localStorage 的顺序
    const idSet = new Set(visits.map(v => v.id))
    const ordered = savedOrder.filter(id => idSet.has(id))
    if (ordered.length === 0) return
    try {
      await visitApi.reorder(ordered)
      wx.removeStorageSync(key)
      console.log('[migrate] localStorage 排序已迁移到后端:', key)
    } catch (e) {
      console.error('[migrate] 迁移排序失败:', e)
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

  _countRangeStart() {
    const date = parseLocalDate(this._monthStart())
    date.setDate(date.getDate() - 14)
    return formatDate(date)
  },

  _countRangeEnd() {
    const date = parseLocalDate(this._monthEnd())
    date.setDate(date.getDate() + 14)
    return formatDate(date)
  },

  // ---- 排序存储 ----

  saveOrder() {
    const ids = this.data.visits.map(v => v.id)
    visitApi.reorder(ids).catch(e => console.error('保存排序失败:', e))
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
    const visits = this.data.visits.slice()
    const idx = visits.findIndex(v => v.id === visit.id)
    if (idx <= 0) return
    [visits[idx - 1], visits[idx]] = [visits[idx], visits[idx - 1]]
    const leaderMap = this.buildLeaderMap(visits)
    this.setData({ visits, leaderMap })
    this.saveOrder()
  },

  onMoveDown(e) {
    const visit = e.detail.visit
    const visits = this.data.visits.slice()
    const idx = visits.findIndex(v => v.id === visit.id)
    if (idx < 0 || idx >= visits.length - 1) return
    [visits[idx], visits[idx + 1]] = [visits[idx + 1], visits[idx]]
    const leaderMap = this.buildLeaderMap(visits)
    this.setData({ visits, leaderMap })
    this.saveOrder()
  },

  // ---- 导航 ----

  _markChildNavigation() {
    this._returningFromChild = true
    this._returnScrollTop = Number(this._lastScrollTop) || 0
  },

  onAddTap() {
    this._markChildNavigation()
    wx.navigateTo({ url: `/pages/visit-create/index?date=${this.data.currentDate}&spaceId=${this.data.spaceId}` })
  },

  onFabLongPress() {
    this._markChildNavigation()
    wx.navigateTo({ url: `/pages/voice-chat/index?mode=visit&date=${this.data.currentDate}&spaceId=${this.data.spaceId}` })
  },

  onVisitTap(e) {
    if (this.data.editMode) return
    const visit = e.detail.visit || e.currentTarget.dataset.visit
    if (!visit || visit.cancelled) return
    this._markChildNavigation()
    wx.navigateTo({ url: `/pages/visit-edit/index?id=${visit.id}` })
  },

  onProfileTap(e) {
    const visit = e.detail.visit
    if (visit.customer_id) {
      this._markChildNavigation()
      wx.navigateTo({ url: `/pages/customer-profile/index?id=${visit.customer_id}` })
    }
  },

  onArrivalTap(e) {
    const { visit, arrived } = e.detail
    if (!visit || visit.cancelled) return
    if (!this._arrivalUpdating) this._arrivalUpdating = new Set()
    if (this._arrivalUpdating.has(visit.id)) return
    this._arrivalUpdating.add(visit.id)

    const previousVisits = this.data.visits
    const optimisticVisits = previousVisits.map(item => {
      if (item.id !== visit.id) return item
      const arrivedDelta = arrived === Boolean(item.arrived) ? 0 : (arrived ? 1 : -1)
      return {
        ...item,
        arrived,
        arrival_time: '',
        arrived_count: Math.max(0, (item.arrived_count || 0) + arrivedDelta),
      }
    })
    // 先即时反馈，再等待后端完成扣卡等业务；失败时恢复原状态。
    this.setData({
      visits: optimisticVisits,
      leaderMap: this.buildLeaderMap(optimisticVisits),
      todayArrivedCount: optimisticVisits.filter(item => item.arrived && !item.cancelled).length,
    })
    wx.showToast({ title: arrived ? '已确认到店' : '已设为未到店' })

    visitApi.update(visit.id, {
      arrived,
      arrival_time: null,
    }).then((updatedVisit) => {
      const visits = this.data.visits.map(item => {
        if (item.id !== visit.id) return item
        return {
          ...item,
          ...(updatedVisit || {}),
          arrived,
          arrival_time: '',
          arrived_count: Math.max(0, item.arrived_count || 0),
          can_edit: item.can_edit,
        }
      })
      this.setData({
        visits,
        leaderMap: this.buildLeaderMap(visits),
        todayArrivedCount: visits.filter(item => item.arrived && !item.cancelled).length,
      })
      // 静默同步扣卡余量等服务端计算字段；列表不隐藏，因此不会跳回顶部。
      this.loadData(undefined, { silent: true })
    }).catch(() => {
      this.setData({
        visits: previousVisits,
        leaderMap: this.buildLeaderMap(previousVisits),
        todayArrivedCount: previousVisits.filter(item => item.arrived && !item.cancelled).length,
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }).finally(() => {
      this._arrivalUpdating.delete(visit.id)
    })
  },

  onCancelVisitTap(e) {
    const visit = e.detail.visit
    if (!visit || this.data.isViewOnly) return
    const cancelled = !visit.cancelled

    visitApi.update(visit.id, { cancelled }).then(() => {
      wx.showToast({ title: cancelled ? '已取消邀约' : '已恢复邀约' })
      // 就地更新当前项，避免 loadData() 触发整页刷新导致滚动位置丢失
      const visits = this.data.visits.map(v => v.id === visit.id ? { ...v, cancelled } : v)
      // 已取消的行移到末尾，未取消保持相对顺序
      const reordered = [...visits.filter(v => !v.cancelled), ...visits.filter(v => v.cancelled)]
      const leaderMap = this.buildLeaderMap(reordered)
      this.setData({ visits: reordered, leaderMap })
      // 同步日历圆点计数（已取消的邀约不计入）
      const counts = { ...(this._calendarCounts || {}) }
      const date = visit.visit_date || this.data.currentDate
      counts[date] = Math.max(0, (counts[date] || 0) + (cancelled ? -1 : 1))
      this._calendarCounts = counts
      this.setData({ weekPages: buildWeekPages(this.data.currentDate, counts) })
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  onDeleteTap(e) {
    const visit = e.detail.visit || e.currentTarget.dataset.visit
    if (!visit || !visit.can_edit) return
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

  // ---- 导出 ----

  onExportTap() {
    const url = visitApi.export(this.data.currentDate, this.data.spaceId || undefined)
    wx.showLoading({ title: '正在导出...' })
    wx.downloadFile({
      url,
      header: { Authorization: 'Bearer ' + (wx.getStorageSync('auth_token') || '') },
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.hideLoading()
          wx.showToast({ title: '导出失败', icon: 'none' })
          return
        }
        const [y, m, d] = (this.data.currentDate || '').split('-')
        const fileName = y ? `${y}年${Number(m)}月${Number(d)}日邀约名单.xlsx` : '邀约名单.xlsx'
        const newPath = `${wx.env.USER_DATA_PATH}/${fileName}`
        const fs = wx.getFileSystemManager()
        const openFile = (p) => {
          wx.hideLoading()
          wx.openDocument({
            filePath: p,
            fileType: 'xlsx',
            showMenu: true,
            success: () => {},
            fail: () => wx.showToast({ title: '无法打开文件', icon: 'none' }),
          })
        }
        // 读取临时文件，写入中文文件名路径后打开
        fs.readFile({
          filePath: res.tempFilePath,
          success: (data) => {
            fs.writeFile({
              filePath: newPath,
              data: data.data,
              encoding: 'binary',
              success: () => openFile(newPath),
              fail: () => openFile(res.tempFilePath),
            })
          },
          fail: () => openFile(res.tempFilePath),
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      },
    })
  },
})
