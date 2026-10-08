const { principalApi, customerApi } = require('../../utils/api')
const { BASE_URL } = require('../../utils/config')
// 引流客户列表的列（与 PC 的列表设置一致）：档案类字段只有该角色有权限时才出现
const TRAFFIC_COLUMNS = [
  { key: 'name', label: '昵称（引流日期）' }, { key: 'referrer', label: '引流人' },
  { key: 'referrer_handler', label: '承接人' }, { key: 'identity', label: '会员身份' },
  { key: 'follow_up_status', label: '跟进阶段' }, { key: 'traffic_source', label: '流量来源' },
  { key: 'tags', label: '客户标签' }, { key: 'deals', label: '交易笔数' },
  { key: 'invite_count', label: '邀约次数' }, { key: 'cancel_count', label: '取消次数' },
  { key: 'arrive_count', label: '到店次数' }, { key: 'visit_interval', label: '平均到店间隔' },
  { key: 'activity_count', label: '参与活动' },
]
const INVITE_ARRIVAL_COLUMNS = [
  { key: 'arrive_date', label: '到店日期' }, { key: 'name', label: '昵称' },
  { key: 'identity', label: '会员身份' },
  { key: 'referrer', label: '引流人', defaultVisible: false },
  { key: 'referrer_handler', label: '承接人', defaultVisible: false },
  { key: 'follow_up_status', label: '跟进阶段', defaultVisible: false },
  { key: 'traffic_source', label: '流量来源', defaultVisible: false },
  { key: 'tags', label: '客户标签', defaultVisible: false },
  { key: 'deals', label: '交易笔数', defaultVisible: false },
  { key: 'invite_count', label: '邀约次数', defaultVisible: false },
  { key: 'cancel_count', label: '取消', defaultVisible: false },
  { key: 'no_show_count', label: '未到场', defaultVisible: false },
  { key: 'arrive_count', label: '已到场' },
  { key: 'activity_count', label: '参与活动数', defaultVisible: false },
  { key: 'visit_interval', label: '平均到店间隔', defaultVisible: false },
  { key: 'same_day_deals', label: '当日成交' },
  { key: 'arrive_inviter', label: '邀约人' },
]
const INVITE_INITIATED_COLUMNS = [
  { key: 'name', label: '邀约人' }, { key: 'initiated_count', label: '邀约人次' },
  { key: 'cancel_count', label: '取消人次' }, { key: 'no_show_count', label: '未到场人次' },
  { key: 'arrive_count', label: '已到场人次' },
]
// 客户档案里的几项：按角色权限自动出现（后端只下发有权限的），默认不勾选
const PROFILE_COLUMN_LABELS = {
  visit_purpose: '到访目的', trauma_history: '创伤经历', current_block: '当下卡点',
  work_info: '工作情况', other_info: '其他信息',
}
const HIDDEN_BY_DEFAULT = Object.keys(PROFILE_COLUMN_LABELS)
// 列表第二行的数字要带上短标签，否则只剩一串看不懂的数字
const SHORT_LABELS = {
  hours: '课时', parts: '部位', participants: '参与人数', deal_count: '成交', same_day_deals: '当日成交',
  order_count: '关联成交', invite_count: '邀约', initiated_count: '邀约', cancel_count: '取消', no_show_count: '未到场', arrive_count: '到店',
  activity_count: '活动参与', org_participation_count: '累计课程', org_participation_hours: '累计课时',
  visit_interval: '间隔', target_count: '匹配',
}
// 这些列即使带单位（5天 / 3 人次）也归到"数字"那一行，避免被当成分类标签丢掉
const NUMBER_KEYS = new Set(['hours', 'parts', 'participants', 'deal_count', 'same_day_deals', 'order_count',
  'invite_count', 'initiated_count', 'cancel_count', 'no_show_count', 'arrive_count', 'activity_count', 'org_participation_count',
  'org_participation_hours', 'visit_interval', 'target_count'])
const SORT_DATE_KEYS = new Set(['date', 'arrive_date', 'visit_date', 'referral_date', 'deal_date'])
function sortDirectionLabels(field) {
  if (SORT_DATE_KEYS.has(field)) return { desc: '日期晚的在前', asc: '日期早的在前' }
  if (NUMBER_KEYS.has(field) || field === 'deals') return { desc: '数值大的在前', asc: '数值小的在前' }
  return { desc: '文字倒序', asc: '文字正序' }
}
const INITIAL_RULE = {
  description: '', scope: 'private',
  name: '粗门初次到场 → 会员卡首购',
  source: { kind: 'coarse_usage', product: '', subtype: '', occurrence: 'first' },
  targets: [{ kind: 'purchase', product: 'membership', subtype: '', occurrence: 'first' }],
  target_mode: 'any', window_days: 30, same_organization: true,
}
const clone = value => JSON.parse(JSON.stringify(value))
// 默认统计时间：本月（与 PC 端一致）
function monthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')
  return { date_from: `${year}-${month}-01`, date_to: `${year}-${month}-${lastDay}` }
}
function shanghaiDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}
// 共享规则要标出来，避免和自己的规则重名时选错
const ruleLabel = item => `${item.rule.name}${item.rule.scope === 'shared' ? '（共享）' : ''}`
const KINDS = ['coarse_usage', 'attendance', 'purchase']
const OCCURRENCES = ['first', 'repeat', 'any']
const COLUMN_STORAGE_KEY = 'principal:columns'
const INVITE_ARRIVAL_COLUMN_STORAGE_KEY = 'principal:invite-arrive-columns'
const INVITE_INITIATED_COLUMN_STORAGE_KEY = 'principal:invite-initiated-columns'
const MAX_LIST_COLUMNS = 15
const OVERVIEW_TAB = { key: 'overview', label: '经营概况' }
const CONVERSION_TAB = { key: 'conversion', label: '转化分析' }
// 与自定义筛选同一套：这两个规则不用填筛选值
const VALUELESS_OPERATORS = { is_empty: true, is_not_empty: true }
const CONDITION_MAX = 8

/**
 * 页签先用登录时缓存的权限判断（和 PC 一样）。
 * 转化分析要靠交易明细权限，等接口回来才准；只按接口判断的话，
 * 进页面这一下什么都不会显示，接口慢或失败时这一栏就直接不见了。
 */
function initialTabs() {
  try {
    const edit = wx.getStorageSync('userEditPermissions') || {}
    const access = (edit.customer_access || {}).transaction_access
    return access === 'detail' ? [OVERVIEW_TAB, CONVERSION_TAB] : [OVERVIEW_TAB]
  } catch (e) {
    return [OVERVIEW_TAB]
  }
}

/** 换字段 / 换规则时把筛选值重置成这个规则该有的形状（和自定义筛选一致） */
function conditionValueFor(definition, operator) {
  if (VALUELESS_OPERATORS[operator]) return null
  if (operator === 'between') return ['', '']
  if (operator === 'in') return []
  return ''
}

/** 新加一条条件：字段取第一个，规则取该字段支持的第一个 */
function makeCondition(fields) {
  const first = fields && fields[0]
  if (!first) return null
  const operator = (first.operators && first.operators[0]) || 'eq'
  return { field: first.value, operator, value: conditionValueFor(first, operator) }
}

// 列表设置存在本地：哪些列显示、列的先后顺序
function loadColumnConfig(key = COLUMN_STORAGE_KEY) {
  try { return wx.getStorageSync(key) || {} } catch (e) { return {} }
}
function saveColumnConfig(config, key = COLUMN_STORAGE_KEY) {
  try { wx.setStorageSync(key, config) } catch (e) { /* 存不上也不影响使用 */ }
}

function describeRule(rule, metadata) {
  const describe = action => {
    const prefix = action.occurrence === 'first' ? '首次' : action.occurrence === 'repeat' ? '再次' : ''
    if (action.kind === 'coarse_usage') return prefix + '参加粗门活动'
    const options = metadata ? (action.kind === 'purchase' ? metadata.products : metadata.activity_types) : []
    const product = (options || []).find(item => item.key === action.product)
    const name = action.subtype || (product && product.label) || (action.kind === 'purchase' ? '任意产品' : '课程')
    return prefix + (action.kind === 'purchase' ? '购买' : '参加') + name
  }
  // 带了几条附加条件也要说出来（和 PC 的说法一致）
  const withConditions = action => {
    const count = (action.conditions || []).length
    return count ? '（含 ' + count + ' 个筛选条件）' : ''
  }
  const targets = rule.targets.map(action => '「' + describe(action) + '」' + withConditions(action)).join(rule.target_mode === 'all' ? '且' : '或')
  return '从「' + describe(rule.source) + '」' + withConditions(rule.source) + '到' + targets + '，' + (Number(rule.window_days) === 0 ? '限当天' : '间隔不超过 ' + rule.window_days + ' 天') + '。'
}

