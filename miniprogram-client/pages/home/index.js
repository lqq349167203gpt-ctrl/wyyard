const { clientApi } = require('../../utils/api')

// 类型标签 pastel 配色数量（与 wxss 中 tag-t1~t4 对应）
const TYPE_CLASS_COUNT = 4

Page({
  data: {
    loading: true,
    activities: [],
    grouped: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    weekDays: [],
    heroText: '',
    todayStr: '',
    selectedStr: '',
    weekCount: 0,
    // 月历弹层
    calVisible: false,
    calYear: 0,
    calMonth: 0,
    calCells: [],
    calWeekNames: ['一', '二', '三', '四', '五', '六', '日'],
  },

  onLoad() {
    this._buildWeek()
    this.loadActivities()
  },

  onShow() {
    // 每次显示时刷新（可能从详情页返回）
    this._buildWeek()
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

  // 滚动时同步：列表当前内容与周日历选中态联动
  onPageScroll(e) {
    if (this._tapScrollLock) return
    const tops = this._groupTops || []
    if (!tops.length) return
    const now = Date.now()
    if (now - (this._lastScrollSync || 0) < 80) return
    this._lastScrollSync = now
    // 阅读线:吸顶头部(日期胶囊+周日历)下沿附近
    const line = e.scrollTop + 140
    let target = tops[0]
    for (const g of tops) {
      if (g.top <= line) {
        target = g
      } else {
        break
      }
    }
    if (target && target.dateStr !== this.data.selectedStr) {
      this._syncSelected(target.dateStr)
    }
  },

  loadActivities() {
    this.setData({ loading: true })
    return clientApi.listActivities(1, this.data.pageSize)
      .then(res => {
        const items = (res.items || []).map(item => this._decorate(item))
        this.setData({
          activities: items,
          grouped: this._groupByDate(items),
          total: res.total || 0,
          page: 1,
          hasMore: (res.items || []).length >= this.data.pageSize,
          loading: false,
          weekCount: this._countInRange(items, this.data.weekStart, this.data.weekEnd),
        }, () => this._measureGroups())
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
        const all = [...this.data.activities, ...(res.items || []).map(item => this._decorate(item))]
        this.setData({
          activities: all,
          grouped: this._groupByDate(all),
          page: nextPage,
          hasMore: (res.items || []).length >= this.data.pageSize,
          loading: false,
          weekCount: this._countInRange(all, this.data.weekStart, this.data.weekEnd),
        }, () => this._measureGroups())
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  // 周日历：以 anchor 所在周为准（默认已选日期/今天所在周），周一~周日
  _buildWeek(anchor) {
    const now = new Date()
    const selectedStr = this.data.selectedStr
    let base = anchor
    if (!base) {
      base = selectedStr ? new Date(selectedStr.replace(/-/g, '/')) : now
    }
    const names = ['一', '二', '三', '四', '五', '六', '日']
    const mondayOffset = (base.getDay() + 6) % 7
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const sel = selectedStr || this._fmtDate(now)
    const selDate = new Date(sel.replace(/-/g, '/'))
    const weekDays = names.map((name, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = this._fmtDate(d)
      return {
        name,
        num: d.getDate(),
        dateStr,
        isToday: this._isSameDay(d, now),
        selected: dateStr === sel,
      }
    })
    const weekStart = this._fmtDate(monday)
    const weekEnd = this._fmtDate(sunday)
    this.setData({
      weekDays,
      heroText: `${selDate.getMonth() + 1}月${selDate.getDate()}日`,
      todayStr: this._fmtDate(now),
      weekStart,
      weekEnd,
      weekCount: this._countInRange(this.data.activities, weekStart, weekEnd),
    })
  },

  // 统一改选中日期：同周只挪选中态,跨周重建周日历;顶部胶囊跟随
  _syncSelected(dateStr) {
    this.setData({ selectedStr: dateStr })
    const d = new Date(dateStr.replace(/-/g, '/'))
    const heroText = `${d.getMonth() + 1}月${d.getDate()}日`
    const inWeek = dateStr >= this.data.weekStart && dateStr <= this.data.weekEnd
    if (inWeek) {
      const weekDays = this.data.weekDays.map(w => ({
        ...w,
        selected: w.dateStr === dateStr,
      }))
      this.setData({ weekDays, heroText })
    } else {
      this._buildWeek(d)
    }
  },

  // 点击周日历：选中该天并滚动到对应日期分组
  onTapDay(e) {
    const dateStr = e.currentTarget.dataset.date
    if (!dateStr) return
    this._gotoDate(dateStr)
  },

  // 顶部日期胶囊：打开月历选择器
  onTapHeroDate() {
    const base = this.data.selectedStr
      ? new Date(this.data.selectedStr.replace(/-/g, '/'))
      : new Date()
    this.setData({ calVisible: true })
    this._buildCalendar(base.getFullYear(), base.getMonth() + 1)
  },

  onCalClose() {
    this.setData({ calVisible: false })
  },

  onCalPrev() {
    let { calYear, calMonth } = this.data
    calMonth -= 1
    if (calMonth < 1) { calMonth = 12; calYear -= 1 }
    this._buildCalendar(calYear, calMonth)
  },

  onCalNext() {
    let { calYear, calMonth } = this.data
    calMonth += 1
    if (calMonth > 12) { calMonth = 1; calYear += 1 }
    this._buildCalendar(calYear, calMonth)
  },

  // 月历点选某天：切换周日历到该周并滚动定位
  onCalTapDay(e) {
    const dateStr = e.currentTarget.dataset.date
    if (!dateStr) return
    this.setData({ calVisible: false })
    this._gotoDate(dateStr)
  },

  // 统一定位到某天：选中 → 有分组直接滚,没有则先按周拉取(含过去日期)再滚
  _gotoDate(dateStr) {
    this._lockTapScroll()
    this._syncSelected(dateStr)
    const group = this.data.grouped.find(g => g.date === dateStr)
    if (group) {
      this._scrollToDate(dateStr)
    } else {
      this._fetchWeekFor(dateStr).then(() => this._scrollToDate(dateStr))
    }
  },

  // 按周拉取活动并合并进列表(用于定位到未加载/过去的日期)
  _fetchWeekFor(dateStr) {
    const d = new Date(dateStr.replace(/-/g, '/'))
    const mondayOffset = (d.getDay() + 6) % 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const start = this._fmtDate(monday)
    const end = this._fmtDate(sunday)
    return clientApi.listActivitiesByRange(start, end)
      .then(res => {
        const items = (res.items || []).map(item => this._decorate(item))
        if (!items.length) return
        const map = {}
        for (const a of this.data.activities) map[a.id] = a
        for (const a of items) map[a.id] = a
        const all = Object.values(map)
        this.setData({
          activities: all,
          grouped: this._groupByDate(all),
          weekCount: this._countInRange(all, this.data.weekStart, this.data.weekEnd),
        }, () => this._measureGroups())
      })
      .catch(() => {})
  },

  _buildCalendar(year, month) {
    const first = new Date(year, month - 1, 1)
    const offset = (first.getDay() + 6) % 7
    const daysInMonth = new Date(year, month, 0).getDate()
    const cells = []
    for (let i = 0; i < 42; i++) {
      const dayNum = i - offset + 1
      if (dayNum < 1 || dayNum > daysInMonth) {
        cells.push({ day: '', dateStr: '', inMonth: false })
      } else {
        const d = new Date(year, month - 1, dayNum)
        const dateStr = this._fmtDate(d)
        cells.push({
          day: dayNum,
          dateStr,
          inMonth: true,
          isToday: dateStr === this.data.todayStr,
          isSelected: dateStr === this.data.selectedStr,
          hasAct: this._hasActivity(dateStr),
        })
      }
    }
    this.setData({ calYear: year, calMonth: month, calCells: cells })
    this._fetchMonthActs(year, month)
  },

  // 某天是否有活动(已加载列表 + 月历标记缓存)
  _hasActivity(dateStr) {
    if (this._actDates && this._actDates[dateStr]) return true
    return this.data.activities.some(a => a.date === dateStr)
  },

  // 拉取该月活动日期,在月历对应格子下打小圆点
  _fetchMonthActs(year, month) {
    const start = this._fmtDate(new Date(year, month - 1, 1))
    const end = this._fmtDate(new Date(year, month, 0))
    return clientApi.listActivitiesByRange(start, end)
      .then(res => {
        this._actDates = this._actDates || {}
        for (const item of (res.items || [])) {
          if (item.date) this._actDates[item.date] = true
        }
        // 用户仍停留在该月时才刷新标记,避免快速翻月时串数据
        if (this.data.calVisible && this.data.calYear === year && this.data.calMonth === month) {
          const cells = this.data.calCells.map(c =>
            c.inMonth ? Object.assign({}, c, { hasAct: this._hasActivity(c.dateStr) }) : c
          )
          this.setData({ calCells: cells })
        }
      })
      .catch(() => {})
  },

  // 点击触发的滚动期间,暂停滚动联动,避免选中态来回跳
  _lockTapScroll() {
    this._tapScrollLock = true
    clearTimeout(this._tapScrollTimer)
    this._tapScrollTimer = setTimeout(() => {
      this._tapScrollLock = false
    }, 500)
  },

  _scrollToDate(dateStr) {
    const group = this.data.grouped.find(g => g.date === dateStr)
    if (!group) return
    const query = wx.createSelectorQuery()
    query.select(`#day-${dateStr}`).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(res => {
      const rect = res && res[0]
      const scroll = res && res[1]
      if (!rect || !scroll) return
      wx.pageScrollTo({
        scrollTop: Math.max(scroll.scrollTop + rect.top - 120, 0),
        duration: 250,
      })
    })
  },

  // 测量各日期分组的文档位置,供滚动联动使用
  _measureGroups() {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery()
      query.selectViewport().scrollOffset()
      query.selectAll('.day-group').fields({ id: true, rect: true })
      query.exec(res => {
        const scroll = res && res[0]
        const nodes = res && res[1]
        if (!scroll || !nodes) return
        this._groupTops = nodes
          .filter(n => n.id && n.id.indexOf('day-') === 0)
          .map(n => ({ dateStr: n.id.slice(4), top: n.top + scroll.scrollTop }))
          .sort((a, b) => a.top - b.top)
      })
    })
  },

  // 列表项预处理：类型标签、线上标记、老师·简介合并行
  _decorate(item) {
    const teachers = (item.teacher_names || []).join('、')
    let meta = ''
    if (teachers && item.description) {
      meta = `${teachers} · ${item.description}`
    } else {
      meta = teachers || item.description || ''
    }
    // 判断活动状态：已结束 / 进行中 / 未开始
    let expiredStatus = '' // '' = 未开始, 'ongoing' = 进行中, 'ended' = 已结束
    if (item.date && item.start_time) {
      const now = new Date()
      const actStart = new Date(`${item.date}T${item.start_time}:00`)
      if (!isNaN(actStart.getTime())) {
        if (item.end_time) {
          const actEnd = new Date(`${item.date}T${item.end_time}:00`)
          if (!isNaN(actEnd.getTime()) && now >= actEnd) {
            expiredStatus = 'ended'
          }
        }
        if (!expiredStatus && now >= actStart) {
          expiredStatus = 'ongoing'
        }
      }
    }
    return {
      ...item,
      typeLabel: item.course_type || '',
      typeClass: item.course_type ? `tag-t${this._hashIndex(item.course_type) + 1}` : '',
      isOnline: item.activity_mode === '线上',
      isExpired: !!expiredStatus,
      expiredStatus,
      meta,
    }
  },

  // 同一类型名永远落在同一个 pastel 颜色上
  _hashIndex(str) {
    let h = 0
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) % 997
    }
    return h % TYPE_CLASS_COUNT
  },

  _groupByDate(items) {
    const map = {}
    for (const item of items) {
      const date = item.date || '未知日期'
      if (!map[date]) {
        map[date] = {
          date,
          dateLabel: this._dateLabel(date),
          weekday: this._getWeekday(date),
          isToday: date === this.data.todayStr,
          items: [],
        }
      }
      map[date].items.push(item)
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  },

  _countInRange(items, start, end) {
    if (!start || !end) return items.length
    return items.filter(i => i.date >= start && i.date <= end).length
  },

  _dateLabel(dateStr) {
    if (!dateStr || dateStr === '未知日期') return '日期待定'
    const parts = dateStr.split('-')
    if (parts.length < 3) return dateStr
    return `${Number(parts[1])}月${Number(parts[2])}日`
  },

  _getWeekday(dateStr) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const d = new Date((dateStr || '').replace(/-/g, '/'))
    if (isNaN(d.getTime())) return ''
    return days[d.getDay()]
  },

  _fmtDate(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  },

  _isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  },

  onTapActivity(e) {
    const id = e.currentTarget.dataset.id
    const url = `/pages/activity-detail/index?id=${id}`
    const app = getApp()
    if (app.isLoggedIn()) {
      wx.navigateTo({ url })
    } else {
      // 未登录:先去统一登录页,登录成功后自动进入该活动详情
      wx.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(url)}` })
    }
  },
})
