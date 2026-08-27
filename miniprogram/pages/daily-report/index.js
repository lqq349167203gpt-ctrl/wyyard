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

// 估算文本显示宽度：CJK 记 1，其他字符记 0.55（按 22rpx 字号折算）
function textWidth(str) {
  if (!str) return 0
  let w = 0
  for (let i = 0; i < str.length; i++) {
    w += str.charCodeAt(i) > 255 ? 1 : 0.55
  }
  return w
}

// 各列容量（单位：CJK 字宽），仅用于判断是否会被省略号截断
const COL_CAPACITY = {
  c3: 4.5, c4: 4, c5: 5,
  'a-c3': 5, 'a-c4': 6,
  'p-c2': 4, 'p-c6': 9,
}
const OVERFLOW_COLS = ['c3', 'c4', 'c5', 'a-c3', 'a-c4', 'p-c2', 'p-c6']

function flattenText(str) {
  return (str || '').replace(/\n+/g, ' ')
}

// 计算是否溢出，同时给每列生成缩略态单行文本 flat（把换行折叠成空格）
function rowOverflow(cols) {
  let overflow = false
  for (const c of cols) {
    c.flat = flattenText(c.text)
    if (OVERFLOW_COLS.indexOf(c.cls) >= 0 && textWidth(c.flat) > (COL_CAPACITY[c.cls] || 5)) {
      overflow = true
    }
  }
  return overflow
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
    // 详情弹窗
    detailOpen: false,
    detailType: 'visit',
    detailTitle: '',
    detailNickname: '',
    detailLoading: false,
    detailRows: [],
    detailHeader: [],
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
        identityText: v.member_type || '',
        hasIdentity: !!v.member_type,
        arrived: !!v.arrived,
        amountText: (v.daily_amount || 0) > 0 ? '¥' + formatMoney(v.daily_amount) : '-',
        hasAmount: (v.daily_amount || 0) > 0,
        invitedCount: v.invitation_count || 0,
        cancelledCount: v.cancelled_count || 0,
        arrivedCount: v.arrived_count || 0,
        todayActCount: todayActMap[v.customer_id] || 0,
        remainingText: !hasCard ? '未办卡' : (remaining == null || remaining === -999 ? '不限' : remaining + '次'),
        needText: v.needs || '',
        infoText: v.feedback || v.experience || '',
        followText: (c && c.follow_up_node) || '',
        refText: v.referrer || '',
        refHandlerText: v.referrer_handler || '',
        visitTimeText: v.arrival_time || v.visit_time || '',
        open: false,
      }
    })
    // 默认排序：已到店在前，未到店在后（与 PC 端 arrived desc 一致）
    customerRows.sort((a, b) => (b.arrived ? 1 : 0) - (a.arrived ? 1 : 0))

    // 财务 tab
    const finance = this._buildFinance(payment, date, customerMap)

    // 销卡 tab
    const deductionRows = this._buildDeductions(payment, activities, dashboard, date, customerMap)

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
        membershipDeductionCount: r.membership_deduction_count || 1,
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
          itemType = 'OH卡诊断'
          itemName = (item.diagnosis_duration ? (item.diagnosis_duration * 0.5) + '小时' : '')
          amount = item.amount || 0
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
          : remainingCount != null ? '剩余 ' + remainingCount + ' 次'
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

  _buildDeductions(payment, activities, dashboard, date, customerMap) {
    // 项目类型标签映射
    const projectLabelMap = {
      "group-cases": "觉醒游戏",
      "emotional-releases": "情绪释放",
      "energy-knots": "能量结",
    }

    // 1. 人工销卡：按 (customer_id, project_type, project_id) 分组，所有项目类型
    const manualDeductionMap = {}
    for (const d of payment.deductions || []) {
      if (d.deduction_date !== date) continue
      const key = `${d.customer_id}|${d.project_type}|${d.project_id}`
      const existing = manualDeductionMap[key]
      if (existing) {
        existing.count += (d.count || 1)
      } else {
        manualDeductionMap[key] = {
          customer_id: d.customer_id,
          nickname: d.nickname,
          project_type: d.project_type,
          project_id: d.project_id,
          project_name: d.project_name,
          count: d.count || 1,
          remaining_after: d.remaining_after != null ? d.remaining_after : null,
        }
      }
    }

    // 2. 会员卡活动销卡：activities 所有参与者
    const activityDeductionMap = {}
    for (const a of activities) {
      if (a.isWelfare) continue
      for (const id of a.allIds) {
        activityDeductionMap[id] = (activityDeductionMap[id] || 0) + (a.membershipDeductionCount || 1)
      }
    }

    // 3. 案主活动销卡：session 的 owner 扣对应项目类型
    const activityProjectDeductionMaps = {}
    // 觉醒游戏、情绪释放：案主每次扣 1
    for (const [sessions, projectType] of [[dashboard.gcs_sessions || [], "group-cases"], [dashboard.ers_sessions || [], "emotional-releases"]]) {
      for (const s of sessions) {
        if (!s.owner_id) continue
        const map = activityProjectDeductionMaps[projectType] || (activityProjectDeductionMaps[projectType] = {})
        map[s.owner_id] = (map[s.owner_id] || 0) + 1
      }
    }
    // 能量结：案主扣部位数（与后端 get_session_deduction_count 逻辑一致）
    for (const s of (dashboard.eks_sessions || [])) {
      if (!s.owner_id) continue
      const map = activityProjectDeductionMaps["energy-knots"] || (activityProjectDeductionMaps["energy-knots"] = {})
      let count = 1
      try {
        const desc = JSON.parse(s.description || "[]")
        if (Array.isArray(desc)) {
          const ownerItems = desc.filter(function (item) { return item.id === s.owner_id })
          if (ownerItems.length > 0) {
            count = ownerItems.reduce(function (sum, item) { return sum + Math.max(1, parseInt(item.count) || 1) }, 0)
          }
        }
      } catch (e) {}
      map[s.owner_id] = (map[s.owner_id] || 0) + count
    }

    // 4. 项目购买数据（用于计算剩余）
    const projectDataMap = {}
    for (const item of payment.groups || []) {
      if (item.is_deleted) continue
      const m = projectDataMap["group-cases"] || (projectDataMap["group-cases"] = {})
      m[item.customer_id] = { purchase_count: item.purchase_count || 0, id: item.id }
    }
    for (const item of payment.emotions || []) {
      if (item.is_deleted) continue
      const m = projectDataMap["emotional-releases"] || (projectDataMap["emotional-releases"] = {})
      m[item.customer_id] = { purchase_count: item.purchase_count || 0, id: item.id }
    }
    for (const item of payment.energies || []) {
      if (item.is_deleted) continue
      const m = projectDataMap["energy-knots"] || (projectDataMap["energy-knots"] = {})
      m[item.customer_id] = { purchase_count: item.purchase_count || 0, id: item.id }
    }

    // 5. 各项目历史总人工销卡次数（用于计算剩余）
    const totalDeductionByProject = {}
    for (const d of payment.deductions || []) {
      const k = `${d.project_type}|${d.project_id}`
      totalDeductionByProject[k] = (totalDeductionByProject[k] || 0) + (d.count || 1)
    }

    const rows = []

    // 人工销卡行
    for (const [key, entry] of Object.entries(manualDeductionMap)) {
      const customer = customerMap[entry.customer_id]
      rows.push({
        id: `manual_${key}`,
        customer_id: entry.customer_id,
        nickname: customer?.nickname || entry.nickname,
        card_name: entry.project_name,
        deduction_type: "人工销卡",
        has_card: true,
        count: entry.count,
        remaining_count: entry.remaining_after,
      })
    }

    // 会员卡活动销卡行
    const customerCardMap = {}
    const courseCustomerIds = new Set()
    for (const c of payment.cards || []) {
      if (!c.is_deleted && !c.voided) customerCardMap[c.customer_id] = c
    }
    for (const c of payment.courses || []) {
      if (!c.is_deleted && !c.voided && (!c.expiry_date || c.expiry_date >= date)) courseCustomerIds.add(c.customer_id)
    }
    for (const [cid, activityCount] of Object.entries(activityDeductionMap)) {
      const customer = customerMap[cid]
      const card = customerCardMap[cid]
      const hasCard = !!card || courseCustomerIds.has(cid)
      rows.push({
        id: `act_${cid}`,
        customer_id: cid,
        nickname: customer?.nickname || "",
        card_name: card?.card_type || (courseCustomerIds.has(cid) ? "疗愈师" : "会员卡"),
        deduction_type: "活动销卡",
        has_card: hasCard,
        count: activityCount,
        remaining_count: card ? card.remaining_count : null,
      })
    }

    // 案主活动销卡行（觉醒游戏/情绪释放/能量结）
    for (const [projectType, dedupMap] of Object.entries(activityProjectDeductionMaps)) {
      for (const [cid, activityCount] of Object.entries(dedupMap)) {
        const customer = customerMap[cid]
        const projData = projectDataMap[projectType]?.[cid]
        let remaining = null
        if (projData) {
          const totalDeducted = totalDeductionByProject[`${projectType}|${projData.id}`] || 0
          remaining = projData.purchase_count - totalDeducted
        }
        rows.push({
          id: `proj_${projectType}_${cid}`,
          customer_id: cid,
          nickname: customer?.nickname || "",
          card_name: projectLabelMap[projectType] || projectType,
          deduction_type: projectLabelMap[projectType] || projectType,
          has_card: !!projData,
          count: activityCount,
          remaining_count: remaining,
        })
      }
    }

    for (const r of rows) {
      r.remainingText = !r.has_card
        ? '未办卡'
        : (r.remaining_count == null || r.remaining_count === -999 ? '不限' : r.remaining_count + '次')
    }

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

  // ---------- 客户详情弹窗 ----------

  onNicknameTap(e) {
    const { customerId } = e.currentTarget.dataset
    if (!customerId) return
    wx.navigateTo({ url: '/pages/customer-profile/index?id=' + customerId })
  },

  onVisitStatTap(e) {
    const { customerId, type, nickname } = e.currentTarget.dataset
    this.openDetail(customerId, type, nickname)
  },

  async openDetail(customerId, type, nickname) {
    const titleMap = { visit: '到店记录', invited: '受邀记录', cancelled: '取消记录', activity_today: '今日参与记录', payment: '成交详情' }
    const headerMap = {
      visit: [
        { text: '日期', cls: 'c1' }, { text: '邀约人', cls: 'c2' }, { text: '来访需求', cls: 'c3' },
        { text: '客户信息', cls: 'c4' }, { text: '跟进点', cls: 'c5' },
      ],
      invited: [
        { text: '日期', cls: 'c1' }, { text: '邀约人', cls: 'c2' }, { text: '来访需求', cls: 'c3' },
        { text: '客户信息', cls: 'c4' }, { text: '跟进点', cls: 'c5' },
      ],
      cancelled: [
        { text: '日期', cls: 'c1' }, { text: '邀约人', cls: 'c2' }, { text: '来访需求', cls: 'c3' },
        { text: '客户信息', cls: 'c4' }, { text: '跟进点', cls: 'c5' },
      ],
      activity_today: [
        { text: '日期', cls: 'a-c1' }, { text: '类型', cls: 'a-c2' }, { text: '活动名称', cls: 'a-c3' },
        { text: '老师', cls: 'a-c4' }, { text: '身份', cls: 'a-c5' },
      ],
      payment: [
        { text: '项目类型', cls: 'p-c1' }, { text: '项目名称', cls: 'p-c2' }, { text: '购买场次', cls: 'p-c3' },
        { text: '金额', cls: 'p-c4' }, { text: '成交人', cls: 'p-c5' }, { text: '备注', cls: 'p-c6' },
      ],
    }
    // 表头在弹窗打开时就固定渲染，不依赖数据加载
    this.setData({
      detailOpen: true, detailType: type,
      detailTitle: titleMap[type] || '', detailNickname: nickname,
      detailLoading: true, detailRows: [], detailHeader: headerMap[type] || [],
    })
    try {
      const date = this.data.currentDate
      let records = []
      if (type === 'payment') {
        // 成交详情：当天该客户的成交（deal_date=所选日期，与 PC 财务口径一致）
        records = this._buildPaymentRecords(customerId, date).map(r => {
          const cols = [
            { text: r.c1, cls: 'p-c1' },
            { text: r.c2, cls: 'p-c2' },
            { text: r.c3, cls: 'p-c3' },
            { text: r.c4, cls: 'p-c4' },
            { text: r.c5, cls: 'p-c5' },
            { text: r.c6, cls: 'p-c6' },
          ]
          return { rowClass: 'detail-row', expanded: false, overflow: rowOverflow(cols), cols }
        })
      } else {
        const detail = await customerApi.detail(customerId, date)
        if (type === 'invited' || type === 'visit' || type === 'cancelled') {
          records = (detail.visit_records || [])
            .filter(v => type === 'cancelled' ? v.cancelled : type === 'visit' ? v.arrived : true)
            .map(v => {
              const cols = [
                { text: v.visit_date || '', cls: 'c1', cancelled: type === 'invited' && !!v.cancelled, unarrived: type === 'invited' && !v.arrived && !v.cancelled },
                { text: v.referrer_handler || '', cls: 'c2' },
                { text: v.needs || '', cls: 'c3' },
                { text: v.feedback || v.experience || '', cls: 'c4' },
                { text: v.healing_notes || '', cls: 'c5' },
              ]
              return { rowClass: 'detail-row', expanded: false, overflow: rowOverflow(cols), cols }
            })
        } else if (type === 'activity_today') {
          records = (detail.activities || [])
            .filter(a => a.date === date)
            .map(a => {
              const cols = [
                { text: a.date || '', cls: 'a-c1' },
                { text: a.type || '', cls: 'a-c2' },
                { text: a.name || '', cls: 'a-c3' },
                { text: a.host || '', cls: 'a-c4' },
                { text: a.role || '', cls: 'a-c5' },
              ]
              return { rowClass: 'detail-row', expanded: false, overflow: rowOverflow(cols), cols }
            })
        }
      }
      this.setData({ detailLoading: false, detailRows: records })
    } catch (e) {
      console.error('加载客户详情失败:', e)
      this.setData({ detailLoading: false, detailRows: [] })
    }
  },

  // 当天成交记录：按 deal_date=所选日期 过滤（与 PC 财务口径一致）
  _buildPaymentRecords(customerId, date) {
    const payment = this._paymentData || { cards: [], groups: [], emotions: [], ohs: [], energies: [], courses: [], others: [] }
    const records = []
    const add = (item, type) => {
      if (!item || item.customer_id !== customerId) return
      if (item.deal_date !== date) return
      if (item.voided) return
      if (item.is_deleted) return
      let c1 = ''
      let c2 = ''
      let quantity = null
      let amount = 0
      switch (type) {
        case 'membership_card':
          c1 = '会员卡'; c2 = item.card_type || ''; quantity = 1; amount = item.price || 0; break
        case 'group_case':
          c1 = '觉醒游戏'; c2 = '觉醒游戏'; quantity = item.purchase_count || 0; amount = item.amount || 0; break
        case 'emotional_release':
          c1 = '情绪释放'; c2 = '情绪释放'; quantity = item.purchase_count || 0; amount = item.amount || 0; break
        case 'oh_card_reading':
          c1 = 'OH卡诊断'; c2 = item.diagnosis_duration ? (item.diagnosis_duration * 0.5) + '小时' : 'OH卡诊断'; quantity = ''; amount = item.amount || 0; break
        case 'energy_knot':
          c1 = '能量结'; c2 = '能量结'; quantity = item.purchase_count || 0; amount = item.amount || 0; break
        case 'internal_course':
          c1 = '内部课程'; c2 = item.course_type || ''; quantity = 1; amount = item.price || 0; break
        case 'other':
          c1 = '其他项目'; c2 = item.project_name || item.category || ''; quantity = item.remaining_count != null ? item.remaining_count : '不限'; amount = item.fee || 0; break
      }
      const closer = (item.closers || []).map(c => c && c.name).filter(Boolean).join('、') || item.closer_name || ''
      records.push({
        c1,
        c2,
        c3: quantity == null ? '' : (quantity === '不限' ? '不限' : quantity + '次'),
        c4: amount > 0 ? '¥' + formatMoney(amount) : '',
        c5: closer,
        c6: item.notes || '',
      })
    }
    for (const i of payment.cards || []) add(i, 'membership_card')
    for (const i of payment.groups || []) add(i, 'group_case')
    for (const i of payment.emotions || []) add(i, 'emotional_release')
    for (const i of payment.ohs || []) add(i, 'oh_card_reading')
    for (const i of payment.energies || []) add(i, 'energy_knot')
    for (const i of payment.courses || []) add(i, 'internal_course')
    for (const i of payment.others || []) add(i, 'other')
    return records
  },

  onDetailClose() {
    this.setData({ detailOpen: false })
  },

  onDetailRowToggle(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`detailRows[${idx}].expanded`]: !this.data.detailRows[idx].expanded })
  },
})