Page({
  data: {
    ruleSentence: '',
    canManageRule: false,
    metadata: null, organizations: [{ id: '', name: '全部可见组织/俱乐部' }], orgIndex: 0,
    // 组织/俱乐部没有「课程记录/交易记录」这两个页面；转化分析按缓存的权限先挂上，接口回来再校正
    tabs: initialTabs(),
    query: Object.assign({ organization_id: '', tab: 'overview', product: '', order_filter: '', status: '', rule: clone(INITIAL_RULE) }, monthRange()),
    rules: [], ruleOptions: ['默认规则'], ruleIndex: 0, ruleId: '',
    inviteView: 'arrive', arrivalView: 'customer', inviteToolMenuOpen: false, renderCourseView: 'course',
    arrivalViewOptions: ['单个客户仅显示一次', '按日期显示每条邀约记录'],
    // 快捷周期：与 PC 一致，默认本月
  rangePresets: [{ key: 'today', label: '当天' }, { key: 'week', label: '本周' }, { key: 'month', label: '本月' }, { key: 'year', label: '本年' }, { key: 'all', label: '全部' }],
  rangePreset: 'month',
  rangePresetIndex: 2,
  // 列表视图：成交量那里可以按「每笔交易 / 同一人」看（与 PC 一致）
  listViewOptions: ['每笔交易显示一次', '同一人仅显示一次'],
  listViewIndex: 0,
  // 长文本（新人/老人名单、复盘内容）先缩略，可以整列展开
  expandCells: false,
  // 卡片上的说明：点 ? 展开
  helpKey: '',
    list: [], summary: [], notice: '', page: 1, total: 0, hasMore: false, loading: false, error: '', busy: false,
    // 默认展开「引流人数」（和 PC 一致）
    overviewGroup: 'traffic', picks: [], cards: [], panelTitle: '', panelGroups: [], panelMetrics: [], panelHint: [],
    panelSelects: [], trafficCustomersCount: 0, trafficDealTotal: 0, trafficDealsActive: false,
    trafficProductTotals: [],
    panelSheet: null, teacherDays: [], teacherDetail: null,
    trafficQuickFilter: '',
    // 列表设置 / 排序 / 成交笔数弹窗
    columns: [], columnFields: [], columnSheetOpen: false, sortSheetOpen: false,
    pickChips: [],
    sortField: '', sortOrder: 'desc', sortFields: [], sortDraftField: '', sortDraftOrder: 'desc',
    sortDirectionLabels: sortDirectionLabels(''),
    dealSheet: null, dealLoading: false,
    recordSheet: null, recordLoading: false,
    columnSheetItems: [], columnVisibleCount: 0,
    actionEditors: [], detail: null,
    // 转化分析：规则就地编辑（不再单独弹窗），条件字段与自定义筛选同源
    ruleFields: null, condSheet: null,
    showSaveRule: false, ruleNameDraft: '', ruleDescriptionDraft: '', ruleScopeDraft: 'private', savingRule: false,
    statusFilters: [
      { value: '', label: '全部状态' }, { value: 'converted', label: '已转化' },
      { value: 'unconverted', label: '未转化' }, { value: 'observing', label: '观察中' },
    ],
    kindLabels: ['参加粗门活动', '参加课程', '购买'],
    modeLabels: ['任意一项', '全部完成'],
  },
  onLoad() {
    if (!getApp().checkLogin()) return
    this.initialize()
  },
  onShow() {
    if (!getApp().checkLogin()) return
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/principal/index')
  },
  async initialize() {
    try {
      // 首屏统计和轻量组织目录同时加载；规则和具体卡种在进入转化分析时再取。
      const conversion = this.data.query.tab === 'conversion'
      const dataPromise = this.loadData(true)
      const [metadata, rules] = await Promise.all([
        principalApi.metadata(!conversion), conversion ? principalApi.rules() : Promise.resolve(this.data.rules),
      ])
      if (this.data.query.tab !== (conversion ? 'conversion' : 'overview')) {
        this.setData({ organizations: [{ id: '', name: '全部可见组织/俱乐部' }, ...metadata.organizations] })
        await dataPromise
        return
      }
      this.setData({ ruleSentence: describeRule(this.data.query.rule, metadata) })
      const selectedIndex = rules.findIndex(r => r.id === this.data.ruleId)
      this.setData({ ruleIndex: selectedIndex + 1, ruleId: selectedIndex >= 0 ? rules[selectedIndex].id : '', canManageRule: selectedIndex >= 0 && rules[selectedIndex].can_manage === true })
      // 与 PC 一致：只保留「经营概况」和「转化分析」（课程记录/交易记录已下线，明细都在经营概况的卡片里）；
      // 接口没带回权限时沿用缓存判断，不能把已经显示的这一栏又拿掉
      const tabs = [OVERVIEW_TAB]
      const transactionAccess = metadata.transaction_access || ((wx.getStorageSync('userEditPermissions') || {}).customer_access || {}).transaction_access
      if (transactionAccess === 'detail') tabs.push(CONVERSION_TAB)
      this.setData({ metadata, tabs, rules, ruleOptions: ['默认规则', ...rules.map(ruleLabel)], organizations: [{ id: '', name: '全部可见组织/俱乐部' }, ...metadata.organizations] })
      await dataPromise
      if (conversion) this.ensureRuleFields()
    } catch (e) {
      // 数据源错配是最常见的失败原因，直接把当前数据源写在提示里，省得来回猜
      const source = BASE_URL.indexOf('wyteahouse') >= 0 ? '正式服务器' : '本地'
      this.setData({ error: `${e.message || '加载失败'}（当前数据源：${source}）` })
    }
  },
  /** 条件字段只在需要时拉一次：字段 / 规则 / 候选项都与自定义筛选同源 */
  async ensureRuleFields() {
    if (this.data.ruleFields) return
    try {
      const ruleFields = await principalApi.ruleFields()
      this.setData({ ruleFields })
      this.refreshEditors()
    } catch (e) { /* 拉不到就当没有附加条件可用，不影响规则本身 */ }
  },
  async loadData(reset, options = {}) {
    const preserveContent = !!options.preserveContent
    const preserveCards = !!options.preserveCards
    const sequence = this._sequence = (this._sequence || 0) + 1
    const page = reset ? 1 : this.data.page + 1
    if (reset) {
      if (!preserveContent) this._sourceRows = []
      this._overviewPanel = null
    }
    this.setData({
      loading: true,
      error: '',
      ...(reset && !preserveContent ? { list: [], summary: [], detail: null } : {}),
    })
    try {
      // 二级勾选交给后端筛，翻页口径才一致（和 PC 一样）；排序同样走后端，整批生效
      // 经营概况里点开「成交量」时列表要按交易记录取（与 PC 的 listTab 一致）
      const listTab = this.data.query.tab === 'overview' && this.data.overviewGroup === 'deals' ? 'orders' : this.data.query.tab
      const baseQuery = {
        ...this.data.query, breakdown: this.data.picks, sort_by: this.data.sortField, sort_order: this.data.sortOrder,
        list_view: this.data.listViewIndex === 1 ? 'customer' : 'order',
      }
      // 转化分析：只有主动点「查询」这一次才写进「分析日志」（切 tab、翻页不记），和 PC 一致
      if (this._logAnalysis && listTab === 'conversion') baseQuery.log_analysis = true
      this._logAnalysis = false
      const mobileGroup = this.data.query.tab === 'overview'
        ? ({ traffic: 'traffic', invite: this.data.inviteView === 'initiated' ? 'invite_initiated' : 'invite_arrive',
          courses: 'courses', deals: 'deals' })[this.data.overviewGroup] || 'courses' : ''
      const result = await principalApi.query({ ...baseQuery, tab: listTab, page, page_size: 20,
        include_overview: listTab !== this.data.query.tab,
        mobile_group: mobileGroup, mobile_quick_filter: this.data.trafficQuickFilter,
        arrival_view: this.data.arrivalView })
      if (sequence !== this._sequence) return
      const panelResult = result
      // 引流客户和邀约到店使用列表设置；课程/交易列表固定按后端返回的列展示。
      const columns = result.columns || []
      // 客户原始记录只留在逻辑层；breakdown 中的嵌套明细不能随 setData 重复传给视图层。
      const { trafficRows, ...panel } = this.buildPanel(panelResult)
      const usingTraffic = this.data.query.tab === 'overview' && this.data.overviewGroup === 'traffic'
      const usingInvite = this.data.query.tab === 'overview' && this.data.overviewGroup === 'invite'
      // 引流人数这组：列表换成「引流客户」，客户档案列按权限出现（默认不勾选）
      const allowedProfile = (panelResult.breakdown && panelResult.breakdown.traffic_profile_fields) || null
      const profileColumns = Object.keys(PROFILE_COLUMN_LABELS)
        .filter(key => Array.isArray(allowedProfile) && allowedProfile.indexOf(key) >= 0)
        .map(key => ({ key, label: PROFILE_COLUMN_LABELS[key] }))
      const trafficColumns = TRAFFIC_COLUMNS.concat(profileColumns)
      const sourceRows = result.items || []
      const columnFields = usingTraffic ? trafficColumns : usingInvite
        ? (this.data.inviteView === 'initiated' ? INVITE_INITIATED_COLUMNS : INVITE_ARRIVAL_COLUMNS.concat(profileColumns)) : columns
      const sourceColumns = usingTraffic || usingInvite ? this.visibleColumns(columnFields) : columns
      const teacherView = this.data.overviewGroup === 'courses' && this.data.query.course_view === 'teacher_follow_up'
      const items = teacherView
        ? sourceRows.map(row => ({ id: row.id, customer_id: row.customer_id }))
        : sourceRows.map(row => this.displayListRow(row, sourceColumns, usingTraffic, usingInvite))
      const list = reset ? items : this.data.list.concat(items)
      const teacherDays = teacherView
        ? this.buildTeacherDays(reset ? sourceRows : (this._sourceRows || []).concat(sourceRows), result.teacher_group_totals || []) : []
      this._sourceRows = reset ? sourceRows : (this._sourceRows || []).concat(sourceRows)
      // 翻页只传新增行，避免越滚越长时把已显示的列表反复传给视图层。
      const listPatch = reset ? { list } : Object.fromEntries(items.map((item, index) => [
        `list[${list.length - items.length + index}]`, item,
      ]))
      const viewPatch = {
        ...listPatch, teacherDays,
        columns: sourceColumns, columnFields,
        sortFields: columnFields.map(c => ({ key: c.key, label: c.label })),
        summary: Object.entries(result.summary).map(([label, value]) => ({ label, value })),
        notice: result.notice, page: result.page, total: result.total, hasMore: list.length < result.total,
        ...panel,
        total: result.total,
        hasMore: list.length < result.total,
      }
      if (this.data.query.tab === 'overview' && this.data.overviewGroup === 'courses') {
        viewPatch.renderCourseView = this.data.query.course_view
      }
      if (!preserveCards) {
        viewPatch.cards = panelResult.summary && panelResult.summary['引流人数'] !== undefined ? this.buildCards(panelResult) : []
      }
      this.setData(viewPatch)
      if (usingInvite) {
        this._loadedInviteView = this.data.inviteView
        this._loadedArrivalView = this.data.arrivalView
      }
      if (this.data.query.tab === 'overview' && this.data.overviewGroup === 'courses') {
        this._loadedCourseQuery = { ...this.data.query }
      }
      // 转化分析：规则编辑器跟着当前规则重建（也在这一步把条件字段渲染出来）
      if (this.data.query.tab === 'conversion') this.refreshEditors()
    } catch (e) {
      if (sequence === this._sequence) {
        const rollback = {}
        if (options.rollbackInviteView) rollback.inviteView = options.rollbackInviteView
        if (options.rollbackArrivalView) rollback.arrivalView = options.rollbackArrivalView
        if (options.rollbackCourseQuery) rollback.query = options.rollbackCourseQuery
        this.setData(reset && !preserveContent
          ? { error: e.message || '加载失败', list: [], summary: [], ...rollback }
          : { error: e.message || '加载失败', ...rollback })
      }
    }
    finally { if (sequence === this._sequence) this.setData({ loading: false }) }
  },
  displayListRow(row, columns, usingTraffic, usingInvite) {
    // WXML 只读取这些展示字段；详情、导出和重新排列列使用 _sourceRows 中的原始记录。
    return {
      id: row.id,
      customer_id: row.customer_id,
      course_id: row.course_id,
      ...this.buildListRow(row, columns, usingTraffic, usingInvite),
    }
  },
  /** 列表设置：按本地保存的显示/顺序整理列；没存过的列默认显示并排在后面 */
  /**
   * 列表每行压成两行（和预览一致）：主标题 = 客户/课程名，下面一行灰字 = 其余字段，右侧放日期。
   * 点整行进明细弹窗，点主标题进客户资料。
   */
  buildListRow(row, columns, usingTraffic, usingInvite) {
    // 每一组只展示固定的几个关键字段，其余（名单、档案、长文本）都放明细弹窗，避免一行堆满看不懂
    const group = usingInvite ? 'invite' : usingTraffic ? 'traffic'
      : this.data.overviewGroup === 'courses' ? (this.data.query.course_view === 'participant' ? 'participant' : this.data.query.course_view === 'teacher_follow_up' ? 'teacher_follow_up' : 'courses')
        : 'orders'
    const TITLE_KEY = { orders: 'customer', courses: 'name', participant: 'customer', teacher_follow_up: 'customer', traffic: 'name', invite: 'name' }[group]
    // 第二行按这个优先级取，最多 4 项
    const PRIORITY = {
      orders: ['label', 'classification', 'closers', 'organization'],
      courses: ['type', 'teachers', 'participants', 'hours', 'owner'],
      participant: ['name', 'type', 'teachers', 'hours', 'participant_category'],
      teacher_follow_up: ['teachers', 'name', 'follow_up_status', 'customer_info', 'follow_up', 'visit_need'],
      traffic: ['referrer', 'referrer_handler', 'identity', 'follow_up_status', 'traffic_source', 'tags'],
      invite: ['identity', 'arrive_inviter', 'initiated_count', 'cancel_count', 'no_show_count', 'arrive_count', 'same_day_deals'],
    }[group]
    const titleColumn = columns.find(c => c.key === TITLE_KEY) || columns[0]
    const dateColumn = columns.find(c => c.key === (usingInvite ? 'arrive_date' : 'date'))
    const text = (value) => (value === 0 ? '0' : (value || '')).toString().trim()
    // 引流客户列表没有「课程/成交日期」列，底部那行显示的是引流日期
    const dateValue = dateColumn ? text(row[dateColumn.key]) : (usingTraffic ? text(row.referral_date) : '')
    const dateText = dateValue ? (usingTraffic ? `引流日期 ${dateValue}` : usingInvite ? `到店日期 ${dateValue}` : dateValue) : ''
    const ordered = PRIORITY
      .map(key => columns.find(c => c.key === key))
      .filter(Boolean)
    const rest = columns.filter(c => c !== titleColumn && c !== dateColumn && ordered.indexOf(c) < 0)
    // 新人/老人名单也是长文本：不放进标签，跟客户档案一样单独一行完整显示（不再提示「见明细」）
    const LONG_FIELDS = ['new_names', 'old_names', 'coarse_names', 'absent_names', 'visit_need', 'customer_info', 'follow_up']
    // 分三类展示：分类值（身份/阶段/来源/标签/类型/老师…）做成小标签，
    // 数字单独一行带短前缀（到店 3 次 / 课时 1），没值的不显示，长文本进明细弹窗
    // 会员身份挪到昵称右边单独显示，其余分类值都带上自己的标题前缀，避免看不出是什么
    const IDENTITY_KEY = 'identity'
    const parsed = ordered.concat(rest)
      .map(c => {
        const raw = c.key === 'name' && titleColumn.key === 'customer' ? text(row.name) : text(row[c.key])
        const empty = !raw || raw === '—' || raw === '未配置'
        const label = SHORT_LABELS[c.key] || c.label
        if (empty) return null
        // 客户档案类字段单独成块、不加底色，排在数字行下面、日期上面，层级更清楚
        if (PROFILE_COLUMN_LABELS[c.key] || LONG_FIELDS.indexOf(c.key) >= 0) {
          const peopleKey = { new_names: 'new_people', old_names: 'old_people', coarse_names: 'coarse_people', absent_names: 'absent_people' }[c.key]
          return { kind: 'profile', label: c.label, value: raw, people: peopleKey ? row[peopleKey] || [] : [] }
        }
        const numeric = NUMBER_KEYS.has(c.key) || /^-?\d+(\.\d+)?$/.test(raw)
        if (numeric) return {
          kind: 'number', label,
          value: group === 'courses' && c.key === 'same_day_deals' ? `${raw} 笔` : raw,
          empty: group === 'courses' && c.key === 'same_day_deals' && Number(raw) === 0,
        }
        if (c.key === IDENTITY_KEY) return { kind: 'identity', label: '', value: raw }
        return { kind: 'category', label, value: raw }
      })
      .filter(Boolean)
    return {
      rowTitle: text(titleColumn ? row[titleColumn.key] : '') || '未命名',
      rowIdentity: (parsed.find(item => item.kind === 'identity') || {}).value || '',
      // 勾选了几列就显示几列（之前只取前 6 个，后面的勾了也不显示）
      rowTags: parsed.filter(item => item.kind === 'category'),
      rowNumbers: parsed.filter(item => item.kind === 'number'),
      rowProfiles: parsed.filter(item => item.kind === 'profile'),
      rowRight: dateText,
      rowLinkId: usingTraffic ? row.id : (row.customer_id || ''),
    }
  },
  columnConfigKey() {
    if (this.data.query.tab === 'overview' && this.data.overviewGroup === 'invite') {
      return this.data.inviteView === 'initiated' ? INVITE_INITIATED_COLUMN_STORAGE_KEY : INVITE_ARRIVAL_COLUMN_STORAGE_KEY
    }
    return COLUMN_STORAGE_KEY
  },
  orderedColumns(columns) {
    const config = loadColumnConfig(this.columnConfigKey())
    const ordered = []
    ;(config.order || []).forEach(key => {
      const found = columns.find(item => item.key === key)
      if (found) ordered.push(found)
    })
    columns.forEach(item => { if (ordered.indexOf(item) < 0) ordered.push(item) })
    return ordered
  },
  visibleColumns(columns) {
    const configKey = this.columnConfigKey()
    const config = loadColumnConfig(configKey)
    const visible = this.orderedColumns(columns).filter(item => {
      const saved = (config.hidden || {})[item.key]
      // 没配置过的列：档案类默认不显示，其余默认显示
      return saved === undefined ? item.defaultVisible !== false && HIDDEN_BY_DEFAULT.indexOf(item.key) < 0 : !saved
    })
    const isLimitedList = this.data.query.tab === 'overview' && ['invite', 'traffic'].includes(this.data.overviewGroup)
    if (!isLimitedList || visible.length <= MAX_LIST_COLUMNS) return visible
    const hidden = { ...(config.hidden || {}) }
    visible.slice(MAX_LIST_COLUMNS).forEach(item => { hidden[item.key] = true })
    saveColumnConfig({ ...config, hidden }, configKey)
    return visible.slice(0, MAX_LIST_COLUMNS)
  },
  openColumnSheet() {
    const items = this.columnSheetItems()
    this.setData({ columnSheetOpen: true, columnSheetItems: items, columnVisibleCount: items.filter(item => item.visible).length })
  },
  closeColumnSheet() { this.setData({ columnSheetOpen: false }) },
  openSortSheet() { this.setData({ sortSheetOpen: true, sortDraftField: this.data.sortField, sortDraftOrder: this.data.sortOrder,
    sortDirectionLabels: sortDirectionLabels(this.data.sortField) }) },
  closeSortSheet() { this.setData({ sortSheetOpen: false }) },
  toggleInviteToolMenu() { this.setData({ inviteToolMenuOpen: !this.data.inviteToolMenuOpen }) },
  closeInviteToolMenu() { if (this.data.inviteToolMenuOpen) this.setData({ inviteToolMenuOpen: false }) },
  onInviteExport() { this.closeInviteToolMenu(); this.exportData() },
  onInviteToolAction(e) {
    const action = e.currentTarget.dataset.action
    this.closeInviteToolMenu()
    if (action === 'columns') this.openColumnSheet()
    else if (action === 'expand') this.toggleExpandCells()
    else if (action === 'sort') this.openSortSheet()
  },
  columnSheetItems() {
    const config = loadColumnConfig(this.columnConfigKey())
    return this.orderedColumns(this.data.columnFields || []).map(item => {
      const saved = (config.hidden || {})[item.key]
      return { ...item, visible: saved === undefined ? item.defaultVisible !== false && HIDDEN_BY_DEFAULT.indexOf(item.key) < 0 : !saved }
    })
  },
  onToggleColumn(e) {
    const fieldKey = e.currentTarget.dataset.key
    const item = (this.data.columnSheetItems || []).find(column => column.key === fieldKey)
    if (!item) return
    const isLimitedList = this.data.query.tab === 'overview' && ['invite', 'traffic'].includes(this.data.overviewGroup)
    if (isLimitedList && !item.visible && Number(this.data.columnVisibleCount || 0) >= MAX_LIST_COLUMNS) {
      wx.showToast({ title: '最多选择15列', icon: 'none' })
      return
    }
    const configKey = this.columnConfigKey()
    const config = loadColumnConfig(configKey)
    const hidden = { ...(config.hidden || {}) }
    hidden[fieldKey] = item.visible
    const next = { ...config, hidden }
    saveColumnConfig(next, configKey)
    const items = this.columnSheetItems()
    this.setData({ columnSheetItems: items, columnVisibleCount: items.filter(column => column.visible).length })
    this.refreshColumnOrder()
  },
  onMoveColumn(e) {
    const key = e.currentTarget.dataset.key, offset = Number(e.currentTarget.dataset.offset)
    const keyName = this.columnConfigKey()
    const config = loadColumnConfig(keyName)
    const order = this.orderedColumns(this.data.columnFields || []).map(item => item.key)
    const index = order.indexOf(key)
    const target = index + offset
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    saveColumnConfig({ ...config, order }, keyName)
    this.setData({ columnSheetItems: this.columnSheetItems() })
    this.refreshColumnOrder()
  },
  resetColumns() {
    saveColumnConfig({}, this.columnConfigKey())
    const items = this.columnSheetItems()
    this.setData({ columnSheetItems: items, columnVisibleCount: items.filter(item => item.visible).length })
    this.refreshColumnOrder()
  },
  /** 重新排出当前列表的列，不改数据 */
  refreshColumnOrder() {
    const columns = this.visibleColumns(this.data.columnFields || [])
    const usingTraffic = this.data.query.tab === 'overview' && this.data.overviewGroup === 'traffic'
    const usingInvite = this.data.query.tab === 'overview' && this.data.overviewGroup === 'invite'
    const list = (this._sourceRows || []).map(row => this.displayListRow(row, columns, usingTraffic, usingInvite))
    this.setData({ columns, list, sortFields: (this.data.columnFields || []).map(item => ({ key: item.key, label: item.label })) })
  },
  onSortField(e) {
    const key = e.currentTarget.dataset.key
    if (key && !(this.data.sortFields || []).some(field => field.key === key)) return
    this.setData({ sortDraftField: key, sortDirectionLabels: sortDirectionLabels(key) })
  },
  onSortOrder(e) {
    if (!this.data.sortDraftField) return
    this.setData({ sortDraftOrder: e.currentTarget.dataset.order })
  },
  applySort() {
    const { sortDraftField, sortDraftOrder, sortField, sortOrder } = this.data
    if (sortDraftField === sortField && (!sortDraftField || sortDraftOrder === sortOrder)) {
      this.closeSortSheet()
      return
    }
    this.setData({ sortField: sortDraftField, sortOrder: sortDraftOrder, sortSheetOpen: false })
    this.loadData(true, { preserveContent: true, preserveCards: true })
  },
  /** 成交笔数：只看这个客户在这批数据里的全部成交 */
  async openCustomerDeals(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '成交明细'
    if (!id) return
    this.setData({ dealSheet: { name, rows: [] }, dealLoading: true })
    try {
      const result = await principalApi.query({ ...this.data.query, breakdown: this.data.picks, customer_id: id, page: 1, page_size: 100 })
      this.setData({ dealSheet: { name, rows: (result.items || []).map(row => ({ id: row.id, date: row.date, label: row.label || row.type, organization: row.organization, classification: row.classification, closers: row.closers })), total: result.total }, dealLoading: false })
    } catch (error) {
      this.setData({ dealSheet: null, dealLoading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },
  closeDealSheet() { this.setData({ dealSheet: null }) },
  /** 邀约 / 取消 / 到店 / 参与活动：拉客户详情后按类型列记录（与 PC 的引流记录弹窗一致） */
  async openTrafficRecords(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    const type = e.currentTarget.dataset.type
    if (!id || !type) return
    this.setData({ recordSheet: { name, type, rows: [] }, recordLoading: true })
    try {
      const detail = await customerApi.detail(id)
      const rows = type === 'activity'
        ? (detail.activities || []).map(item => ({ main: `${item.date} · ${item.name || item.type || ''}`, sub: `${item.type || ''} · ${item.host || '-'} · ${item.role || '-'}` }))
        : (detail.visit_records || [])
          .filter(record => type === 'cancelled' ? record.cancelled : type === 'arrived' ? record.arrived : true)
          .map(record => ({ main: `${record.visit_date} · ${record.referrer_handler || '-'}`, sub: `${record.needs || '-'}${record.cancelled ? ' · 已取消' : record.arrived ? ' · 已到店' : ''}` }))
      this.setData({ recordSheet: { name, type, rows }, recordLoading: false })
    } catch (error) {
      this.setData({ recordSheet: null, recordLoading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },
  closeRecordSheet() { this._detailSequence = (this._detailSequence || 0) + 1; this.setData({ recordSheet: null }) },
  /** 「已筛选：xxx ✕」——点 ✕ 取消这一项 */
  clearPick(e) { this.togglePick({ currentTarget: { dataset: { value: e.currentTarget.dataset.value } } }) },
  clearFilters() { this.setData({ picks: [] }); this.updateQuery({ participant_scope: '' }) },
  /** 经营概况四张卡与 PC 保持同一统计口径。 */
  buildCards(result) {
    const summary = result.summary || {}, breakdown = result.breakdown || {}
    const referral = breakdown.traffic || []
    const mobile = result.mobile
    const customers = mobile ? [] : this.filteredTrafficCustomers(breakdown, this.data.picks)
    const invited = mobile ? mobile.invite_total : customers.reduce((sum, item) => sum + Number(item.cancel_count || 0) + Number(item.no_show_count || 0) + Number(item.arrive_count || 0), 0)
    const cancelled = mobile ? mobile.invite.cancel_count.times : customers.reduce((sum, item) => sum + Number(item.cancel_count || 0), 0)
    const noShow = mobile ? mobile.invite.no_show_count.times : customers.reduce((sum, item) => sum + Number(item.no_show_count || 0), 0)
    const arrived = mobile ? mobile.invite.arrive_count.times : customers.reduce((sum, item) => sum + Number(item.arrive_count || 0), 0)
    const deals = breakdown.deals || []
    return [
      { key: 'traffic', title: '引流人数', value: summary['引流人数'] ?? 0, unit: '人',
        help: '按引流日期统计；该组织/俱乐部所属人员的引流总人数',
        sub: `${referral.filter(item => item.key !== '未配置').length} 位引流人 · 成交 ${referral.reduce((sum, item) => sum + (item.deal_count || 0), 0)} 笔` },
      { key: 'invite', title: '邀约到店', value: invited, unit: '次',
        help: '统计周期内邀约页面里的客户总数',
        sub: `取消 ${cancelled} · 未到场 ${noShow} · 已到场 ${arrived}` },
      { key: 'courses', title: '课程数据', value: summary['课程数'] ?? 0, unit: '场',
        help: '', sub: `总 ${summary['课时数'] ?? 0} 课时` },
      { key: 'deals', title: '成交量', value: summary['交易笔数'] ?? 0, unit: '笔',
        help: '', sub: `会员卡 ${deals.filter(item => item.key === 'membership').reduce((sum, item) => sum + Number(item.count || 0), 0)} 笔 · 其他 ${deals.filter(item => item.key !== 'membership').reduce((sum, item) => sum + Number(item.count || 0), 0)} 笔` },
    ]
  },
  /** 点开某张卡后的二级项 + 指标条 */
  buildPanel(result) {
    const group = this.data.overviewGroup
    if (!group) return { panelTitle: '', panelSelects: [], panelMetrics: [], panelHint: [], pickChips: [], trafficRows: [] }
    const breakdown = result.breakdown || {}, picks = this.data.picks, mobile = result.mobile
    const pickedOf = prefix => picks.filter(item => item.indexOf(prefix + ':') === 0).map(item => item.slice(prefix.length + 1))
    const select = (label, prefix, options, multi) => {
      const selected = pickedOf(prefix)
      return {
        label, prefix, multi: !!multi, selectedCount: selected.length,
        displayValue: multi ? (selected.length ? `已选 ${selected.length} 项` : '全部') : '',
        options: [{ value: '', label: '全部', text: '' }].concat(options),
        index: Math.max(0, options.findIndex(item => selected.indexOf(item.key || item.value) >= 0) + 1),
      }
    }
    const selects = []
    let title = ''
    if (group === 'deals') {
      title = '成交量明细'
      selects.push(select('付费项目', 'deals', (breakdown.deals || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 笔` }))))
      // 选了会员卡再列它的卡种（和 PC 的子级下拉一致）
      const pickedProduct = (breakdown.deals || []).find(item => pickedOf('deals').indexOf(item.key) >= 0)
      if (pickedProduct && (pickedProduct.subtypes || []).length) {
        selects.push(select('卡种', 'subtype', (pickedProduct.subtypes || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 笔` }))))
      }
      selects.push(select('购买类型', 'buy', (breakdown.buys || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 笔` }))))
    } else if (group === 'courses') {
      title = '课程数据明细'
      const types = (breakdown.courses && breakdown.courses.by_type) || []
      selects.push(select('课程类型', 'type', types.map(item => ({ key: item.key, label: item.label, text: `${item.count} 场 · ${item.hours || 0} 课时` }))))
      const pickedType = types.find(item => pickedOf('type').indexOf(item.key) >= 0)
      if (pickedType && (pickedType.subtypes || []).length) {
        selects.push(select('具体课程', 'course', (pickedType.subtypes || []).map(item => ({ key: item.key, label: item.label.replace(' · ', '·'), text: `${item.count} 场 · ${item.hours || 0} 课时` }))))
      }
      selects.push(select('课程老师', 'teacher', ((breakdown.courses && breakdown.courses.by_teacher) || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 场 · ${item.hours || 0} 课时` }))))
    } else if (group === 'invite') {
      title = '邀约到店明细'
      selects.push(select('邀约人', 'inviter', (breakdown.invite_inviters || []).map(item => ({ key: item.key, label: item.label, text: `发起邀约 ${item.initiated_count || 0} 次` }))))
      selects.push(select('引流人', 'traffic', (breakdown.traffic || []).map(item => ({ key: item.key, label: item.label, text: `邀约到店 ${item.invite_count || 0} 次` }))))
    } else {
      title = '引流人数明细'
      const filters = breakdown.traffic_filters || {}
      const unassignedFirst = items => items.slice().sort((a, b) => Number((b.key === '未配置')) - Number((a.key === '未配置')))
      const firstLevel = ((breakdown.traffic_upsell_levels || [])[0] || {}).key
      const rate = (count, total) => total ? `${Math.round(count * 1000 / total) / 10}%` : '0%'
      selects.push(select('引流人', 'traffic', unassignedFirst((breakdown.traffic || []).map(item => {
        const customers = item.customers || []
        const consumers = mobile ? item.consumer_count || 0 : customers.filter(customer => Number(customer.deals || 0) > 0).length
        const trial = mobile ? item.trial_count || 0 : firstLevel ? customers.filter(customer => (customer.upsell_levels || []).length === 1 && customer.upsell_levels[0].key === firstLevel).length : 0
        const upsell = mobile ? item.upsell_count || 0 : customers.filter(customer => Number(customer.deals || 0) > 0 && customer.is_upsell).length
        return { key: item.key, label: item.label, text: `引流 ${item.count} 人`, note: `（体验卡 ${rate(trial, mobile ? item.count : customers.length)} · 升单 ${rate(upsell, consumers)}）` }
      }))))
      selects.push(select('会员身份', 'identity', unassignedFirst((filters.identity || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 人` })))))
      selects.push(select('升单情况', 'upsell', (filters.upsell || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 人` })), true))
      selects.push(select('跟进阶段', 'stage', unassignedFirst((filters.stage || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 人` })))))
      selects.push(select('流量来源', 'source', unassignedFirst((filters.source || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 人` })))))
      selects.push(select('客户标签', 'tag', unassignedFirst((filters.tag || []).map(item => ({ key: item.key, label: item.label, text: `${item.count} 人` })))))
    }
    // 引流人数这组的列表是「引流客户」，直接用二级数据里的客户明细拼（和 PC 一样）
    const trafficCustomers = group === 'traffic' && !mobile ? this.filteredTrafficCustomers(breakdown, picks) : []
    const productCounts = new Map()
    trafficCustomers.forEach(customer => (customer.products || []).forEach(product => {
      const existing = productCounts.get(product.key)
      productCounts.set(product.key, { key: product.key, label: product.label, count: (existing ? existing.count : 0) + Number(product.count || 0) })
    }))
    const trafficProductTotals = (mobile ? mobile.traffic_products : Array.from(productCounts.values()))
      .sort((left, right) => right.count - left.count)
      .map(product => ({ ...product, active: this.data.trafficQuickFilter === `product:${product.key}` }))
    const trafficDealTotal = mobile ? mobile.traffic_deals : trafficCustomers.reduce((sum, customer) => sum + Number(customer.deals || 0), 0)
    const trafficRows = group === 'traffic' ? this.buildTrafficRows(breakdown, picks) : []
    return {
      panelTitle: title,
      panelSelects: selects,
      panelMetrics: this.buildMetrics(group, result, trafficRows, picks),
      // 内/外的解释放在统计数值框里（和 PC 端一字不差）
      panelHint: [],
      pickChips: picks.map(value => {
        const found = selects.reduce((hit, item) => hit || item.options.find(option => `${item.prefix}:${option.key}` === value), null)
        return { value, label: found ? found.label : value }
      }),
      trafficRows,
      trafficCustomersCount: mobile ? mobile.traffic_count : trafficCustomers.length,
      trafficDealTotal,
      trafficDealsActive: this.data.trafficQuickFilter === 'deals',
      trafficProductTotals,
    }
  },
  filteredTrafficCustomers(breakdown, picks) {
    const picked = prefix => picks.filter(item => item.startsWith(prefix + ':')).map(item => item.slice(prefix.length + 1))
    return (breakdown.traffic || []).reduce((all, item) => all.concat((item.customers || []).map(customer => ({ ...customer, referrer: item.label }))), [])
      .filter(customer => {
        if (picked('traffic').length && !picked('traffic').includes(customer.referrer)) return false
        if (picked('identity').length && !picked('identity').includes(customer.identity || '')) return false
        if (picked('stage').length && !picked('stage').includes(customer.follow_up_status || '')) return false
        if (picked('source').length && !picked('source').includes(customer.traffic_source || '')) return false
        if (picked('tag').length && !picked('tag').some(value => (customer.tags || []).includes(value))) return false
        if (picked('inviter').length && !picked('inviter').some(value => (customer.inviters || []).includes(value))) return false
        const upsell = picked('upsell')
        if (upsell.length) {
          const levels = customer.upsell_levels || []
          if (!levels.length || !upsell.includes(levels[levels.length - 1].key)) return false
        }
        return true
      })
  },
  /** 引流客户列表：引流人 + 身份/阶段/来源/标签一起筛，口径与 PC 一致 */
  buildTrafficRows(breakdown, picks) {
    const quick = this.data.trafficQuickFilter
    return this.filteredTrafficCustomers(breakdown, picks)
      .map(row => ({ ...row, tags: (row.tags || []).join('、') }))
      .filter(row => {
        if (['initiated', 'invite', 'cancel', 'no_show', 'arrive'].includes(quick) && row.referrer === '未配置') return false
        if (quick === 'deals') return Number(row.deals || 0) > 0
        if (quick.indexOf('product:') === 0) return (row.products || []).some(product => product.key === quick.slice('product:'.length))
        if (quick === 'initiated') return Number(row.initiated_count ?? (Number(row.invite_count || 0) + Number(row.cancel_count || 0))) > 0
        if (quick === 'invite') return Number(row.invite_count || 0) > 0
        if (quick === 'cancel') return Number(row.cancel_count || 0) > 0
        if (quick === 'no_show') return Number(row.no_show_count ?? Math.max(0, Number(row.invite_count || 0) - Number(row.arrive_count || 0))) > 0
        if (quick === 'arrive') return Number(row.arrive_count || 0) > 0
        return true
      })
  },
  /** 到店按邀约日期，发起邀约按记录创建日期；数据均来自当前筛选后的 breakdown。 */
  buildInviteRows(breakdown) {
    const picked = prefix => this.data.picks.filter(item => item.startsWith(prefix + ':')).map(item => item.slice(prefix.length + 1))
    const sortRows = rows => {
      const field = this.data.sortField || (this.data.inviteView === 'initiated' ? 'date' : 'arrive_date')
      const direction = this.data.sortField && this.data.sortOrder === 'asc' ? 1 : -1
      return rows.sort((left, right) => String(left[field] ?? '').localeCompare(String(right[field] ?? ''), 'zh-CN', { numeric: true }) * direction)
    }
    if (this.data.inviteView === 'initiated') {
      const inviters = picked('inviter')
      return sortRows((breakdown.invite_inviters || [])
        .filter(item => !inviters.length || inviters.includes(item.key))
        .map(item => ({ ...item, id: `inviter:${item.key}`, name: item.label })))
    }
    const rows = this.filteredTrafficCustomers(breakdown, this.data.picks)
      .filter(customer => Number(customer.arrive_count || 0) > 0)
      .map(customer => ({ ...customer, customer_id: customer.id }))
    return sortRows(this.data.arrivalView === 'date'
      ? rows.reduce((all, customer) => all.concat((customer.arrival_records || []).map(record => ({ ...customer, ...record }))), [])
      : rows)
  },
  buildTeacherDays(rows, completeDays = []) {
    const days = new Map()
    const totalsByDate = new Map(completeDays.map(day => [day.date, day]))
    rows.forEach(row => {
      const date = row.date || '未设置日期'
      if (!days.has(date)) days.set(date, { date, courseIds: new Set(), teachers: new Map() })
      const day = days.get(date)
      const teacherKey = row.teacher_id || row.teachers || '未设置老师'
      const courseKey = row.course_id || row.name || row.id
      day.courseIds.add(courseKey)
      if (!day.teachers.has(teacherKey)) day.teachers.set(teacherKey, {
        id: teacherKey, name: row.teachers || '未设置老师', total: 0, info: 0, point: 0, courses: new Map(),
      })
      const teacher = day.teachers.get(teacherKey)
      teacher.total += 1
      if (String(row.customer_info || '').trim()) teacher.info += 1
      if (String(row.follow_up || '').trim()) teacher.point += 1
      if (!teacher.courses.has(courseKey)) teacher.courses.set(courseKey, {
        id: courseKey, name: row.name || '未命名课程', type: row.type || '',
        typeLabel: row.type === '沙龙活动' && row.course_subtype ? row.course_subtype : row.type || '',
        rows: [],
      })
      const course = teacher.courses.get(courseKey)
      const notes = ['visit_need', 'customer_info', 'follow_up'].map(key => {
        const entries = row[`${key}_entries`] || []
        return entries.length ? entries.map(entry => `${entry.author || '反馈人未记录'}：${entry.content}`).join('\n') : String(row[key] || '')
      })
      course.rows.push({
        id: row.id, customer_id: row.customer_id, course_id: row.course_id,
        customer: row.customer, feedback: notes, ownerFirst: row.participant_role === '案主',
      })
    })
    return [...days.values()].map(day => {
      const dated = /^\d{4}-\d{2}-\d{2}$/.test(day.date)
      const [year, month, dateNumber] = dated ? day.date.split('-').map(Number) : []
      const weekday = dated ? `周${'日一二三四五六'[new Date(Date.UTC(year, month - 1, dateNumber)).getUTCDay()]}` : ''
      const completeDay = totalsByDate.get(day.date)
      const completeTeachers = new Map(((completeDay && completeDay.teachers) || []).map(teacher => [teacher.id, teacher]))
      const teachers = [...day.teachers.values()].map(stats => {
        const complete = completeTeachers.get(stats.id) || stats
        return {
          ...stats,
          total: complete.total, info: complete.info, point: complete.point,
          infoMissing: complete.info < complete.total,
          pointMissing: complete.point < complete.total,
          courseCount: complete.course_count || stats.courses.size,
          courses: [...stats.courses.values()].map((course, index) => ({
            ...course, indexText: String(index + 1).padStart(2, '0'),
            rows: course.rows.sort((a, b) => Number(b.ownerFirst) - Number(a.ownerFirst)),
          })),
        }
      })
      return {
        date: day.date,
        shortDate: dated ? day.date.slice(5).replace('-', '.') : day.date,
        weekday,
        teacherCount: completeDay ? completeDay.teacher_count : teachers.length,
        courseCount: completeDay ? completeDay.course_count : day.courseIds.size,
        teachers,
      }
    })
  },
  openTeacherDetail(e) {
    if (this.data.loading && this.data.query.tab === 'overview' && this.data.overviewGroup === 'courses') return
    const row = (this._sourceRows || []).find(item => item.id === e.currentTarget.dataset.id)
    if (!row) return
    const fields = [ ['visit_need', '来访需求'], ['customer_info', '客户信息'], ['follow_up', '跟进点'] ]
    const sections = fields.map(([key, label]) => ({
      label,
      entries: (row[`${key}_entries`] || []).map(entry => ({
        ...entry, atText: shanghaiDateTime(entry.at),
      })),
      fallback: row[key] || '', creators: row[`${key}_creators`] || '',
    }))
    this.setData({ teacherDetail: {
      customer: row.customer, participant_role: row.participant_role,
      date: row.date, name: row.name, teachers: row.teachers, sections,
    } })
  },
  closeTeacherDetail() { this.setData({ teacherDetail: null }) },
  /** 指标条：转化分析那几项能点着筛（与 PC 一致） */
  buildMetrics(group, result, trafficRows, picks) {
    const metric = (label, value, action) => ({
      label, value,
      sub: '',
      action: action || '',
      active: action ? (action.indexOf('pick:') === 0
        ? picks.indexOf(action.slice(5)) >= 0
        : action.indexOf('deal:') === 0
          ? this.data.query.course_deal === action.slice(5)
          : this.data.trafficQuickFilter === action.slice(6)) : false,
    })
    if (group === 'traffic') return []
    // 成交量这一组：指标口径与列表一致（成交批次里筛出来的），字段名和 PC 对齐
    if (group === 'deals') {
      const scope = result.list_summary || {}
      return [
        metric('成交量', `${scope['成交量'] ?? 0} 笔`),
        metric('成交人数', `${scope['成交人数'] ?? 0} 人`),
        metric('升单人数', `${scope['升单人'] ?? 0} 人`, 'pick:buy:升单'),
        metric('升单量', `${scope['升单量'] ?? 0} 次`, 'pick:buy:升单'),
      ]
    }
    if (group === 'invite') {
      if (result.mobile) {
        const stats = result.mobile
        const item = key => stats.invite[key] || { times: 0, people: 0 }
        return [
          { ...metric('邀约到店总次', `${stats.invite_total} 次`), sub: `${stats.invite_people} 人` },
          { ...metric('取消', `${item('cancel_count').times} 次`), sub: `${item('cancel_count').people} 人` },
          { ...metric('未到店', `${item('no_show_count').times} 次`), sub: `${item('no_show_count').people} 人` },
          { ...metric('已到店', `${item('arrive_count').times} 次`), sub: `${item('arrive_count').people} 人` },
          { ...metric('发起邀约次', `${stats.initiated_times} 次`), sub: `${stats.initiated_people} 人` },
        ]
      }
      const customers = this.filteredTrafficCustomers(result.breakdown || {}, picks)
      const count = key => customers.reduce((sum, item) => sum + Number(item[key] || 0), 0)
      const people = key => customers.filter(item => Number(item[key] || 0) > 0).length
      const invited = count('cancel_count') + count('no_show_count') + count('arrive_count')
      const initiators = (result.breakdown?.invite_inviters || []).filter(item => !picks.some(value => value.startsWith('inviter:')) || picks.includes(`inviter:${item.key}`))
      const initiated = initiators.reduce((sum, item) => sum + Number(item.initiated_count || 0), 0)
      const initiatedPeople = new Set(initiators.reduce((all, item) => all.concat((item.records || []).map(record => record.customer_id).filter(Boolean)), [])).size
      return [
        { ...metric('邀约到店总次', `${invited} 次`), sub: `${customers.filter(item => Number(item.invite_count || 0) > 0).length} 人` },
        { ...metric('取消', `${count('cancel_count')} 次`), sub: `${people('cancel_count')} 人` },
        { ...metric('未到店', `${count('no_show_count')} 次`), sub: `${people('no_show_count')} 人` },
        { ...metric('已到店', `${count('arrive_count')} 次`), sub: `${people('arrive_count')} 人` },
        { ...metric('发起邀约次', `${initiated} 次`), sub: `${initiatedPeople} 人` },
      ]
    }
    const scope = result.list_summary || {}, summary = result.summary || {}
    return [
      { ...metric('课程数', `${scope['课程数'] ?? summary['课程数'] ?? 0} 场`), sub: `${scope['课时数'] ?? summary['课时数'] ?? 0} 课时` },
      { ...metric('上课人次', `${scope['上课人次'] ?? summary['到场人次'] ?? 0} 次`), sub: `${scope['上课人数'] ?? summary['到场人数'] ?? 0} 人` },
      { ...metric('服务总人次', `${scope['服务人次'] ?? summary['服务人次'] ?? 0} 人次`), sub: `${scope['服务总人数'] ?? summary['服务总人数'] ?? 0} 人` },
      { ...metric('服务案主', `${scope['服务案主人次'] ?? summary['服务案主人次'] ?? 0} 人次`), sub: `${scope['服务案主人数'] ?? summary['服务案主人数'] ?? 0} 人` },
      { ...metric('服务参与者', `${scope['服务参与人次'] ?? summary['服务参与人次'] ?? 0} 人次`), sub: `${scope['服务参与者人数'] ?? summary['服务参与者人数'] ?? 0} 人` },
    ]
  },
  /** 面板下拉：单选维度保留一个值；卡种跟着付费项目、具体课程跟着课程类型走。 */
  onPanelSelect(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.panelSelects[index]
    const chosen = item && item.options[Number(e.detail.value)]
    if (!item || !chosen) return
    // 面板选项是 { key, label, text }，「全部」是 { value: '' }，两种都要能选
    const chosenKey = chosen.key || chosen.value || ''
    const value = chosenKey ? `${item.prefix}:${chosenKey}` : ''
    const childOf = { deals: ['subtype'], type: ['course'] }
    const picks = this.data.picks.filter(entry => {
      const prefix = entry.slice(0, entry.indexOf(':'))
      if (prefix === item.prefix) return false
      if ((childOf[item.prefix] || []).indexOf(prefix) >= 0) return false
      return true
    })
    this.setData({ picks: value ? picks.concat(value) : picks })
    this.loadData(true)
  },
  /** 点面板下拉：用底部弹层选，选项后面带数量（和 PC 一致） */
  openPanelSelect(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.panelSelects[index]
    if (!item) return
    const selected = this.data.picks.filter(value => value.startsWith(item.prefix + ':')).map(value => value.slice(item.prefix.length + 1))
    const options = item.options.map((option, optionIndex) => {
      const key = option.key || option.value || ''
      return { ...option, selected: item.multi ? (key ? selected.includes(key) : selected.length === 0) : optionIndex === item.index }
    })
    this.setData({ panelSheet: { index, title: item.label, options, multi: !!item.multi } })
  },
  closePanelSheet() { this.setData({ panelSheet: null }) },
  /** 弹层里选中某一项 */
  onPanelOption(e) {
    const optionIndex = Number(e.currentTarget.dataset.index)
    const sheet = this.data.panelSheet
    if (!sheet) return
    const item = this.data.panelSelects[sheet.index]
    if (item && item.multi) {
      const chosen = item.options[optionIndex]
      if (!chosen) return
      const key = chosen.key || chosen.value || ''
      const pick = key ? `${item.prefix}:${key}` : ''
      let picks = this.data.picks.slice()
      if (!pick) {
        picks = picks.filter(value => !value.startsWith(item.prefix + ':'))
      } else if (picks.includes(pick)) {
        picks = picks.filter(value => value !== pick)
      } else {
        picks.push(pick)
      }
      const selected = picks.filter(value => value.startsWith(item.prefix + ':')).map(value => value.slice(item.prefix.length + 1))
      const options = sheet.options.map(option => {
        const optionKey = option.key || option.value || ''
        return { ...option, selected: optionKey ? selected.includes(optionKey) : selected.length === 0 }
      })
      this.setData({ picks, panelSheet: { ...sheet, options } })
      this.loadData(true)
      return
    }
    this.onPanelSelect({ currentTarget: { dataset: { index: sheet.index } }, detail: { value: optionIndex } })
    this.setData({ panelSheet: null })
  },
  onTrafficDealFilter(e) {
    const kind = e.currentTarget.dataset.kind
    const key = e.currentTarget.dataset.key || ''
    const next = kind === 'product' ? `product:${key}` : 'deals'
    this.setData({ trafficQuickFilter: this.data.trafficQuickFilter === next ? '' : next }, () => this.loadData(true))
  },
  onOverviewCard(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ overviewGroup: this.data.overviewGroup === key ? '' : key, picks: [], inviteView: 'arrive', inviteToolMenuOpen: false, sortField: '', sortOrder: 'desc',
      query: { ...this.data.query, course_view: 'course', participant_scope: '', invite_view: 'arrive' } })
    // 四张概况卡本身不需要重新渲染；保留下方旧内容，接口返回后一次替换，避免页面高度骤降导致闪屏和滚动归顶。
    this.loadData(true, { preserveContent: true, preserveCards: true })
  },
  togglePick(e) {
    const value = e.currentTarget.dataset.value
    const picks = this.data.picks.indexOf(value) >= 0
      ? this.data.picks.filter(item => item !== value)
      : this.data.picks.concat(value)
    this.setData({ picks })
    this.loadData(true)
  },
  updateQuery(patch) { const query = { ...this.data.query, ...patch }; this.setData({ query, ruleSentence: describeRule(query.rule, this.data.metadata) }); this.loadData(true) },
  /** 改筛选条件：转化分析要等点「查询」才重算，其它 tab 即时生效（和 PC 一致） */
  applyFilters(patch) {
    const query = { ...this.data.query, ...patch }
    this.setData({ query, ruleSentence: describeRule(query.rule, this.data.metadata) })
    this.refreshEditors()
    if (query.tab !== 'conversion') this.loadData(true)
  },
  onOrg(e) { const i = Number(e.detail.value); this.setData({ orgIndex: i }); this.applyFilters({ organization_id: this.data.organizations[i].id }) },
  onCourseView(e) {
    const view = e.currentTarget.dataset.view
    const previousQuery = this.data.query
    if (view === previousQuery.course_view && !this.data.error) return
    this.setData({ query: { ...previousQuery, course_view: view,
      participant_scope: view === 'participant' ? previousQuery.participant_scope : '' } })
    this.loadData(true, { preserveContent: true, preserveCards: true,
      rollbackCourseQuery: this._loadedCourseQuery || previousQuery })
  },
  onInviteView(e) {
    const view = e.currentTarget.dataset.view
    const previousView = this.data.inviteView
    if (view === previousView && !this.data.error) return
    this.setData({ inviteView: view, inviteToolMenuOpen: false, sortField: '', sortOrder: 'desc' })
    this.loadData(true, { preserveContent: true, preserveCards: true,
      rollbackInviteView: this._loadedInviteView || previousView })
  },
  onArrivalView(e) {
    const arrivalView = Number(e.detail.value) === 1 ? 'date' : 'customer'
    const previousView = this.data.arrivalView
    if (arrivalView === previousView && !this.data.error) { this.closeInviteToolMenu(); return }
    this.setData({ arrivalView, inviteToolMenuOpen: false })
    this.loadData(true, { preserveContent: true, preserveCards: true,
      rollbackArrivalView: this._loadedArrivalView || previousView })
  },
  onDate(e) { this.setData({ rangePreset: 'custom', rangePresetIndex: -1 }); this.applyFilters({ [e.currentTarget.dataset.field]: e.detail.value }) },
  clearDates() { this.setData({ rangePreset: 'all', rangePresetIndex: 4 }); this.applyFilters({ date_from: null, date_to: null }) },
  /** 快捷周期：当天 / 本周 / 本月 / 本年 / 全部 */
  onRangePreset(e) {
    const key = e.currentTarget.dataset.key
    const now = new Date()
    const pad = value => String(value).padStart(2, '0')
    const fmt = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    let from = '', to = ''
    if (key === 'today') { from = fmt(now); to = fmt(now) }
    else if (key === 'week') { const start = new Date(now); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); from = fmt(start); to = fmt(now) }
    else if (key === 'month') { from = fmt(new Date(now.getFullYear(), now.getMonth(), 1)); to = fmt(now) }
    else if (key === 'year') { from = fmt(new Date(now.getFullYear(), 0, 1)); to = fmt(now) }
    this.setData({ rangePreset: key })
    this.setData({ rangePresetIndex: Math.max(0, this.data.rangePresets.findIndex(item => item.key === key)) })
    this.applyFilters({ date_from: from || null, date_to: to || null })
  },
  onTab(e) {
    const tab = e.currentTarget.dataset.key
    this.setData({ overviewGroup: tab === 'overview' ? 'traffic' : '', picks: [], inviteToolMenuOpen: false })
    this.updateQuery({ tab, product: '', course_view: 'course', participant_scope: '' })
    if (tab === 'conversion') this.loadConversionSetup()
  },
  async loadConversionSetup() {
    try {
      const [metadata, rules] = await Promise.all([principalApi.metadata(), principalApi.rules()])
      if (this.data.query.tab !== 'conversion') return
      const selectedIndex = rules.findIndex(item => item.id === this.data.ruleId)
      this.setData({ metadata, rules, ruleOptions: ['默认规则', ...rules.map(ruleLabel)],
        ruleIndex: selectedIndex + 1, canManageRule: selectedIndex >= 0 && rules[selectedIndex].can_manage === true })
      this.refreshEditors()
      this.ensureRuleFields()
    } catch (error) { wx.showToast({ title: error.message || '加载规则失败', icon: 'none' }) }
  },
  /** 结果状态：选完等「查询」（和 PC 一致） */
  onStatusTap(e) { this.applyFilters({ status: e.currentTarget.dataset.value }) },
  onRule(e) {
    const i = Number(e.detail.value), saved = this.data.rules[i - 1]
    const rule = clone(saved ? saved.rule : INITIAL_RULE)
    this.setData({ ruleIndex: i, ruleId: saved ? saved.id : '', canManageRule: !!saved && saved.can_manage === true })
    // 规则里存过范围才恢复，老规则不动当前选择（和 PC 一致）
    const hasRange = !!(rule.organization_id || rule.date_from || rule.date_to)
    if (!hasRange) { this.applyFilters({ rule }); return }
    const organizations = this.data.organizations
    this.setData({ orgIndex: Math.max(0, organizations.findIndex(item => item.id === (rule.organization_id || ''))) })
    if (rule.date_from || rule.date_to) this.setData({ rangePreset: 'custom', rangePresetIndex: -1 })
    this.applyFilters({ rule, organization_id: rule.organization_id || '', date_from: rule.date_from || null, date_to: rule.date_to || null })
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading && !this.data.error) this.loadData(false) },
  retryLoad() { if (!this.data.loading) this.loadData(!this.data.list.length) },
  async onPullDownRefresh() { if (!getApp().checkLogin()) return; try { await this.initialize() } finally { wx.stopPullDownRefresh() } },
  async showDetails(e) {
    if (this.data.loading && this.data.query.tab === 'overview' && ['invite', 'courses'].includes(this.data.overviewGroup)) return
    const row = (this._sourceRows || [])[e.currentTarget.dataset.index] || {}
    if (this.data.overviewGroup === 'invite' && this.data.query.tab === 'overview') {
      if (this.data.inviteView === 'initiated') {
        this._detailSequence = (this._detailSequence || 0) + 1
        this.setData({ recordSheet: { key: row.key, name: row.name, type: 'initiated', rows: [], page: 0, hasMore: true } })
        this.loadMoreInviterRecords()
        return
      }
      const dateLabel = `邀约到店 ${row.arrive_date || '—'}`
      this.setData({ detail: {
        id: row.id, title: '邀约到店明细',
        detailRows: [dateLabel, `客户 ${row.name || '—'} · ${row.identity || '未配置'}`, `邀约人 ${row.arrive_inviter || '未配置'}`,
          `当日成交 ${row.same_day_deals || 0} 笔`]
          .map(text => ({ text, id: '' })),
      } })
      return
    }
    // 明细弹窗里的每一行：到场的人带上客户 id，可以点「资料」进客户资料
    const people = [].concat(row.new_people || [], row.old_people || [])
    const byName = {}
    people.forEach(person => { if (person && person.name) byName[person.name] = person.id })
    const owner = row.owner || ''
    const detailRows = (row.details || []).map(line => {
      const parts = String(line).split('｜')
      const tag = parts[0] || ''
      const name = parts[1] || ''
      return { text: String(line), tag, name, id: byName[name] || '' }
    })
    this.setData({ detail: { id: row.id, detailRows, owner, title: '关联明细' } })
  },
  async loadMoreInviterRecords() {
    const sheet = this.data.recordSheet
    if (!sheet || sheet.type !== 'initiated' || !sheet.hasMore || this.data.recordLoading) return
    const sequence = this._detailSequence
    const page = sheet.page + 1
    this.setData({ recordLoading: true })
    try {
      const result = await principalApi.query({ ...this.data.query, breakdown: this.data.picks,
        mobile_group: 'invite_initiated', mobile_detail_key: sheet.key, page, page_size: 100 })
      if (sequence !== this._detailSequence) return
      const rows = sheet.rows.concat((result.mobile.detail_records || []).map(record => ({
        main: `发起邀约 ${record.date || '—'} · 邀约到店 ${record.visit_date || '—'} · ${record.name || '未命名'}`,
        sub: `${record.identity || '未配置'} · ${record.status_label || '—'}`, id: record.customer_id,
      })))
      this.setData({ recordSheet: { ...sheet, rows, page, hasMore: rows.length < result.mobile.detail_total }, recordLoading: false })
    } catch (error) {
      if (sequence === this._detailSequence) {
        this.setData({ recordLoading: false })
        wx.showToast({ title: error.message || '加载失败', icon: 'none' })
      }
    }
  },
  // 课程当日成交 / 关联成交：点数字只看这一类明细
  openCellDetails(e) {
    const row = (this._sourceRows || [])[Number(e.currentTarget.dataset.index)] || {}
    const tag = e.currentTarget.dataset.tag
    const lines = (row.details || []).filter(line => !tag || line.indexOf(tag) === 0)
    this.setData({ detail: {
      id: row.id, detailRows: (lines.length ? lines : (row.details || [])).map(text => ({ text, id: '' })),
      title: `${row.name || row.customer || ''} · ${tag}`,
    } })
  },
  toggleExpandCells() { this.setData({ expandCells: !this.data.expandCells }) },
  /** 指标条可点：升单 → 选「升单」；当日/关联成交 → 筛课程；邀约/取消/到店 → 筛引流客户 */
  onMetricTap(e) {
    const action = e.currentTarget.dataset.action
    if (!action) return
    const [kind, value] = action.split(':')
    if (kind === 'pick') {
      const picks = this.data.picks.indexOf(value) >= 0 ? this.data.picks.filter(item => item !== value) : this.data.picks.concat(value)
      this.setData({ picks })
      this.loadData(true)
      return
    }
    if (kind === 'deal') {
      this.updateQuery({ course_deal: this.data.query.course_deal === value ? '' : value })
      return
    }
    if (kind === 'quick') {
      this.setData({ trafficQuickFilter: this.data.trafficQuickFilter === value ? '' : value }, () => this.loadData(true))
    }
  },
  onListView(e) { this.setData({ listViewIndex: Number(e.detail.value) }); this.loadData(true) },
  toggleCardHelp(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ helpKey: this.data.helpKey === key ? '' : key })
  },
  onScopeReset() {
    // 转化分析：重置回未保存的默认规则（和 PC 的重置一致），同样等「查询」再生效
    this.setData({ ruleIndex: 0, ruleId: '', canManageRule: false })
    this.applyFilters({ rule: clone(INITIAL_RULE), status: '' })
  },
  /** 转化分析：只有点了「查询」才写分析日志（和 PC 一致） */
  runScopeQuery() {
    const blank = this.blankConditionMessage()
    if (blank) { wx.showToast({ title: blank, icon: 'none' }); return }
    this._logAnalysis = true
    this.loadData(true)
  },
  /** 条件没填完就别发请求：和自定义筛选同一句话 */
  blankConditionMessage() {
    const fields = (this.data.ruleFields && this.data.ruleFields.fields) || []
    const rule = this.data.query.rule
    for (const action of [rule.source, ...rule.targets]) {
      for (const condition of (action.conditions || [])) {
        if (VALUELESS_OPERATORS[condition.operator]) continue
        const value = condition.value
        const empty = value === undefined || value === null || value === ''
          || (Array.isArray(value) && (value.length === 0 || value.some(item => !item)))
        if (empty) {
          const definition = fields.find(item => item.value === condition.field)
          const label = (definition && definition.label) || condition.field
          return `「${label}」的筛选值还没填，${condition.operator === 'in' ? '请选择' : '请填写'}后再查询`
        }
      }
    }
    return ''
  },
  openParticipantProfile(e) {
    if (this.data.loading && this.data.query.tab === 'overview' && this.data.overviewGroup === 'courses') return
    const id = e.currentTarget.dataset.id
    if (!id) return
    // 参数保持原样：api 层再编码一次，否则课程 id 会被编码两遍（gcs%253A…）后端匹配不上
    wx.navigateTo({ url: '/pages/customer-profile/index?id=' + id + '&principalParticipant=1&principalCourse=' + (e.currentTarget.dataset.course || '') })
  },
  // 引流客户列表里点昵称，进客户资料
  openCustomerProfile(e) {
    if (this.data.loading && this.data.query.tab === 'overview' && ['invite', 'courses'].includes(this.data.overviewGroup)) return
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/customer-profile/index?id=' + encodeURIComponent(id) })
  },
  closeDetails() { this.setData({ detail: null }) },
  noop() {},
  /** 转化规则就地编辑：改完点「查询」重算（和 PC 一致，不再单独弹窗） */
  actionAt(index) { return index === 0 ? this.data.query.rule.source : this.data.query.rule.targets[index - 1] },
  refreshEditors() {
    const { query, metadata, ruleFields } = this.data
    if (!metadata) return
    const rule = query.rule
    const fields = (ruleFields && ruleFields.fields) || []
    const operatorLabels = {}
    ;((ruleFields && ruleFields.operators) || []).forEach(item => { operatorLabels[item.value] = item.label })
    const actions = [rule.source, ...rule.targets]
    this.setData({
      actionEditors: actions.map((action, index) => {
        const options = action.kind === 'purchase' ? metadata.products : action.kind === 'attendance' ? metadata.activity_types : []
        const products = [{ key: '', label: '全部类型' }].concat(options || [])
        const subtypes = ['', ...(((options || []).find(item => item.key === action.product) || {}).subtypes || [])]
        return {
          index,
          title: index === 0 ? '从' : index === 1 ? '到' : rule.target_mode === 'all' ? '且' : '或',
          kindIndex: Math.max(0, KINDS.indexOf(action.kind)),
          occurrenceLabels: ['仅首次', '复购（不含首次）', '全部'],
          occurrenceIndex: Math.max(0, OCCURRENCES.indexOf(action.occurrence)),
          products,
          productIndex: Math.max(0, products.findIndex(item => item.key === action.product)),
          subtypeLabels: subtypes.map(value => value || (action.kind === 'purchase' ? '不限具体产品或卡种' : '不限具体课程')),
          subtypes,
          subtypeIndex: Math.max(0, subtypes.indexOf(action.subtype)),
          // 附加条件只挂在「从」上（后端口径：「到」只填什么算转化），控件与自定义筛选同一套
          conditions: index === 0 ? (action.conditions || []).map((condition, ci) => this.conditionView(condition, ci, fields, operatorLabels)) : [],
          canAddCondition: index === 0 && (action.conditions || []).length < CONDITION_MAX && fields.length > 0,
        }
      }),
      canAddTarget: rule.targets.length < 8,
      canRemoveTarget: rule.targets.length > 1,
      targetModeIndex: rule.target_mode === 'all' ? 1 : 0,
    })
  },
  /** 一条条件在页面上要用的展示数据（值长什么样由字段定义决定） */
  conditionView(condition, index, fields, operatorLabels) {
    const definition = fields.find(item => item.value === condition.field) || null
    const options = (definition && definition.options) || []
    const valueType = definition ? definition.value_type : 'text'
    const isBetween = condition.operator === 'between'
    const values = Array.isArray(condition.value) ? condition.value.map(item => (item === null || item === undefined ? '' : String(item))) : []
    const single = condition.value === null || condition.value === undefined || Array.isArray(condition.value) ? '' : String(condition.value)
    const hasOptions = options.length > 0
    return {
      index,
      field: condition.field,
      fieldLabel: (definition && definition.label) || condition.field,
      operatorLabel: operatorLabels[condition.operator] || condition.operator,
      noValue: !!VALUELESS_OPERATORS[condition.operator],
      isDate: valueType === 'date',
      isNumber: valueType === 'number',
      isBetween,
      hasOptions,
      isMulti: condition.operator === 'in' && hasOptions,
      value: single,
      valueStart: values[0] || '',
      valueEnd: values[1] || '',
      valueLabel: hasOptions && !isBetween && options.indexOf(single) >= 0 ? single : '',
      multiLabel: values.join('、'),
    }
  },
  onAction(e) {
    const index = Number(e.currentTarget.dataset.index), field = e.currentTarget.dataset.field, selected = Number(e.detail.value)
    const rule = clone(this.data.query.rule), editor = this.data.actionEditors[index]
    const action = index === 0 ? rule.source : rule.targets[index - 1]
    if (field === 'kind') { action.kind = KINDS[selected]; action.product = ''; action.subtype = '' }
    if (field === 'product') { action.product = editor.products[selected].key; action.subtype = '' }
    if (field === 'subtype') action.subtype = editor.subtypes[selected]
    if (field === 'occurrence') action.occurrence = OCCURRENCES[selected]
    this.applyFilters({ rule })
  },
  onRuleField(e) {
    const rule = { ...clone(this.data.query.rule), [e.currentTarget.dataset.field]: e.currentTarget.dataset.number ? Number(e.detail.value) : e.detail.value }
    this.applyFilters({ rule })
  },
  onMode(e) {
    const rule = { ...clone(this.data.query.rule), target_mode: Number(e.detail.value) === 0 ? 'any' : 'all' }
    this.applyFilters({ rule })
  },
  onToggleSameOrg() {
    const rule = { ...clone(this.data.query.rule), same_organization: !this.data.query.rule.same_organization }
    this.applyFilters({ rule })
  },
  addTarget() {
    const rule = clone(this.data.query.rule)
    if (rule.targets.length >= 8) return
    rule.targets.push({ kind: 'purchase', product: '', subtype: '', occurrence: 'any', conditions: [] })
    this.applyFilters({ rule })
  },
  removeTarget(e) {
    const rule = clone(this.data.query.rule)
    if (rule.targets.length <= 1) return
    rule.targets.splice(Number(e.currentTarget.dataset.index) - 1, 1)
    this.applyFilters({ rule })
  },
  // ---- 附加条件：字段 / 规则 / 值与自定义筛选同一套 ----
  setConditions(actionIndex, conditions) {
    const rule = clone(this.data.query.rule)
    if (actionIndex === 0) rule.source.conditions = conditions
    else rule.targets[actionIndex - 1].conditions = conditions
    this.applyFilters({ rule })
  },
  onConditionAdd(e) {
    const index = Number(e.currentTarget.dataset.index)
    const action = this.actionAt(index)
    if (!action || (action.conditions || []).length >= CONDITION_MAX) return
    const condition = makeCondition((this.data.ruleFields && this.data.ruleFields.fields) || [])
    if (!condition) return
    this.setConditions(index, (action.conditions || []).concat(condition))
  },
  onConditionRemove(e) {
    const index = Number(e.currentTarget.dataset.index), ci = Number(e.currentTarget.dataset.ci)
    const action = this.actionAt(index)
    if (!action) return
    this.setConditions(index, (action.conditions || []).filter((_, i) => i !== ci))
  },
  /** 点条件上的字段 / 规则 / 值：底部弹层选（和自定义筛选一样） */
  onConditionPick(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ci = Number(e.currentTarget.dataset.ci)
    const kind = e.currentTarget.dataset.sheet
    const action = this.actionAt(index)
    const condition = action && (action.conditions || [])[ci]
    if (!condition) return
    const fields = (this.data.ruleFields && this.data.ruleFields.fields) || []
    const operators = (this.data.ruleFields && this.data.ruleFields.operators) || []
    const definition = fields.find(item => item.value === condition.field) || null
    let title = ''
    let options = []
    if (kind === 'field') {
      title = '选择条件字段'
      options = fields.map(item => ({ value: item.value, label: item.label, note: item.group, checked: item.value === condition.field }))
    } else if (kind === 'operator') {
      title = '选择规则'
      const labels = {}
      operators.forEach(item => { labels[item.value] = item.label })
      options = ((definition && definition.operators) || []).map(value => ({ value, label: labels[value] || value, note: '', checked: value === condition.operator }))
    } else {
      title = (definition && definition.label) || '选择筛选值'
      const picked = Array.isArray(condition.value) ? condition.value.map(String) : []
      options = ((definition && definition.options) || []).map(value => ({
        value, label: value, note: '',
        checked: kind === 'multi' ? picked.indexOf(value) >= 0 : String(condition.value) === value,
      }))
    }
    this.setData({ condSheet: { kind, index, ci, title, options } })
  },
  closeCondSheet() { this.setData({ condSheet: null }) },
  onCondSheetOption(e) {
    const sheet = this.data.condSheet
    if (!sheet) return
    const optionIndex = Number(e.currentTarget.dataset.index)
    const option = sheet.options[optionIndex]
    const action = this.actionAt(sheet.index)
    if (!option || !action) return
    const conditions = (action.conditions || []).slice()
    const condition = { ...conditions[sheet.ci] }
    const fields = (this.data.ruleFields && this.data.ruleFields.fields) || []
    if (sheet.kind === 'field') {
      const definition = fields.find(item => item.value === option.value) || null
      const operator = (definition && definition.operators && definition.operators[0]) || 'eq'
      condition.field = option.value
      condition.operator = operator
      condition.value = conditionValueFor(definition, operator)
    } else if (sheet.kind === 'operator') {
      const definition = fields.find(item => item.value === condition.field) || null
      condition.operator = option.value
      condition.value = conditionValueFor(definition, option.value)
    } else if (sheet.kind === 'multi') {
      const picked = Array.isArray(condition.value) ? condition.value.map(String) : []
      condition.value = picked.indexOf(option.value) >= 0 ? picked.filter(item => item !== option.value) : picked.concat(option.value)
    } else {
      condition.value = option.value
    }
    conditions[sheet.ci] = condition
    this.setConditions(sheet.index, conditions)
    // 多选要能连着勾几项，选完点「完成」关闭
    if (sheet.kind === 'multi') {
      this.setData({ condSheet: { ...sheet, options: sheet.options.map((item, i) => (i === optionIndex ? { ...item, checked: !item.checked } : item)) } })
    } else {
      this.setData({ condSheet: null })
    }
  },
  /** 条件里的输入框 / 日期：值的形状和自定义筛选一致（区间两个值、多选是数组） */
  onConditionValue(e) {
    const index = Number(e.currentTarget.dataset.index), ci = Number(e.currentTarget.dataset.ci)
    const part = e.currentTarget.dataset.part
    const action = this.actionAt(index)
    if (!action) return
    const conditions = (action.conditions || []).slice()
    const condition = { ...conditions[ci] }
    const value = e.detail.value
    if (condition.operator === 'between') {
      const pair = Array.isArray(condition.value) ? condition.value.slice() : ['', '']
      pair[part === 'end' ? 1 : 0] = value
      condition.value = pair
    } else {
      condition.value = value
    }
    conditions[ci] = condition
    this.setConditions(index, conditions)
  },
  // ---- 保存规则：名称 / 说明 / 可见范围在弹窗里填（和自定义筛选的「保存模板」一致） ----
  openSaveRule() {
    if (!this.data.ruleFields) this.ensureRuleFields()
    this.setData({ showSaveRule: true, ruleNameDraft: '', ruleDescriptionDraft: '', ruleScopeDraft: 'private' })
  },
  closeSaveRule() { if (!this.data.savingRule) this.setData({ showSaveRule: false }) },
  onRuleNameInput(e) { this.setData({ ruleNameDraft: e.detail.value }) },
  onRuleDescriptionInput(e) { this.setData({ ruleDescriptionDraft: e.detail.value }) },
  onRuleScopeTap(e) { this.setData({ ruleScopeDraft: e.currentTarget.dataset.scope }) },
  async confirmSaveRule() {
    const name = (this.data.ruleNameDraft || '').trim()
    if (!name) { wx.showToast({ title: '请输入规则名称', icon: 'none' }); return }
    const rule = clone(this.data.query.rule)
    const windowDays = Number(rule.window_days)
    if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 3650) { wx.showToast({ title: '转化间隔期限填 0～3650 天', icon: 'none' }); return }
    if (this.data.savingRule) return
    this.setData({ savingRule: true })
    try {
      const saved = await principalApi.saveRule({
        ...rule,
        name,
        description: (this.data.ruleDescriptionDraft || '').trim(),
        scope: this.data.ruleScopeDraft,
        // 规则连当时的筛选范围一起记住，下次选用这条规则会一起还原
        organization_id: this.data.query.organization_id || '',
        date_from: this.data.query.date_from || '',
        date_to: this.data.query.date_to || '',
      })
      const rules = await principalApi.rules()
      this.setData({
        rules, ruleOptions: ['默认规则', ...rules.map(ruleLabel)],
        ruleIndex: rules.findIndex(item => item.id === saved.id) + 1,
        ruleId: saved.id, canManageRule: true,
        showSaveRule: false, ruleNameDraft: '', ruleDescriptionDraft: '', savingRule: false,
      })
      this.applyFilters({ rule: saved.rule })
    } catch (e) {
      this.setData({ savingRule: false })
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },
  removeRule() {
    if (!this.data.ruleId || !this.data.canManageRule || this.data.busy) return
    wx.showModal({ title: '删除规则', content: '仅删除当前账号的分析规则，不删除业务记录。', success: async res => {
      if (!res.confirm) return
      this.setData({ busy: true })
      try {
        await principalApi.deleteRule(this.data.ruleId); const rules = await principalApi.rules()
        this.setData({ rules, ruleOptions: ['默认规则', ...rules.map(ruleLabel)], ruleIndex: 0, ruleId: '', canManageRule: false })
        this.applyFilters({ rule: clone(INITIAL_RULE) })
      } catch (e) { wx.showToast({ title: e.message || '删除失败', icon: 'none' }) } finally { this.setData({ busy: false }) }
    } })
  },
  async exportData() {
    if (this.data.busy || this.data.loading) return
    this.setData({ busy: true })
    try {
      const traffic = this.data.query.tab === 'overview' && this.data.overviewGroup === 'traffic'
      const invite = this.data.query.tab === 'overview' && this.data.overviewGroup === 'invite'
      const buffer = await principalApi.export({
        ...this.data.query, breakdown: this.data.picks,
        sort_by: this.data.sortField, sort_order: this.data.sortOrder,
        ...(traffic ? { export_view: 'traffic', mobile_quick_filter: this.data.trafficQuickFilter } : {}),
        ...(invite && this.data.inviteView === 'arrive'
          ? { export_view: 'invite_arrivals', arrival_view: this.data.arrivalView,
            export_columns: this.data.columns.map(column => column.key) }
          : {}),
        ...(invite && this.data.inviteView === 'initiated'
          ? { export_view: 'invite_initiated', export_columns: ['date', 'visit_date', 'name', 'identity', 'referrer', 'referrer_handler', 'status_label', 'invite_count', 'cancel_count', 'no_show_count', 'arrive_count'] }
          : {}),
      })
      const path = wx.env.USER_DATA_PATH + '/principal-' + Date.now() + '.xlsx'
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: buffer, success: resolve, fail: reject }))
      await new Promise((resolve, reject) => wx.openDocument({ filePath: path, fileType: 'xlsx', showMenu: true, success: resolve, fail: reject }))
    } catch (e) { wx.showToast({ title: e.message || '导出失败', icon: 'none' }) } finally { this.setData({ busy: false }) }
  },
})
