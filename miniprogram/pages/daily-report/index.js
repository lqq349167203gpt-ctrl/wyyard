const { visitApi, classRecordApi, customerApi, memberIdentityApi, paymentApi, spaceApi } = require('../../utils/api')
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

function formatMoney(n) {
  const num = Math.round(Number(n || 0))
  const s = String(num)
  let out = ''
  let count = 0
  for (let i = s.length - 1; i >= 0; i--) {
    out = s[i] + out
    count++
    if (count % 3 === 0 && i > 0) out = ',' + out
  }
  return out
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
    weekdays: WEEKDAYS,
    spaces: [],
    spaceIndex: 0,
    spaceId: '',
    currentSpaceName: '',
    activeTab: 'customers',
    loading: true,
    visits: [],
    activities: [],
    financeRows: [],
    financeTotal: '¥0',
    byMethod: [],
    deductionRows: [],
    tabCounts: { customers: 0, activities: 0, finance: 0, deductions: 0 },
  },

  // 静态数据缓存（首次加载拉取，切换日期/空间不重复拉）
  _customers: [],
  _customerMap: {},
  _memberIdentities: [],
  _paymentData: null,

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('daily-report')) {
      this.setData({ hasPagePermission: false })
      return
    }
    const now = new Date()
    const savedDate = wx.getStorageSync('visit_selected_date')
    const date = savedDate || formatDate(now)
    const d = savedDate ? new Date(savedDate) : now
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
    })
    this._loadStatic().then(() => this.loadSpaces()).then(() => {
      this._ready = true
      if (this._pendingShowLoad) {
        this._pendingShowLoad = false
        this.loadData()
      }
    })
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (!this._ready) {
      this._pendingShowLoad = true
      return
    }
    this.loadData()
  },

  _formatDateShort(date) {
    const d = new Date(date)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  // ---------- 静态数据（客户/会员身份/付费项目/销卡记录）----------

  async _loadStatic() {
    try {
      const [customers, memberIdentities, paymentData] = await Promise.all([
        customerApi.list(),
        memberIdentityApi.list(),
        this._loadPaymentData(),
      ])
      const customerMap = {}
      for (const c of customers) customerMap[c.id] = c
      this._customers = customers
      this._customerMap = customerMap
      this._memberIdentities = memberIdentities || []
      this._paymentData = paymentData
    } catch (e) {
      console.error('加载静态数据失败:', e)
    }
  },

  async _loadPaymentData() {
    const [cards, groups, emotions, ohs, energies, courses, others, deductions] = await Promise.all([
      paymentApi.membershipCards.list().catch(() => []),
      paymentApi.groupCases.list().catch(() => []),
      paymentApi.emotionalReleases.list().catch(() => []),
      paymentApi.ohCardReadings.list().catch(() => []),
      paymentApi.energyKnots.list().catch(() => []),
      paymentApi.internalCourses.list().catch(() => []),
      paymentApi.otherProjects.list().catch(() => []),
      paymentApi.deductions.list().catch(() => []),
    ])
    return { cards, groups, emotions, ohs, energies, courses, others, deductions }
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
      await this.loadData()
    } catch (e) {
      console.error('加载空间失败:', e)
      this.loadData()
    }
  },

  onSpaceChange(e) {
    const index = e.detail.value
    const space = this.data.spaces[index]
    this.setData({
      spaceIndex: index,
      spaceId: space?.id || '',
      currentSpaceName: space?.name || '',
    })
    wx.setStorageSync('visit_space_index', index)
    this.loadData()
  },

  // ---------- 日历 ----------

  onCalendarToggle() {
    if (this.data.calendarExpanded) {
      this.setData({ calendarExpanded: false })
    } else {
      this.setData({
        calendarExpanded: true,
        calendarDays: buildCalendar(this.data.calYear, this.data.calMonth, this.data.currentDate, this._calendarCounts || {}),
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
    this._setMonth(calYear, calMonth)
  },

  onNextMonth() {
    let { calYear, calMonth } = this.data
    calMonth++
    if (calMonth > 11) { calMonth = 0; calYear++ }
    this._setMonth(calYear, calMonth)
  },

  async _setMonth(year, month) {
    this.setData({ calYear: year, calMonth: month })
    await this._loadCounts()
  },

  onCalendarDayTap(e) {
    const date = e.currentTarget.dataset.date
    const d = new Date(date)
    wx.setStorageSync('visit_selected_date', date)
    this.setData({
      currentDate: date,
      currentDateShort: this._formatDateShort(date),
      currentWeekday: '周' + WEEKDAYS[d.getDay()],
      calYear: d.getFullYear(),
      calMonth: d.getMonth(),
      calendarExpanded: false,
    })
    this.loadData()
  },

  async _loadCounts() {
    const { calYear, calMonth, spaceId } = this.data
    try {
      const counts = await visitApi.counts({
        start_date: `${calYear}-${pad(calMonth + 1)}-01`,
        end_date: this._monthEnd(calYear, calMonth),
        space_id: spaceId || undefined,
      })
      this._calendarCounts = counts || {}
      this.setData({
        calendarDays: buildCalendar(calYear, calMonth, this.data.currentDate, this._calendarCounts),
      })
    } catch (e) {
      console.error('加载日历计数失败:', e)
    }
  },

  _monthEnd(year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate()
    return `${year}-${pad(month + 1)}-${pad(lastDay)}`
  },

  // ---------- 数据加载 ----------

  async loadData() {
    if (this._loading) return
    this._loading = true
    this.setData({ loading: true })
    try {
      const { currentDate, spaceId, calYear, calMonth } = this.data
      const sid = spaceId || undefined
      const [counts, visits, dashboard] = await Promise.all([
        visitApi.counts({ start_date: `${calYear}-${pad(calMonth + 1)}-01`, end_date: this._monthEnd(calYear, calMonth), space_id: sid }),
        visitApi.list(currentDate, sid),
        classRecordApi.dashboard(currentDate, sid),
      ])
      this._calendarCounts = counts || {}
      const result = this._assemble(visits || [], dashboard || {}, currentDate)
      this.setData(Object.assign({
        calendarDays: buildCalendar(calYear, calMonth, currentDate, this._calendarCounts),
        loading: false,
      }, result))
    } catch (e) {
      console.error('加载每日报表失败:', e)
      this.setData({ loading: false })
    } finally {
      this._loading = false
    }
  },

  _assemble(visits, dashboard, date) {
    const customerMap = this._customerMap
    const identityTypeMap = {}
    for (const m of this._memberIdentities) {
      if (m.type && m.name) identityTypeMap[m.name] = m.type
    }

    // 活动 tab：统一 6 类 session
    const activities = this._buildActivities(dashboard, identityTypeMap, customerMap)

    // 客户 tab
    const todayActMap = {}
    for (const a of activities) {
      for (const id of a.allIds) {
        todayActMap[id] = (todayActMap[id] || 0) + 1
      }
    }
    const payment = this._paymentData || { cards: [], groups: [], emotions: [], ohs: [], energies: [], courses: [], others: [], deductions: [] }
    const cardSet = this._buildHasCardSet(payment, date)
    const customerRows = (visits || []).map(v => {
      const c = customerMap[v.customer_id]
      const hasCard = cardSet.has(v.customer_id)
      const remaining = hasCard ? v.remaining_count : undefined
      return {
        id: v.id,
        customer_id: v.customer_id,
        nickname: v.nickname || '',
        identityText: identityTypeMap[v.member_type] === '新人' ? '新人' : '会员',
        identityGrey: identityTypeMap[v.member_type] === '新人',
        arrived: !!v.arrived,
        amountText: (v.daily_amount || 0) > 0 ? '¥' + formatMoney(v.daily_amount) : '—',
        hasAmount: (v.daily_amount || 0) > 0,
        invitedCount: v.invitation_count || 0,
        arrivedCount: v.arrived_count || 0,
        todayActCount: todayActMap[v.customer_id] || 0,
        remainingText: !hasCard ? '未办卡' : (remaining == null || remaining === -999 ? '不限' : remaining + '次'),
        needText: v.needs || '',
        infoText: v.feedback || v.experience || '',
        followText: (c && c.follow_up_node) || '',
        leaderText: v.group_leader_feedback || '',
        refText: v.referrer || '',
        refHandlerText: v.referrer_handler || '',
        visitTimeText: v.arrival_time || v.visit_time || '',
        open: false,
      }
    })

    // 财务 tab
    const finance = this._buildFinance(payment, date, customerMap)

    // 销卡 tab
    const deductionRows = this._buildDeductions(payment, activities, date, customerMap)

    return {
      visits: customerRows,
      activities,
      financeRows: finance.rows,
      financeTotal: finance.total,
      byMethod: finance.byMethod,
      deductionRows,
      tabCounts: {
        customers: customerRows.length,
        activities: activities.length,
        finance: finance.rows.length,
        deductions: deductionRows.length,
      },
    }
  },

  _buildActivities(dashboard, identityTypeMap, customerMap) {
    const list = []
    const build = (r, name, type, isWelfare, source) => {
      const teacherIds = r.teacher_ids || []
      const allIds = []
      const pushId = (id) => { if (id) allIds.push(id) }
      ;(r.participant_ids || []).forEach(pushId)
      ;(r.groups || []).forEach(g => {
        pushId(g.leader_id)
        pushId(g.deputy_id)
        ;(g.member_ids || []).forEach(pushId)
      })
      const uniqueIds = [...new Set(allIds)].filter(id => !teacherIds.includes(id))
      const oldMembers = []
      const newMembers = []
      uniqueIds.forEach(id => {
        const c = customerMap[id]
        if (!c || !c.nickname) return
        if (identityTypeMap[c.member_type] === '新人') newMembers.push(c.nickname)
        else oldMembers.push(c.nickname)
      })
      return {
        id: `${source}_${r.id}`,
        name: name || type,
        type,
        isWelfare: !!isWelfare,
        typeText: type + (isWelfare ? ' · 公益' : ''),
        timeText: r.start_time && r.end_time ? `${r.start_time}-${r.end_time}` : r.start_time || '',
        teacherText: (r.teacher_names || []).join('、'),
        count: uniqueIds.length,
        oldCount: oldMembers.length,
        newCount: newMembers.length,
        oldText: oldMembers.join('、'),
        newText: newMembers.join('、'),
        allIds: uniqueIds,
        open: false,
      }
    }

    ;(dashboard.class_records || []).forEach(r => {
      list.push(build(r, r.activity_name || r.course_name || '', r.course_type || '沙龙', r.is_public_welfare, 'cr'))
    })
    ;(dashboard.gcs_sessions || []).forEach(r => {
      list.push(build(r, r.name || (r.owner_name ? '觉醒游戏·' + r.owner_name : '觉醒游戏'), '觉醒', false, 'gcs'))
    })
    ;(dashboard.ers_sessions || []).forEach(r => {
      list.push(build(r, r.name || (r.achiever_name ? '情绪释放·' + r.achiever_name : '情绪释放'), '情绪释放', false, 'ers'))
    })
    ;(dashboard.eks_sessions || []).forEach(r => {
      list.push(build(r, r.name || ((r.teacher_names || [])[0] ? '能量结·' + r.teacher_names[0] : '能量结'), '能量结', false, 'eks'))
    })
    ;(dashboard.ics_sessions || []).forEach(r => {
      list.push(build(r, r.course_name || r.course_type || '', '内部课程', false, 'ics'))
    })
    ;(dashboard.ocr_sessions || []).forEach(r => {
      list.push(build(r, r.name || (r.achiever_name ? 'OH卡·' + r.achiever_name : 'OH卡'), 'OH卡', false, 'ocr'))
    })

    list.sort((a, b) => (a.timeText || '').localeCompare(b.timeText || ''))
    return list
  },

  _buildHasCardSet(payment, date) {
    const cardSet = new Set()
    for (const c of payment.cards || []) {
      if (!c.is_deleted && !c.voided) cardSet.add(c.customer_id)
    }
    for (const c of payment.courses || []) {
      if (!c.is_deleted && !c.voided && (!c.expiry_date || c.expiry_date >= date)) cardSet.add(c.customer_id)
    }
    return cardSet
  },

  _buildFinance(payment, date, customerMap) {
    const rows = []
    const addItem = (item, type) => {
      if (item.deal_date !== date) return
      if (item.voided) return
      if (item.is_deleted) return
      const customer = customerMap[item.customer_id]
      let itemName = ''
      let itemType = ''
      let amount = 0
      let purchaseCount = null
      let remainingCount = null
      switch (type) {
        case 'membership_card':
          itemType = '会员卡'
          itemName = item.card_type || ''
          amount = item.price || 0
          purchaseCount = item.total_count != null ? item.total_count : null
          remainingCount = item.remaining_count
          break
        case 'group_case':
          itemType = '觉醒游戏'
          amount = item.amount || 0
          purchaseCount = item.purchase_count || 0
          break
        case 'emotional_release':
          itemType = '情绪释放'
          amount = item.amount || 0
          purchaseCount = item.purchase_count || 0
          break
        case 'oh_card_reading':
          itemType = 'OH卡梳理'
          amount = item.amount || 0
          purchaseCount = item.purchase_count || 0
          break
        case 'energy_knot':
          itemType = '能量结'
          amount = item.amount || 0
          purchaseCount = item.purchase_count || 0
          break
        case 'internal_course':
          itemType = '内部课程'
          itemName = item.course_type || ''
          amount = item.price || 0
          break
        case 'other':
          itemType = '其他项目'
          itemName = item.project_name || item.category || ''
          amount = item.fee || 0
          purchaseCount = item.total_count != null ? item.total_count : null
          remainingCount = item.remaining_count
          break
      }
      const closerNames = (item.closers || []).map(c => c && c.name).filter(Boolean).join('、')
        || item.closer_name || ''
      rows.push({
        id: item.id,
        nickname: item.nickname || customer?.nickname || '',
        referrer: customer?.referrer || '',
        item_type: itemType,
        item_name: itemName,
        purchase_count: purchaseCount,
        remaining_count: remainingCount,
        purchaseCountText: purchaseCount != null && purchaseCount > 0 ? '购买 ' + purchaseCount + ' 次' : '',
        remainingText: remainingCount === -999 ? '不限'
          : remainingCount != null ? remainingCount + '次'
          : type === 'membership_card' ? '不限'
          : '',
        closer_name: closerNames,
        payment_method: item.payment_method || '',
        amount,
        amountText: '¥' + formatMoney(amount),
      })
    }
    for (const i of payment.cards || []) addItem(i, 'membership_card')
    for (const i of payment.groups || []) addItem(i, 'group_case')
    for (const i of payment.emotions || []) addItem(i, 'emotional_release')
    for (const i of payment.ohs || []) addItem(i, 'oh_card_reading')
    for (const i of payment.energies || []) addItem(i, 'energy_knot')
    for (const i of payment.courses || []) addItem(i, 'internal_course')
    for (const i of payment.others || []) addItem(i, 'other')

    const total = rows.reduce((s, r) => s + (r.amount || 0), 0)
    const methodMap = {}
    for (const r of rows) {
      if (r.payment_method) methodMap[r.payment_method] = (methodMap[r.payment_method] || 0) + (r.amount || 0)
    }
    const byMethod = Object.keys(methodMap).map(k => ({ method: k, amountText: '¥' + formatMoney(methodMap[k]) }))
    return { rows, total: '¥' + formatMoney(total), byMethod }
  },

  _buildDeductions(payment, activities, date, customerMap) {
    const cardDeductionMap = {}
    for (const d of payment.deductions || []) {
      if (d.deduction_date === date && d.project_type === 'membership-cards') {
        cardDeductionMap[d.customer_id] = (cardDeductionMap[d.customer_id] || 0) + (d.count || 1)
      }
    }
    const activityDeductionMap = {}
    for (const a of activities) {
      if (a.isWelfare) continue
      for (const id of a.allIds) {
        activityDeductionMap[id] = (activityDeductionMap[id] || 0) + 1
      }
    }
    const customerCardMap = {}
    const courseCustomerIds = new Set()
    for (const c of payment.cards || []) {
      if (!c.is_deleted && !c.voided) {
        customerCardMap[c.customer_id] = customerCardMap[c.customer_id] || c
      }
    }
    for (const c of payment.courses || []) {
      if (!c.is_deleted && !c.voided && (!c.expiry_date || c.expiry_date >= date)) {
        courseCustomerIds.add(c.customer_id)
      }
    }
    const ids = new Set([...Object.keys(cardDeductionMap), ...Object.keys(activityDeductionMap)])
    const rows = []
    ids.forEach(cid => {
      const customer = customerMap[cid]
      const card = customerCardMap[cid]
      const manual = cardDeductionMap[cid] || 0
      const act = activityDeductionMap[cid] || 0
      if (manual === 0 && act === 0) return
      const hasCard = !!card || courseCustomerIds.has(cid)
      const remaining = card ? card.remaining_count : null
      rows.push({
        customer_id: cid,
        nickname: customer?.nickname || '',
        card_type: card?.card_type || (courseCustomerIds.has(cid) ? '疗愈师' : ''),
        has_card: hasCard,
        manualText: manual > 0 ? manual + '次' : '',
        activityText: act > 0 ? act + '次' : '',
        remainingText: !hasCard ? '未办卡' : (remaining == null || remaining === -999) ? '不限' : remaining + '次',
        manualMuted: manual === 0,
        activityMuted: act === 0,
        cardMuted: !hasCard,
      })
    })
    return rows
  },

  // ---------- 交互 ----------

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
  },

  onVisitToggle(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`visits[${idx}].open`]: !this.data.visits[idx].open })
  },

  onActivityToggle(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`activities[${idx}].open`]: !this.data.activities[idx].open })
  },
})
