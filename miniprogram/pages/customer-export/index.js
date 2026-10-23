const { customerApi, memberIdentityApi, downloadFile } = require('../../utils/api')
const { customerReferrers } = require('../../utils/customer-referrers')
const { dateRange } = require('../../utils/customer-export')

const fields = [
  ['member_types', '会员身份'], ['card_statuses', '卡次状态'], ['service_teachers', 'Sales'],
  ['referrers', '引流人'], ['referrer_handlers', '承接人'],
]
const unique = values => [...new Set(values.map(value => (value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))

Page({
  data: {
    hasPagePermission: true, loading: true, exporting: false, error: '', mode: 'all',
    rangeModes: [{ key: 'all', label: '全部' }, { key: 'day', label: '按天' }, { key: 'month', label: '按月' }, { key: 'year', label: '按年' }, { key: 'custom', label: '自选' }],
    day: '', month: '', year: '', dateFrom: '', dateTo: '',
    filters: { member_types: [], card_statuses: [], service_teachers: [], referrers: [], referrer_handlers: [] },
    filterGroups: [], expandedFilter: '', columns: [], columnGroups: [], selectedColumns: [],
  },

  onLoad(query) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('healing-records')) { this.setData({ hasPagePermission: false, loading: false }); return }
    const now = new Date()
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    let filters = this.data.filters
    try {
      const initial = JSON.parse(decodeURIComponent(query.filters || '{}'))
      this._workspaceScope = initial.workspace ? { workspace: initial.workspace, workspace_owner: initial.workspace_owner, handoff_status: initial.handoff_status || 'pending' } : {}
      filters = Object.fromEntries(fields.map(([key]) => [key, Array.isArray(initial[key]) ? initial[key].filter(value => typeof value === 'string') : []]))
    } catch (error) { /* 无有效初始条件时使用全部 */ }
    this.setData({ day: today, month: today.slice(0, 7), year: today.slice(0, 4), dateFrom: today.slice(0, 7) + '-01', dateTo: today, filters })
    return this.loadOptions()
  },

  onUnload() { this._sequence = (this._sequence || 0) + 1 },

  async loadOptions() {
    const sequence = this._sequence = (this._sequence || 0) + 1
    this.setData({ loading: true, error: '' })
    try {
      const [customers, identities, columns, saved] = await Promise.all([customerApi.selector(this._workspaceScope), memberIdentityApi.list('all'), customerApi.exportOptions(), customerApi.exportPreferences()])
      if (sequence !== this._sequence) return
      if (saved.columns) this.setData({ filters: Object.fromEntries(fields.map(([key]) => [key, saved[key] || []])),
        mode: saved.date_from || saved.date_to ? 'custom' : 'all', dateFrom: saved.date_from || '', dateTo: saved.date_to || '' })
      const values = {
        member_types: unique([...identities.filter(item => item.group !== 'card_status').map(item => item.name), ...customers.map(item => item.member_type)]),
        card_statuses: unique([...identities.filter(item => item.group === 'card_status').map(item => item.name), ...customers.map(item => item.card_status)]),
        service_teachers: unique(customers.map(item => item.service_teacher)),
        referrers: unique(customers.flatMap(customerReferrers)),
        referrer_handlers: unique(customers.map(item => item.referrer_handler)),
      }
      this.setData({ columns, selectedColumns: columns.filter(column => column.default).map(column => column.key),
        filterGroups: fields.map(([key, title]) => ({ key, title, options: values[key].map(name => ({ name, selected: this.data.filters[key].includes(name) })) })) })
      this.updateColumns()
    } catch (error) {
      if (sequence === this._sequence) this.setData({ error: error.message || '导出选项加载失败，请重试' })
    } finally { if (sequence === this._sequence) this.setData({ loading: false }) }
  },

  onModeChange(event) { if (!this.data.exporting) this.setData({ mode: event.currentTarget.dataset.key, error: '' }) },
  onDateChange(event) {
    if (this.data.exporting) return
    const key = event.currentTarget.dataset.key
    if (['day', 'month', 'year', 'dateFrom', 'dateTo'].includes(key)) this.setData({ [key]: event.detail.value, error: '' })
  },
  onFilterExpand(event) {
    const key = event.currentTarget.dataset.key
    if (!this.data.exporting) this.setData({ expandedFilter: this.data.expandedFilter === key ? '' : key })
  },
  onFilterChange(event) {
    if (this.data.exporting) return
    const { key, name } = event.currentTarget.dataset
    const selected = this.data.filters[key] || []
    const next = selected.includes(name) ? selected.filter(value => value !== name) : [...selected, name]
    this.setData({ ['filters.' + key]: next, filterGroups: this.data.filterGroups.map(group => group.key !== key ? group : {
      ...group, options: group.options.map(option => ({ ...option, selected: next.includes(option.name) })),
    }) })
  },
  onFilterClear(event) {
    if (this.data.exporting) return
    const key = event.currentTarget.dataset.key
    this.setData({ ['filters.' + key]: [], filterGroups: this.data.filterGroups.map(group => group.key !== key ? group : {
      ...group, options: group.options.map(option => ({ ...option, selected: false })),
    }) })
  },
  updateColumns() {
    const groups = [...new Set(this.data.columns.map(column => column.group))]
    this.setData({ columnGroups: groups.map(title => ({ title,
      expanded: this.data.columnGroups.some(group => group.title === title)
        ? this.data.columnGroups.find(group => group.title === title).expanded : title === '基础资料',
      columns: this.data.columns.filter(column => column.group === title).map(column => ({ ...column, selected: this.data.selectedColumns.includes(column.key) })),
      count: this.data.columns.filter(column => column.group === title && this.data.selectedColumns.includes(column.key)).length,
    })) })
  },
  onGroupExpand(event) {
    if (this.data.exporting) return
    const title = event.currentTarget.dataset.title
    this.setData({ columnGroups: this.data.columnGroups.map(group => group.title === title ? { ...group, expanded: !group.expanded } : group) })
  },
  onColumnsChange(event) {
    if (this.data.exporting) return
    const title = event.currentTarget.dataset.title
    const otherKeys = this.data.selectedColumns.filter(key => this.data.columns.find(column => column.key === key)?.group !== title)
    this.setData({ selectedColumns: [...otherKeys, ...event.detail.value], error: '' })
    this.updateColumns()
  },
  onColumnsAll(event) {
    if (this.data.exporting) return
    this.setData({ selectedColumns: event.currentTarget.dataset.mode === 'all' ? this.data.columns.map(column => column.key) : [] })
    this.updateColumns()
  },
  onGroupColumnsAll(event) {
    if (this.data.exporting) return
    const { title, mode } = event.currentTarget.dataset
    const keys = this.data.columns.filter(column => column.group === title).map(column => column.key)
    const selectedColumns = mode === 'all'
      ? [...new Set([...this.data.selectedColumns, ...keys])]
      : this.data.selectedColumns.filter(key => !keys.includes(key))
    this.setData({ selectedColumns, error: '' })
    this.updateColumns()
  },
  async onExport() {
    if (this.data.exporting || this.data.loading || !this.data.columns.length) return
    if (!this.data.selectedColumns.length) { this.setData({ error: '请至少勾选一项导出信息' }); return }
    const range = dateRange(this.data.mode, this.data)
    if (this.data.mode !== 'all' && (!range.date_from || !range.date_to || range.date_from > range.date_to)) {
      this.setData({ error: '请选择正确的引流日期范围' }); return
    }
    this.setData({ exporting: true, error: '' })
    try {
      const columns = this.data.columns.filter(column => this.data.selectedColumns.includes(column.key)).map(column => column.key)
      const url = customerApi.export({ ...this.data.filters, ...this._workspaceScope, ...range, columns })
      const filePath = await downloadFile(url, '客户资料_' + this.data.day + '.xlsx')
      await new Promise((resolve, reject) => wx.openDocument({ filePath, fileType: 'xlsx', showMenu: true, success: resolve, fail: reject }))
    } catch (error) { this.setData({ error: error.message || error.errMsg || '导出失败，请重试' }) }
    finally { this.setData({ exporting: false }) }
  },
})
