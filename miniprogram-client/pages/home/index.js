const { clientApi, resolveResourceUrl, cacheImage } = require('../../utils/api')

// 类型标签 pastel 配色数量（与 wxss 中 tag-t1~t4 对应）
const TYPE_CLASS_COUNT = 4

// 周一至周日主题装饰图（数组下标与 Date#getDay 对齐）
const THEME_DECO_BY_WEEKDAY = [
  '/assets/weekly-sun.png',
  '/assets/weekly-mon.png',
  '/assets/weekly-tue.png',
  '/assets/weekly-wed.png',
  '/assets/weekly-thu.png',
  '/assets/weekly-fri.png',
  '/assets/weekly-sat.png',
]

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
    weekPages: [],
    weekSwiperCurrent: 1,
    weekSwiperDuration: 220,
    heroText: '',
    heroWeek: '',
    themeWeek: '',
    themeTitle: '',
    themeDesc: '',
    themeDecoSrc: '/assets/weekly-mon.png',
    heroImage: '',
    heroExpanded: false,
    themeCount: 0,
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
    // 首次显示的加载已由 onLoad 发起，避免重复请求
    if (!this._hasShown) {
      this._hasShown = true
      return
    }
    // 从详情页或其他页面返回时，只刷新当前选中周，保留历史日期
    this._buildWeek()
    this._refreshSelectedWeek()
  },

  onPullDownRefresh() {
    this._refreshSelectedWeek().then(() => wx.stopPullDownRefresh())
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
        const selectedDate = this._pickInitialDate(items)
        this.setData({
          activities: items,
          grouped: this._groupForDate(items, selectedDate),
          total: res.total || 0,
          page: 1,
          hasMore: (res.items || []).length >= this.data.pageSize,
          loading: false,
          weekCount: this._countInRange(items, this.data.weekStart, this.data.weekEnd),
        }, () => {
          const shouldMoveToActivityDate = selectedDate && selectedDate !== this.data.selectedStr
          if (shouldMoveToActivityDate) {
            this._syncSelected(selectedDate)
          }
          this._measureGroups()
          this._cacheActivityImages(items)
          this._refreshWeekDots()
          if (!shouldMoveToActivityDate) this._refreshTheme()
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
        const all = [...this.data.activities, ...(res.items || []).map(item => this._decorate(item))]
        const selectedDate = this.data.selectedStr || this.data.todayStr
        this.setData({
          activities: all,
          grouped: this._groupForDate(all, selectedDate),
          page: nextPage,
          hasMore: (res.items || []).length >= this.data.pageSize,
          loading: false,
          weekCount: this._countInRange(all, this.data.weekStart, this.data.weekEnd),
        }, () => {
          this._measureGroups()
          this._cacheActivityImages(all)
          this._refreshWeekDots()
          this._refreshTheme()
        })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  // 周日历：以 anchor 所在周为准（默认已选日期/今天所在周），周一~周日
  _buildWeek(anchor, instantRecenter) {
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
    const buildDays = (weekOffset) => names.map((name, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + weekOffset * 7 + i)
      const dateStr = this._fmtDate(d)
      return {
        name,
        num: d.getDate(),
        dateStr,
        isToday: this._isSameDay(d, now),
        selected: dateStr === sel,
        hasActivity: this._hasActivity(dateStr),
      }
    })
    const weekDays = buildDays(0)
    const weekPages = [-1, 0, 1].map(offset => {
      const days = buildDays(offset)
      return { key: days[0].dateStr, days }
    })
    const weekStart = this._fmtDate(monday)
    const weekEnd = this._fmtDate(sunday)
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const wd = weekdays[selDate.getDay()]
    const heroWeek = this._isSameDay(selDate, now) ? `${wd} · 今天` : wd
    const dayActs = this.data.activities.filter(a => a.date === sel)
    this.setData({
      weekDays,
      weekPages,
      weekSwiperCurrent: 1,
      heroText: `${selDate.getMonth() + 1}月${selDate.getDate()}日`,
      heroWeek,
      themeDecoSrc: THEME_DECO_BY_WEEKDAY[selDate.getDay()],
      heroImage: this._heroImageForDay(sel),
      themeCount: dayActs.length,
      todayStr: this._fmtDate(now),
      selectedStr: sel,
      grouped: this._groupForDate(this.data.activities, sel),
      weekStart,
      weekEnd,
      weekCount: this._countInRange(this.data.activities, weekStart, weekEnd),
    }, () => {
      this._fetchWeekDots()
      if (instantRecenter) {
        wx.nextTick(() => {
          this._weekSwiperRecentering = false
          this.setData({ weekSwiperDuration: 220 })
        })
      }
    })
  },

  // 根据活动日期缓存刷新周日历圆点
  _refreshWeekDots() {
    const weekDays = this.data.weekDays.map(w => ({
      ...w,
      hasActivity: this._hasActivity(w.dateStr),
    }))
    const weekPages = this.data.weekPages.map(page => ({
      ...page,
      days: page.days.map(day => ({
        ...day,
        hasActivity: this._hasActivity(day.dateStr),
      })),
    }))
    this.setData({ weekDays, weekPages })
  },

  // 圆点提前拉取前一周、当前周、后一周，滑动时直接显示
  _fetchWeekDots() {
    if (!this.data.weekStart || !this.data.weekEnd) return Promise.resolve()
    const startDate = new Date(this.data.weekStart.replace(/-/g, '/'))
    startDate.setDate(startDate.getDate() - 7)
    const endDate = new Date(this.data.weekEnd.replace(/-/g, '/'))
    endDate.setDate(endDate.getDate() + 7)
    const start = this._fmtDate(startDate)
    const end = this._fmtDate(endDate)
    const requestKey = `${start}|${end}`
    this._weekDotsRequestKey = requestKey
    return clientApi.listActivitiesByRange(start, end)
      .then(res => {
        this._actDates = this._actDates || {}
        const cursor = new Date(start.replace(/-/g, '/'))
        const last = new Date(end.replace(/-/g, '/'))
        while (cursor <= last) {
          delete this._actDates[this._fmtDate(cursor)]
          cursor.setDate(cursor.getDate() + 1)
        }
        for (const item of (res.items || [])) {
          if (item.date) this._actDates[item.date] = true
        }
        if (this._weekDotsRequestKey === requestKey) this._refreshWeekDots()
      })
      .catch(() => {})
  },

  // 取某日第一个有图片的活动作为 hero 背景图
  _heroImageForDay(dateStr) {
    const act = this.data.activities.find(a => a.date === dateStr && a.list_image)
    return act ? act.list_image : ''
  },

  // 刷新今日主题：从后端拉取 day_theme
  _refreshTheme() {
    const sel = this.data.selectedStr || this.data.todayStr
    const requestSeq = (this._themeRequestSeq || 0) + 1
    this._themeRequestSeq = requestSeq
    const dayActs = this.data.activities.filter(a => a.date === sel)
    this.setData({ themeCount: dayActs.length, heroImage: this._heroImageForDay(sel) })
    // 拉取该天的主题
    clientApi.getActivityThemes(sel, sel)
      .then(res => {
        if (requestSeq !== this._themeRequestSeq || sel !== this.data.selectedStr) return
        const list = Array.isArray(res) ? res : (res.items || [])
        const theme = list[0]
        if (theme && theme.day_theme) {
          this.setData({
            themeWeek: theme.week_theme || '',
            themeTitle: theme.day_theme,
            themeDesc: theme.day_theme_detail || '',
          })
        } else {
          this.setData({ themeWeek: '', themeTitle: '', themeDesc: '' })
        }
      })
      .catch(() => {})
  },

  // 统一改选中日期：同周只挪选中态,跨周重建周日历;顶部胶囊跟随
  _syncSelected(dateStr) {
    this.setData({
      selectedStr: dateStr,
      grouped: this._groupForDate(this.data.activities, dateStr),
    })
    const d = new Date(dateStr.replace(/-/g, '/'))
    const heroText = `${d.getMonth() + 1}月${d.getDate()}日`
    const now = new Date()
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const wd = weekdays[d.getDay()]
    const heroWeek = this._isSameDay(d, now) ? `${wd} · 今天` : wd
    const dayActs = this.data.activities.filter(a => a.date === dateStr)
    const inWeek = dateStr >= this.data.weekStart && dateStr <= this.data.weekEnd
    if (inWeek) {
      const weekDays = this.data.weekDays.map(w => ({
        ...w,
        selected: w.dateStr === dateStr,
      }))
      const weekPages = this.data.weekPages.map(page => ({
        ...page,
        days: page.days.map(day => ({
          ...day,
          selected: day.dateStr === dateStr,
        })),
      }))
      this.setData({
        weekDays,
        weekPages,
        heroText,
        heroWeek,
        themeDecoSrc: THEME_DECO_BY_WEEKDAY[d.getDay()],
        heroImage: this._heroImageForDay(dateStr),
        themeCount: dayActs.length,
      })
      this._refreshTheme()
    } else {
      this._buildWeek(d)
      this._refreshTheme()
    }
  },

  // 点击周日历：仅显示选中日期的活动
  onTapDay(e) {
    const dateStr = e.currentTarget.dataset.date
    if (!dateStr) return
    this._gotoDate(dateStr)
  },

  // 左右滑动只浏览整周，不改变当前选中日期和活动内容
  onWeekSwiperChange(e) {
    const current = Number(e.detail.current)
    if (this._weekSwiperRecentering || current === 1) return
    const visibleWeekStart = this.data.weekStart || this.data.selectedStr || this.data.todayStr
    const target = new Date(visibleWeekStart.replace(/-/g, '/'))
    target.setDate(target.getDate() + (current === 0 ? -7 : 7))
    this._weekSwiperRecentering = true
    this.setData({ weekSwiperDuration: 0 }, () => {
      this._buildWeek(target, true)
    })
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

  // 拦截日历内容区点击，避免事件冒泡到遮罩后关闭弹窗
  onCalContentTap() {},

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

  // 月历点选某天：切换周日历到该周并显示当天活动
  onCalTapDay(e) {
    const dateStr = e.currentTarget.dataset.date
    if (!dateStr) return
    this.setData({ calVisible: false })
    this._gotoDate(dateStr)
  },

  // 统一定位到某天：选中 → 若当天尚未加载则按周补拉数据
  _gotoDate(dateStr) {
    this._lockTapScroll()
    this._syncSelected(dateStr)
    const hasLoaded = this.data.activities.some(item => item.date === dateStr)
    if (!hasLoaded) this._fetchWeekFor(dateStr)
  },

  _refreshSelectedWeek() {
    const selectedDate = this.data.selectedStr || this.data.todayStr
    if (!selectedDate) return this.loadActivities()
    return this._fetchWeekFor(selectedDate, true)
  },

  // 按周拉取活动：定位新日期时合并，页面刷新时替换当前周
  _fetchWeekFor(dateStr, replaceRange = false) {
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
        if (!items.length && !replaceRange) return
        const currentItems = replaceRange
          ? this.data.activities.filter(item => item.date < start || item.date > end)
          : this.data.activities
        const map = {}
        for (const a of currentItems) map[a.id] = a
        for (const a of items) map[a.id] = a
        const all = Object.values(map)
        this.setData({
          activities: all,
          grouped: this._groupForDate(all, dateStr),
          weekCount: this._countInRange(all, this.data.weekStart, this.data.weekEnd),
        }, () => {
          this._measureGroups()
          this._cacheActivityImages(all)
        })
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
        this._refreshWeekDots()
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

  // 列表项预处理：类型标签、线上标记、位置行、简介行、时长文本
  _decorate(item) {
    const teacherNames = item.teacher_names || []
    const teachers = teacherNames.join('、')
    const teacherProfiles = Array.isArray(item.teachers) && item.teachers.length
      ? item.teachers
      : teacherNames.map(name => ({ name, avatar_url: '' }))
    const teacherPreview = teacherProfiles.slice(0, 3).map(teacher => ({
      name: teacher.name || '',
      initial: (teacher.name || '').slice(0, 1),
      avatarUrl: resolveResourceUrl(teacher.avatar_url),
      sourceUrl: resolveResourceUrl(teacher.avatar_url),
    }))
    const location = (item.location || '').trim()
    // 只显示老师名字，不显示地址
    const locationText = teachers
    // 简介行: 截取前 30 字
    const description = (item.description || '').replace(/\s+/g, ' ').trim()
    const introText = description.length > 30 ? description.slice(0, 30) + '…' : description
    // 时长文本
    let durationText = ''
    if (item.start_time && item.end_time) {
      const [sh, sm] = item.start_time.split(':').map(Number)
      const [eh, em] = item.end_time.split(':').map(Number)
      const mins = (eh * 60 + em) - (sh * 60 + sm)
      if (mins > 0) {
        if (mins >= 60) {
          const h = Math.floor(mins / 60)
          const m = mins % 60
          durationText = m > 0 ? `约 ${h} 小时 ${m} 分钟` : `约 ${h} 小时`
        } else {
          durationText = `约 ${mins} 分钟`
        }
      }
    }
    // 判断活动状态：已结束 / 进行中 / 未开始
    let expiredStatus = '' // '' = 未开始, 'ongoing' = 进行中, 'ended' = 已结束
    if (item.date) {
      const now = new Date()
      const dayEnd = new Date(`${item.date}T23:59:59`)
      const actStart = item.start_time
        ? new Date(`${item.date}T${item.start_time}:00`)
        : null
      const actEnd = item.end_time
        ? new Date(`${item.date}T${item.end_time}:00`)
        : null

      if (actEnd && !isNaN(actEnd.getTime()) && now >= actEnd) {
        expiredStatus = 'ended'
      } else if ((!actEnd || isNaN(actEnd.getTime())) && !isNaN(dayEnd.getTime()) && now > dayEnd) {
        // 未配置结束时间的历史活动，在活动日期结束后视为已结束
        expiredStatus = 'ended'
      } else if (actStart && !isNaN(actStart.getTime()) && now >= actStart) {
        expiredStatus = 'ongoing'
      }
    }
    // badge: 卡片右侧的胶囊标签
    const todayStr = this.data.todayStr
    const isToday = item.date === todayStr
    let badge = ''
    let badgeClass = ''
    if (isToday && expiredStatus !== 'ended') {
      badge = '今晚'
      badgeClass = 'card-pill'
    }
    // 拼接完整图片 URL（后端返回相对路径，小程序需要完整地址）
    const listImage = resolveResourceUrl(item.list_image)
    return {
      ...item,
      list_image: listImage,
      list_image_remote: listImage,
      typeLabel: item.course_type || '',
      typeClass: item.course_type ? `tag-t${this._hashIndex(item.course_type) + 1}` : '',
      isOnline: item.activity_mode === '线上',
      isPublicWelfare: !!item.is_public_welfare,
      isEnded: expiredStatus === 'ended',
      expiredStatus,
      locationText,
      teacherPreview,
      introText,
      durationText,
      badge,
      badgeClass,
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

  _cacheActivityImages(items) {
    Promise.all(items.map(item => {
      const listImageSource = item.list_image_remote || item.list_image
      const listImagePromise = listImageSource
        ? cacheImage(listImageSource)
        : Promise.resolve(listImageSource)
      const teachersPromise = Promise.all((item.teacherPreview || []).map(teacher => {
        const sourceUrl = teacher.sourceUrl || teacher.avatarUrl
        if (!sourceUrl) return Promise.resolve(teacher)
        return cacheImage(sourceUrl).then(avatarUrl => (
          avatarUrl === teacher.avatarUrl ? teacher : { ...teacher, avatarUrl }
        ))
      }))
      return Promise.all([listImagePromise, teachersPromise]).then(([listImage, teacherPreview]) => ({
        ...item,
        list_image: listImage,
        teacherPreview,
      }))
    })).then(localItems => {
      const changed = localItems.some((item, index) => {
        if (item.list_image !== items[index].list_image) return true
        return item.teacherPreview.some((teacher, teacherIndex) => (
          teacher.avatarUrl !== items[index].teacherPreview[teacherIndex].avatarUrl
        ))
      })
      if (!changed) return
      const currentIds = this.data.activities.map(item => item.id).join(',')
      const sourceIds = items.map(item => item.id).join(',')
      if (currentIds !== sourceIds) return
      this.setData({
        activities: localItems,
        grouped: this._groupForDate(localItems, this.data.selectedStr || this.data.todayStr),
      }, () => this._measureGroups())
    })
  },

  onActivityImageError(e) {
    const activityId = e.currentTarget.dataset.id
    if (!activityId) return
    const activity = this.data.activities.find(item => item.id === activityId)
    if (
      !activity
      || !activity.list_image_remote
      || activity.list_image === activity.list_image_remote
    ) return

    if (activity.list_image.startsWith(wx.env.USER_DATA_PATH)) {
      wx.getFileSystemManager().unlink({
        filePath: activity.list_image,
        fail: () => {},
      })
    }
    const activities = this.data.activities.map(item => (
      item.id === activityId
        ? { ...item, list_image: item.list_image_remote }
        : item
    ))
    this.setData({
      activities,
      grouped: this._groupForDate(activities, this.data.selectedStr || this.data.todayStr),
    })
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

  _groupForDate(items, dateStr) {
    return this._groupByDate(items.filter(item => item.date === dateStr))
  },

  // 默认优先今天，其次最近的未来活动；没有未来活动时定位到最近一场历史活动
  _pickInitialDate(items) {
    const today = this.data.todayStr || this._fmtDate(new Date())
    if (items.some(item => item.date === today)) return today
    const future = items
      .map(item => item.date)
      .filter(date => date && date > today)
      .sort()
    if (future.length) return future[0]
    const past = items
      .map(item => item.date)
      .filter(date => date && date < today)
      .sort()
      .reverse()
    return past[0] || today
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

  onToggleHero() {
    this.setData({ heroExpanded: !this.data.heroExpanded })
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
