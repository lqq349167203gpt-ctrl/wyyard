const { customAnalysisApi } = require('../../utils/api')

const VALUELESS_OPERATORS = ['is_empty', 'is_not_empty']

function pad(value) {
  return String(value).padStart(2, '0')
}

function monthRange() {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return {
    date_from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    date_to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`,
  }
}

function selectedMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    date_from: `${year}-${pad(month)}-01`,
    date_to: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

function yearRange(year) {
  return { date_from: `${year}-01-01`, date_to: `${year}-12-31` }
}

const currentYear = new Date().getFullYear()
const periodYears = Array.from({ length: 10 }, (_, index) => currentYear + 1 - index)
const periodParts = ['全年'].concat(Array.from({ length: 12 }, (_, index) => `${index + 1}月`))

function periodSelection(plan) {
  const from = plan.date_from || ''
  const to = plan.date_to || ''
  const year = Number(from.slice(0, 4))
  const yearIndex = periodYears.indexOf(year)
  if (yearIndex >= 0 && from === `${year}-01-01` && to === `${year}-12-31`) {
    return { value: [yearIndex, 0], label: `${year}年全年` }
  }
  const month = Number(from.slice(5, 7))
  const monthRangeValue = year && month ? selectedMonthRange(year, month) : null
  if (yearIndex >= 0 && monthRangeValue && from === monthRangeValue.date_from && to === monthRangeValue.date_to) {
    return { value: [yearIndex, month], label: `${year}年${month}月` }
  }
  return {
    value: [Math.max(0, periodYears.indexOf(currentYear)), new Date().getMonth() + 1],
    label: from || to ? '自定义日期' : '全部时间',
  }
}

function periodSummary(plan) {
  if (plan.date_from && plan.date_to) return `${plan.date_from} 至 ${plan.date_to}`
  if (plan.date_from) return `${plan.date_from} 起`
  if (plan.date_to) return `截至 ${plan.date_to}`
  return '全部时间'
}

function weekRange() {
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  return {
    date_from: `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`,
    date_to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  }
}

function todayRange() {
  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return { date_from: today, date_to: today }
}

function defaultPlan() {
  return Object.assign({
    title: '自定义筛选结果',
    total_card_title: '符合条件人数',
    conditions: [],
    condition_logic: 'all',
    metrics: ['total_customers'],
    card_metric: 'total_customers',
    card_dimension: 'none',
    columns: ['nickname', 'member_type', 'follow_up_status', 'referrer', 'visit_count_period', 'payment_amount_period'],
    sort_by: 'referral_date',
    sort_order: 'desc',
    analysis_mode: 'single',
    comparison_groups: [],
  }, monthRange())
}

function clonePlan(plan) {
  const next = JSON.parse(JSON.stringify(plan || defaultPlan()))
  next.analysis_mode = next.analysis_mode || 'single'
  next.comparison_groups = next.comparison_groups || []
  next.comparison_groups.forEach(group => {
    if (!group.id) group.id = comparisonGroupId()
  })
  return next
}

function comparisonGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createComparisonGroup(name, source) {
  const period = source ? { date_from: source.date_from || '', date_to: source.date_to || '' } : monthRange()
  return Object.assign({
    id: comparisonGroupId(),
    name,
    conditions: source ? JSON.parse(JSON.stringify(source.conditions || [])) : [],
    condition_logic: source ? source.condition_logic || 'all' : 'all',
  }, period)
}

function formatMetricValue(value, format, unit, signed) {
  const amount = Number(value || 0)
  const prefix = amount < 0 ? '-' : (signed && amount > 0 ? '+' : '')
  const formatted = Math.abs(amount).toLocaleString()
  if (format === 'currency') return `${prefix}¥${formatted}`
  return `${prefix}${formatted}${unit || ''}`
}

function displayValue(field, value) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '—'
  if (field === 'total_consumption' || field === 'payment_amount_period') return `¥${Number(value || 0).toLocaleString()}`
  if (['invitation_count', 'visit_count', 'communication_count', 'invitation_count_period', 'visit_count_period', 'cancelled_count_period'].includes(field)) return `${value}次`
  if (['activity_count', 'activity_count_period'].includes(field)) return `${value}场`
  if (field === 'payment_count_period') return `${value}单`
  return Array.isArray(value) ? value.join('、') : String(value)
}

Page({
  data: {
    loading: true,
    querying: false,
    metadata: null,
    plan: defaultPlan(),
    fieldOptions: [],
    conditionRows: [],
    comparisonGroupRows: [],
    metricOptions: [],
    dimensionMetricOptions: [],
    dimensionMetricIndex: 0,
    dimensionOptions: [],
    dimensionIndex: 0,
    periodRange: [periodYears.map(year => `${year}年`), periodParts],
    periodValue: [Math.max(0, periodYears.indexOf(currentYear)), new Date().getMonth() + 1],
    periodLabel: '',
    templateOptions: [{ id: '', name: '选择已保存模板' }],
    templateIndex: 0,
    showSaveTemplate: false,
    templateName: '',
    templateDescription: '',
    templateScope: 'private',
    savingTemplate: false,
    selectedColumns: [],
    columnOptions: [],
    showColumnPicker: false,
    result: null,
    metricCards: [],
    dimensionCards: [],
    dimensionResultTitle: '分组结果',
    resultItems: [],
    resultColumns: [],
    comparisonResultGroups: [],
    comparisonResultRows: [],
  },

  async onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('custom-analysis')) {
      wx.showToast({ title: '暂无自定义筛选权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    if (getApp().trackUsagePage) getApp().trackUsagePage('/pages/custom-analysis/index')
    await this.loadBaseData()
  },

  async onPullDownRefresh() {
    await this.loadBaseData()
    wx.stopPullDownRefresh()
  },

  async loadBaseData() {
    this.setData({ loading: true })
    try {
      const values = await Promise.all([customAnalysisApi.metadata(), customAnalysisApi.listTemplates()])
      const metadata = values[0]
      const templates = values[1] || []
      this.setData({
        metadata,
        fieldOptions: metadata.fields || [],
        templateOptions: [{ id: '', name: '选择已保存模板' }].concat(templates),
        templateIndex: 0,
        loading: false,
      })
      this.syncPlanView(this.data.plan)
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  buildConditionRows(conditions, owner) {
    const metadata = this.data.metadata
    const operatorLabels = {}
    ;(metadata.operators || []).forEach(item => { operatorLabels[item.value] = item.label })
    return (conditions || []).map((condition, index) => {
      const fieldIndex = Math.max(0, metadata.fields.findIndex(item => item.value === condition.field))
      const field = metadata.fields[fieldIndex] || metadata.fields[0]
      const operatorOptions = (field.operators || []).map(value => ({ value, label: operatorLabels[value] || value }))
      const operatorIndex = Math.max(0, operatorOptions.findIndex(item => item.value === condition.operator))
      const rawValues = Array.isArray(condition.value) ? condition.value : []
      const isDate = field.value_type === 'date'
      return {
        index,
        fieldIndex,
        fieldLabel: field.label,
        operatorOptions,
        operatorIndex,
        operatorLabel: operatorOptions[operatorIndex] ? operatorOptions[operatorIndex].label : '',
        noValue: VALUELESS_OPERATORS.includes(condition.operator),
        isDate,
        inheritPeriod: !!condition.inherit_period,
        periodSummary: periodSummary(owner),
        between: condition.operator === 'between',
        valueStart: rawValues[0] || '',
        valueEnd: rawValues[1] || '',
        value: Array.isArray(condition.value) ? condition.value.join('，') : (condition.value === null ? '' : condition.value),
        useOptions: !!(field.options && field.options.length && condition.operator !== 'in' && condition.operator !== 'between'),
        valueOptions: (field.options || []).map(value => ({ value, label: value })),
        valueIndex: Math.max(0, (field.options || []).indexOf(String(condition.value || ''))),
        placeholder: condition.operator === 'in' ? '多个值用逗号分隔' : '输入筛选值',
      }
    })
  },

  syncPlanView(inputPlan) {
    const metadata = this.data.metadata
    if (!metadata) return
    const plan = clonePlan(inputPlan)
    const conditionRows = this.buildConditionRows(plan.conditions, plan)
    const comparisonGroupRows = (plan.comparison_groups || []).map((group, index) => {
      const selectedPeriod = periodSelection(group)
      return Object.assign({}, group, {
        index,
        badge: String.fromCharCode(65 + index),
        periodValue: selectedPeriod.value,
        periodLabel: selectedPeriod.label,
        periodSummary: periodSummary(group),
        conditionRows: this.buildConditionRows(group.conditions, group),
      })
    })
    const cardMetric = plan.card_metric || 'total_customers'
    plan.card_metric = cardMetric
    const metricOptions = (metadata.metrics || []).map(item => Object.assign({}, item, { selected: plan.metrics.includes(item.value) }))
    const dimensionMetricOptions = metadata.metrics || []
    const dimensionMetricIndex = Math.max(0, dimensionMetricOptions.findIndex(item => item.value === cardMetric))
    const dimensionOptions = metadata.card_dimensions || []
    const dimensionIndex = Math.max(0, dimensionOptions.findIndex(item => item.value === plan.card_dimension))
    const selectedColumns = plan.columns.map(value => {
      const field = metadata.fields.find(item => item.value === value)
      return { value, label: field ? field.label : value }
    })
    const columnOptions = metadata.fields.map(item => Object.assign({}, item, { selected: plan.columns.includes(item.value), locked: item.value === 'nickname' }))
    const selectedPeriod = periodSelection(plan)
    this.setData({
      plan,
      conditionRows,
      comparisonGroupRows,
      metricOptions,
      dimensionMetricOptions,
      dimensionMetricIndex,
      dimensionOptions,
      dimensionIndex,
      selectedColumns,
      columnOptions,
      periodValue: selectedPeriod.value,
      periodLabel: selectedPeriod.label,
    })
  },

  onTemplateChange(e) {
    const index = Number(e.detail.value)
    const template = this.data.templateOptions[index]
    this.setData({ templateIndex: index, result: null })
    if (!template || !template.id) return
    this.syncPlanView(clonePlan(template.plan))
    customAnalysisApi.markTemplateUsed(template.id).catch(() => {})
  },

  onAnalysisModeTap(e) {
    const mode = e.currentTarget.dataset.value
    const plan = clonePlan(this.data.plan)
    plan.analysis_mode = mode
    if (mode === 'comparison' && plan.comparison_groups.length < 2) {
      const source = {
        conditions: plan.conditions,
        condition_logic: plan.condition_logic,
        date_from: plan.date_from,
        date_to: plan.date_to,
      }
      plan.comparison_groups = [createComparisonGroup('对比组 A', source), createComparisonGroup('对比组 B', source)]
    }
    this.setData({ result: null })
    this.syncPlanView(plan)
  },

  onComparisonNameInput(e) {
    const plan = clonePlan(this.data.plan)
    plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)].name = e.detail.value
    this.syncPlanView(plan)
  },

  onCopyComparisonGroup(e) {
    const plan = clonePlan(this.data.plan)
    if (plan.comparison_groups.length >= 4) return
    const source = plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)]
    plan.comparison_groups.push(createComparisonGroup(`对比组 ${String.fromCharCode(65 + plan.comparison_groups.length)}`, source))
    this.syncPlanView(plan)
  },

  onAddComparisonGroup() {
    const plan = clonePlan(this.data.plan)
    if (plan.comparison_groups.length >= 4) return
    const source = plan.comparison_groups[plan.comparison_groups.length - 1]
    plan.comparison_groups.push(createComparisonGroup(`对比组 ${String.fromCharCode(65 + plan.comparison_groups.length)}`, source))
    this.syncPlanView(plan)
  },

  onRemoveComparisonGroup(e) {
    const plan = clonePlan(this.data.plan)
    if (plan.comparison_groups.length <= 2) return
    plan.comparison_groups.splice(Number(e.currentTarget.dataset.groupIndex), 1)
    this.syncPlanView(plan)
  },

  onComparisonPeriodChange(e) {
    const values = e.detail.value.map(Number)
    const year = periodYears[values[0]]
    const part = values[1]
    const plan = clonePlan(this.data.plan)
    Object.assign(plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)], part === 0 ? yearRange(year) : selectedMonthRange(year, part))
    this.syncPlanView(plan)
  },

  onComparisonDateChange(e) {
    const plan = clonePlan(this.data.plan)
    const group = plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)]
    group[e.currentTarget.dataset.part === 'from' ? 'date_from' : 'date_to'] = e.detail.value
    this.syncPlanView(plan)
  },

  onComparisonDatePreset(e) {
    const plan = clonePlan(this.data.plan)
    const group = plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)]
    const value = e.currentTarget.dataset.value
    if (value === 'month') Object.assign(group, monthRange())
    else if (value === 'year') Object.assign(group, yearRange(currentYear))
    else { group.date_from = ''; group.date_to = '' }
    this.syncPlanView(plan)
  },

  onComparisonLogicTap(e) {
    const plan = clonePlan(this.data.plan)
    plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)].condition_logic = e.currentTarget.dataset.value
    this.syncPlanView(plan)
  },

  onComparisonAddCondition(e) {
    const field = this.data.metadata && this.data.metadata.fields[0]
    if (!field) return
    const plan = clonePlan(this.data.plan)
    plan.comparison_groups[Number(e.currentTarget.dataset.groupIndex)].conditions.push({ field: field.value, operator: field.operators[0] || 'eq', value: '', inherit_period: false })
    this.syncPlanView(plan)
  },

  conditionOwner(plan, dataset) {
    if (dataset.groupIndex === undefined) return plan
    return plan.comparison_groups[Number(dataset.groupIndex)]
  },

  conditionRow(dataset) {
    if (dataset.groupIndex === undefined) return this.data.conditionRows[Number(dataset.index)]
    const group = this.data.comparisonGroupRows[Number(dataset.groupIndex)]
    return group && group.conditionRows[Number(dataset.index)]
  },

  onLogicTap(e) {
    const plan = clonePlan(this.data.plan)
    plan.condition_logic = e.currentTarget.dataset.value
    this.syncPlanView(plan)
  },

  onDateFromChange(e) {
    const plan = clonePlan(this.data.plan)
    plan.date_from = e.detail.value
    this.syncPlanView(plan)
  },

  onDateToChange(e) {
    const plan = clonePlan(this.data.plan)
    plan.date_to = e.detail.value
    this.syncPlanView(plan)
  },

  onPeriodChange(e) {
    const values = e.detail.value.map(Number)
    const year = periodYears[values[0]]
    const part = values[1]
    const plan = clonePlan(this.data.plan)
    Object.assign(plan, part === 0 ? yearRange(year) : selectedMonthRange(year, part))
    this.syncPlanView(plan)
  },

  onDatePreset(e) {
    const plan = clonePlan(this.data.plan)
    if (e.currentTarget.dataset.value === 'today') Object.assign(plan, todayRange())
    else if (e.currentTarget.dataset.value === 'week') Object.assign(plan, weekRange())
    else if (e.currentTarget.dataset.value === 'month') Object.assign(plan, monthRange())
    else if (e.currentTarget.dataset.value === 'year') Object.assign(plan, yearRange(currentYear))
    else { plan.date_from = ''; plan.date_to = '' }
    this.syncPlanView(plan)
  },

  onAddCondition() {
    const field = this.data.metadata && this.data.metadata.fields[0]
    if (!field) return
    const plan = clonePlan(this.data.plan)
    plan.conditions.push({ field: field.value, operator: field.operators[0] || 'eq', value: '', inherit_period: false })
    this.syncPlanView(plan)
  },

  onRemoveCondition(e) {
    const plan = clonePlan(this.data.plan)
    this.conditionOwner(plan, e.currentTarget.dataset).conditions.splice(Number(e.currentTarget.dataset.index), 1)
    this.syncPlanView(plan)
  },

  onConditionFieldChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const field = this.data.metadata.fields[Number(e.detail.value)]
    const plan = clonePlan(this.data.plan)
    const operator = field.operators[0] || 'eq'
    this.conditionOwner(plan, e.currentTarget.dataset).conditions[rowIndex] = { field: field.value, operator, value: VALUELESS_OPERATORS.includes(operator) ? null : '', inherit_period: false }
    this.syncPlanView(plan)
  },

  onConditionOperatorChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const row = this.conditionRow(e.currentTarget.dataset)
    const operator = row.operatorOptions[Number(e.detail.value)].value
    const plan = clonePlan(this.data.plan)
    const condition = this.conditionOwner(plan, e.currentTarget.dataset).conditions[rowIndex]
    condition.operator = operator
    condition.value = VALUELESS_OPERATORS.includes(operator) ? null : (operator === 'between' ? ['', ''] : '')
    condition.inherit_period = false
    this.syncPlanView(plan)
  },

  onConditionValueInput(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const part = e.currentTarget.dataset.part
    const plan = clonePlan(this.data.plan)
    const condition = this.conditionOwner(plan, e.currentTarget.dataset).conditions[rowIndex]
    if (part) {
      const values = Array.isArray(condition.value) ? condition.value : ['', '']
      values[part === 'start' ? 0 : 1] = e.detail.value
      condition.value = values
    } else {
      condition.value = e.detail.value
    }
    condition.inherit_period = false
    this.syncPlanView(plan)
  },

  onConditionOptionChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const row = this.conditionRow(e.currentTarget.dataset)
    const option = row.valueOptions[Number(e.detail.value)]
    const plan = clonePlan(this.data.plan)
    const condition = this.conditionOwner(plan, e.currentTarget.dataset).conditions[rowIndex]
    condition.value = option.value
    condition.inherit_period = false
    this.syncPlanView(plan)
  },

  onConditionInheritPeriod(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const plan = clonePlan(this.data.plan)
    const condition = this.conditionOwner(plan, e.currentTarget.dataset).conditions[rowIndex]
    condition.inherit_period = true
    condition.operator = 'between'
    condition.value = null
    this.syncPlanView(plan)
  },

  onConditionUseOwnDate(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const plan = clonePlan(this.data.plan)
    const owner = this.conditionOwner(plan, e.currentTarget.dataset)
    owner.conditions[rowIndex].inherit_period = false
    owner.conditions[rowIndex].operator = 'between'
    owner.conditions[rowIndex].value = [owner.date_from || '', owner.date_to || '']
    this.syncPlanView(plan)
  },

  onMetricTap(e) {
    const value = e.currentTarget.dataset.value
    const plan = clonePlan(this.data.plan)
    if (plan.metrics.includes(value)) {
      if (plan.metrics.length === 1) return
      plan.metrics = plan.metrics.filter(item => item !== value)
    } else {
      plan.metrics.push(value)
    }
    this.syncPlanView(plan)
  },

  onDimensionChange(e) {
    const plan = clonePlan(this.data.plan)
    plan.card_dimension = this.data.dimensionOptions[Number(e.detail.value)].value
    this.syncPlanView(plan)
  },

  onDimensionMetricChange(e) {
    const plan = clonePlan(this.data.plan)
    plan.card_metric = this.data.dimensionMetricOptions[Number(e.detail.value)].value
    this.syncPlanView(plan)
  },

  onOpenColumns() {
    this.setData({ showColumnPicker: true })
  },

  onCloseColumns() {
    this.setData({ showColumnPicker: false })
  },

  onColumnToggle(e) {
    const value = e.currentTarget.dataset.value
    if (value === 'nickname') return
    const plan = clonePlan(this.data.plan)
    if (plan.columns.includes(value)) plan.columns = plan.columns.filter(item => item !== value)
    else if (plan.columns.length < 10) plan.columns.push(value)
    else {
      wx.showToast({ title: '最多选择10列', icon: 'none' })
      return
    }
    this.syncPlanView(plan)
  },

  onSaveTemplate() {
    if (this.data.plan.analysis_mode === 'comparison' && this.data.plan.comparison_groups.some(group => !(group.name || '').trim())) {
      wx.showToast({ title: '请填写对比组名称', icon: 'none' })
      return
    }
    this.setData({
      showSaveTemplate: true,
      templateName: '',
      templateDescription: '',
      templateScope: 'private',
    })
  },

  onTemplateNameInput(e) {
    this.setData({ templateName: e.detail.value })
  },

  onTemplateDescriptionInput(e) {
    this.setData({ templateDescription: e.detail.value })
  },

  onTemplateScopeTap(e) {
    this.setData({ templateScope: e.currentTarget.dataset.scope })
  },

  onCloseSaveTemplate() {
    if (this.data.savingTemplate) return
    this.setData({ showSaveTemplate: false })
  },

  onSaveTemplateMaskTap() {
    this.onCloseSaveTemplate()
  },

  stopPropagation() {},

  async onConfirmSaveTemplate() {
    const name = (this.data.templateName || '').trim()
    const description = (this.data.templateDescription || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入模板名称', icon: 'none' })
      return
    }
    if (this.data.savingTemplate) return
    this.setData({ savingTemplate: true })
    try {
      const template = await customAnalysisApi.createTemplate({
        name,
        description,
        scope: this.data.templateScope,
        plan: this.data.plan,
      })
      const options = this.data.templateOptions.concat(template)
      this.setData({
        templateOptions: options,
        templateIndex: options.length - 1,
        showSaveTemplate: false,
        templateName: '',
        templateDescription: '',
        savingTemplate: false,
      })
      wx.showToast({ title: '模板已保存', icon: 'success' })
    } catch (e) {
      this.setData({ savingTemplate: false })
    }
  },

  onReset() {
    this.setData({ result: null, templateIndex: 0 })
    this.syncPlanView(defaultPlan())
  },

  onQuery() {
    this.execute(1)
  },

  async execute(page) {
    const plan = this.data.plan
    if (plan.analysis_mode === 'comparison' && plan.comparison_groups.some(group => !(group.name || '').trim())) {
      wx.showToast({ title: '请填写对比组名称', icon: 'none' })
      return
    }
    const conditionGroups = plan.analysis_mode === 'comparison'
      ? plan.comparison_groups.map(group => group.conditions || [])
      : [plan.conditions || []]
    const incomplete = conditionGroups.some(conditions => conditions.some(condition => !condition.inherit_period && !VALUELESS_OPERATORS.includes(condition.operator) && (condition.value === '' || condition.value === null || (Array.isArray(condition.value) && condition.value.some(value => !value)))))
    if (incomplete) {
      wx.showToast({ title: '请填写完整筛选条件', icon: 'none' })
      return
    }
    this.setData({ querying: true })
    try {
      const queryPlan = clonePlan(this.data.plan)
      const normalizeConditions = conditions => conditions.map(condition => {
        if (condition.operator !== 'in' || typeof condition.value !== 'string') return condition
        return Object.assign({}, condition, {
          value: condition.value.split(/[,，]/).map(value => value.trim()).filter(Boolean),
        })
      })
      queryPlan.conditions = normalizeConditions(queryPlan.conditions)
      queryPlan.comparison_groups = queryPlan.comparison_groups.map(group => Object.assign({}, group, {
        conditions: normalizeConditions(group.conditions || []),
      }))
      const result = await customAnalysisApi.execute(queryPlan, page, 20)
      const fieldMap = {}
      this.data.metadata.fields.forEach(field => { fieldMap[field.value] = field.label })
      const resultItems = (result.items || []).map(item => ({
        id: item.id,
        nickname: item.nickname || '未命名',
        fields: result.plan.columns.filter(field => field !== 'nickname').map(field => ({ label: fieldMap[field] || field, value: displayValue(field, item[field]) })),
      }))
      const dimensionMetric = (this.data.metadata.metrics || []).find(item => item.value === result.plan.card_metric)
      const dimension = (this.data.metadata.card_dimensions || []).find(item => item.value === result.plan.card_dimension)
      const comparisonResultGroups = (result.comparison_groups || []).map((group, index) => Object.assign({}, group, {
        badge: String.fromCharCode(65 + index),
        periodSummary: periodSummary(group),
      }))
      const comparisonResultRows = (result.comparison_rows || []).map(row => Object.assign({}, row, {
        valuesView: (row.values || []).map((value, index) => ({
          name: comparisonResultGroups[index] ? comparisonResultGroups[index].name : `对比组 ${index + 1}`,
          value: formatMetricValue(value, row.format, row.unit, false),
        })),
        differenceView: row.difference === null ? '—' : formatMetricValue(row.difference, row.format, row.unit, true),
        differenceRateView: row.difference_rate === null ? '基准为 0' : `${row.difference_rate > 0 ? '+' : ''}${row.difference_rate}%`,
        differenceTone: row.difference > 0 ? 'positive' : (row.difference < 0 ? 'negative' : ''),
      }))
      this.setData({
        result,
        metricCards: (result.cards || []).filter(card => !String(card.key).startsWith('dimension-')),
        dimensionCards: (result.cards || []).filter(card => String(card.key).startsWith('dimension-')),
        dimensionResultTitle: `${dimensionMetric ? dimensionMetric.label : '符合条件人数'} · 按${dimension ? dimension.label : '分组'}拆分`,
        resultItems,
        resultColumns: result.plan.columns,
        comparisonResultGroups,
        comparisonResultRows,
        querying: false,
      })
      this.syncPlanView(result.plan)
    } catch (e) {
      this.setData({ querying: false })
    }
  },

  onPrevPage() {
    if (this.data.result && this.data.result.page > 1) this.execute(this.data.result.page - 1)
  },

  onNextPage() {
    if (this.data.result && this.data.result.page < this.data.result.total_pages) this.execute(this.data.result.page + 1)
  },

  onCustomerTap(e) {
    wx.navigateTo({ url: `/pages/customer-profile/index?id=${e.currentTarget.dataset.id}` })
  },
})
