const { principalApi } = require('../../utils/api')
const INITIAL_RULE = {
  name: '粗门初次到场 → 会员卡首购',
  source: { kind: 'coarse_usage', product: '', subtype: '', occurrence: 'first' },
  targets: [{ kind: 'purchase', product: 'membership', subtype: '', occurrence: 'first' }],
  target_mode: 'any', window_days: 30, same_organization: true,
}
const clone = value => JSON.parse(JSON.stringify(value))
const KINDS = ['coarse_usage', 'attendance', 'purchase']
const OCCURRENCES = ['first', 'any', 'repeat']

Page({
  data: {
    metadata: null, organizations: [{ id: '', name: '全部可见组织' }], orgIndex: 0,
    tabs: [{ key: 'overview', label: '经营概况' }, { key: 'courses', label: '课程记录' }],
    query: { organization_id: '', date_from: null, date_to: null, tab: 'overview', product: '', order_filter: '', status: '', rule: clone(INITIAL_RULE) },
    rules: [], ruleOptions: ['默认规则'], ruleIndex: 0, ruleId: '',
    productOptions: [{ key: '', label: '全部成交产品' }], productIndex: 0,
    orderOptions: ['全部购买类型', '首购', '同类复购', '跨品类首购'], orderIndex: 0,
    statusOptions: ['全部状态', '已转化', '未转化', '观察中'], statusIndex: 0,
    list: [], summary: [], notice: '', page: 1, total: 0, hasMore: false, loading: false, error: '', busy: false,
    editing: false, draft: clone(INITIAL_RULE), actionEditors: [], detail: null,
    kindLabels: ['粗门次卡实际到场', '课程实际到场', '购买付费项目'],
    occurrenceLabels: ['首次', '任意一次', '再次（非首次日）'], modeLabels: ['满足任意目标', '满足全部目标'],
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
      const [metadata, rules] = await Promise.all([principalApi.metadata(), principalApi.rules()])
      const tabs = [{ key: 'overview', label: '经营概况' }, { key: 'courses', label: '课程记录' }]
      if (metadata.transaction_access === 'detail') tabs.push({ key: 'orders', label: '交易记录' }, { key: 'conversion', label: '转化分析' })
      this.setData({ metadata, tabs, rules, ruleOptions: ['默认规则', ...rules.map(r => r.rule.name)], organizations: [{ id: '', name: '全部可见组织' }, ...metadata.organizations], productOptions: [{ key: '', label: '全部成交产品' }, ...metadata.products, { key: 'coarse', label: '粗门次卡扣卡（不计购买）' }] })
      await this.loadData(true)
    } catch (e) { this.setData({ error: e.message || '加载失败' }) }
  },
  async loadData(reset) {
    const sequence = this._sequence = (this._sequence || 0) + 1
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true, error: '', ...(reset ? { list: [], summary: [], detail: null } : {}) })
    try {
      const result = await principalApi.query({ ...this.data.query, page, page_size: 20 })
      if (sequence !== this._sequence) return
      const items = result.items.map(row => ({ ...row, cells: result.columns.map(c => ({ label: c.label, value: row[c.key] === 0 ? '0' : (row[c.key] || '—') })) }))
      const list = reset ? items : this.data.list.concat(items)
      this.setData({ list, summary: Object.entries(result.summary).map(([label, value]) => ({ label, value })), notice: result.notice, page: result.page, total: result.total, hasMore: list.length < result.total })
    } catch (e) { if (sequence === this._sequence) this.setData({ error: e.message || '加载失败', list: [], summary: [] }) }
    finally { if (sequence === this._sequence) this.setData({ loading: false }) }
  },
  updateQuery(patch) { this.setData({ query: { ...this.data.query, ...patch } }); this.loadData(true) },
  onOrg(e) { const i = Number(e.detail.value); this.setData({ orgIndex: i }); this.updateQuery({ organization_id: this.data.organizations[i].id }) },
  onDate(e) { this.updateQuery({ [e.currentTarget.dataset.field]: e.detail.value }) },
  clearDates() { this.updateQuery({ date_from: null, date_to: null }) },
  onTab(e) { this.setData({ productIndex: 0 }); this.updateQuery({ tab: e.currentTarget.dataset.key, product: '' }) },
  onProduct(e) { const i = Number(e.detail.value); this.setData({ productIndex: i }); this.updateQuery({ product: this.data.productOptions[i].key }) },
  onOrder(e) { const i = Number(e.detail.value); this.setData({ orderIndex: i }); this.updateQuery({ order_filter: ['', 'first', 'repeat', 'cross'][i] }) },
  onStatus(e) { const i = Number(e.detail.value); this.setData({ statusIndex: i }); this.updateQuery({ status: ['', 'converted', 'unconverted', 'observing'][i] }) },
  onRule(e) {
    const i = Number(e.detail.value), saved = this.data.rules[i - 1]
    this.setData({ ruleIndex: i, ruleId: saved ? saved.id : '' }); this.updateQuery({ rule: clone(saved ? saved.rule : INITIAL_RULE) })
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.loadData(false) },
  async onPullDownRefresh() { if (!getApp().checkLogin()) return; try { await this.initialize() } finally { wx.stopPullDownRefresh() } },
  showDetails(e) { this.setData({ detail: this.data.list[e.currentTarget.dataset.index] }) },
  closeDetails() { this.setData({ detail: null }) },
  openEditor() { this.setData({ editing: true, draft: clone(this.data.query.rule) }); this.refreshEditors() },
  closeEditor() { if (!this.data.busy) this.setData({ editing: false }) },
  noop() {},
  refreshEditors() {
    const { draft, metadata } = this.data
    const actions = [draft.source, ...draft.targets]
    this.setData({ actionEditors: actions.map((action, index) => {
      const options = action.kind === 'purchase' ? metadata.products : action.kind === 'attendance' ? metadata.activity_types : []
      const products = [{ key: '', label: '全部类型' }, ...options]
      const subtypes = ['', ...((options.find(p => p.key === action.product) || {}).subtypes || [])]
      return { index, title: index === 0 ? '起点行为' : '目标 ' + index, kindIndex: KINDS.indexOf(action.kind), occurrenceIndex: OCCURRENCES.indexOf(action.occurrence), products, productIndex: Math.max(0, products.findIndex(p => p.key === action.product)), subtypeLabels: subtypes.map(s => s || '全部具体产品'), subtypes, subtypeIndex: Math.max(0, subtypes.indexOf(action.subtype)) }
    }) })
  },
  onAction(e) {
    const index = Number(e.currentTarget.dataset.index), field = e.currentTarget.dataset.field, selected = Number(e.detail.value)
    const draft = clone(this.data.draft), editor = this.data.actionEditors[index], action = index === 0 ? draft.source : draft.targets[index - 1]
    if (field === 'kind') { action.kind = KINDS[selected]; action.product = ''; action.subtype = '' }
    if (field === 'product') { action.product = editor.products[selected].key; action.subtype = '' }
    if (field === 'subtype') action.subtype = editor.subtypes[selected]
    if (field === 'occurrence') action.occurrence = OCCURRENCES[selected]
    this.setData({ draft }); this.refreshEditors()
  },
  onRuleField(e) { this.setData({ ['draft.' + e.currentTarget.dataset.field]: e.detail.value }) },
  onMode(e) { this.setData({ 'draft.target_mode': Number(e.detail.value) === 0 ? 'any' : 'all' }) },
  addTarget() { const draft = clone(this.data.draft); if (draft.targets.length >= 8) return; draft.targets.push({ kind: 'purchase', product: '', subtype: '', occurrence: 'any' }); this.setData({ draft }); this.refreshEditors() },
  removeTarget(e) { const draft = clone(this.data.draft); if (draft.targets.length <= 1) return; draft.targets.splice(Number(e.currentTarget.dataset.index) - 1, 1); this.setData({ draft }); this.refreshEditors() },
  async applyRule(e) {
    const rule = { ...clone(this.data.draft), window_days: Number(this.data.draft.window_days) }
    if (!rule.name.trim() || !Number.isInteger(rule.window_days) || rule.window_days < 0 || rule.window_days > 3650) { wx.showToast({ title: '请填写名称及0～3650天', icon: 'none' }); return }
    const mode = e.currentTarget.dataset.mode
    if (mode === 'once') { this.setData({ editing: false }); this.updateQuery({ rule }); return }
    this.setData({ busy: true })
    try {
      const saved = await principalApi.saveRule(rule, mode === 'new' ? '' : this.data.ruleId)
      const rules = await principalApi.rules()
      this.setData({ rules, ruleOptions: ['默认规则', ...rules.map(r => r.rule.name)], ruleIndex: rules.findIndex(r => r.id === saved.id) + 1, ruleId: saved.id, editing: false })
      this.updateQuery({ rule: saved.rule })
    } catch (e) { wx.showToast({ title: e.message || '保存失败', icon: 'none' }) } finally { this.setData({ busy: false }) }
  },
  removeRule() {
    if (!this.data.ruleId) return
    wx.showModal({ title: '删除规则', content: '仅删除当前账号的分析规则，不删除业务记录。', success: async res => {
      if (!res.confirm) return
      this.setData({ busy: true })
      try {
        await principalApi.deleteRule(this.data.ruleId); const rules = await principalApi.rules()
        this.setData({ rules, ruleOptions: ['默认规则', ...rules.map(r => r.rule.name)], ruleIndex: 0, ruleId: '' }); this.updateQuery({ rule: clone(INITIAL_RULE) })
      } catch (e) { wx.showToast({ title: e.message || '删除失败', icon: 'none' }) } finally { this.setData({ busy: false }) }
    } })
  },
  async exportData() {
    if (this.data.busy || this.data.loading) return
    this.setData({ busy: true })
    try {
      const buffer = await principalApi.export(this.data.query)
      const path = wx.env.USER_DATA_PATH + '/principal-' + Date.now() + '.xlsx'
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: buffer, success: resolve, fail: reject }))
      await new Promise((resolve, reject) => wx.openDocument({ filePath: path, fileType: 'xlsx', showMenu: true, success: resolve, fail: reject }))
    } catch (e) { wx.showToast({ title: e.message || '导出失败', icon: 'none' }) } finally { this.setData({ busy: false }) }
  },
})
