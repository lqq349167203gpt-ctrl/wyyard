const { customAnalysisApi } = require('../../utils/api')

const VALUELESS_OPERATORS = ['is_empty', 'is_not_empty']

function pad(value) {
  return String(value).padStart(2, '0')
}

function monthRange() {
  const now = new Date()
  return {
    date_from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    date_to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  }
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
  }, monthRange())
}

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan))
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
    metricOptions: [],
    dimensionMetricOptions: [],
    dimensionMetricIndex: 0,
    dimensionOptions: [],
    dimensionIndex: 0,
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

  syncPlanView(plan) {
    const metadata = this.data.metadata
    if (!metadata) return
    const operatorLabels = {}
    ;(metadata.operators || []).forEach(item => { operatorLabels[item.value] = item.label })
    const conditionRows = (plan.conditions || []).map((condition, index) => {
      const fieldIndex = Math.max(0, metadata.fields.findIndex(item => item.value === condition.field))
      const field = metadata.fields[fieldIndex] || metadata.fields[0]
      const operatorOptions = (field.operators || []).map(value => ({ value, label: operatorLabels[value] || value }))
      const operatorIndex = Math.max(0, operatorOptions.findIndex(item => item.value === condition.operator))
      const rawValues = Array.isArray(condition.value) ? condition.value : []
      return {
        index,
        fieldIndex,
        fieldLabel: field.label,
        operatorOptions,
        operatorIndex,
        operatorLabel: operatorOptions[operatorIndex] ? operatorOptions[operatorIndex].label : '',
        noValue: VALUELESS_OPERATORS.includes(condition.operator),
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
    this.setData({ plan, conditionRows, metricOptions, dimensionMetricOptions, dimensionMetricIndex, dimensionOptions, dimensionIndex, selectedColumns, columnOptions })
  },

  onTemplateChange(e) {
    const index = Number(e.detail.value)
    const template = this.data.templateOptions[index]
    this.setData({ templateIndex: index, result: null })
    if (!template || !template.id) return
    this.syncPlanView(clonePlan(template.plan))
    customAnalysisApi.markTemplateUsed(template.id).catch(() => {})
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

  onDatePreset(e) {
    const plan = clonePlan(this.data.plan)
    if (e.currentTarget.dataset.value === 'today') Object.assign(plan, todayRange())
    else if (e.currentTarget.dataset.value === 'week') Object.assign(plan, weekRange())
    else if (e.currentTarget.dataset.value === 'month') Object.assign(plan, monthRange())
    else { plan.date_from = ''; plan.date_to = '' }
    this.syncPlanView(plan)
  },

  onAddCondition() {
    const field = this.data.metadata && this.data.metadata.fields[0]
    if (!field) return
    const plan = clonePlan(this.data.plan)
    plan.conditions.push({ field: field.value, operator: field.operators[0] || 'eq', value: '' })
    this.syncPlanView(plan)
  },

  onRemoveCondition(e) {
    const plan = clonePlan(this.data.plan)
    plan.conditions.splice(Number(e.currentTarget.dataset.index), 1)
    this.syncPlanView(plan)
  },

  onConditionFieldChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const field = this.data.metadata.fields[Number(e.detail.value)]
    const plan = clonePlan(this.data.plan)
    const operator = field.operators[0] || 'eq'
    plan.conditions[rowIndex] = { field: field.value, operator, value: VALUELESS_OPERATORS.includes(operator) ? null : '' }
    this.syncPlanView(plan)
  },

  onConditionOperatorChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const row = this.data.conditionRows[rowIndex]
    const operator = row.operatorOptions[Number(e.detail.value)].value
    const plan = clonePlan(this.data.plan)
    plan.conditions[rowIndex].operator = operator
    plan.conditions[rowIndex].value = VALUELESS_OPERATORS.includes(operator) ? null : (operator === 'between' ? ['', ''] : '')
    this.syncPlanView(plan)
  },

  onConditionValueInput(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const part = e.currentTarget.dataset.part
    const plan = clonePlan(this.data.plan)
    if (part) {
      const values = Array.isArray(plan.conditions[rowIndex].value) ? plan.conditions[rowIndex].value : ['', '']
      values[part === 'start' ? 0 : 1] = e.detail.value
      plan.conditions[rowIndex].value = values
    } else {
      plan.conditions[rowIndex].value = e.detail.value
    }
    this.syncPlanView(plan)
  },

  onConditionOptionChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const row = this.data.conditionRows[rowIndex]
    const option = row.valueOptions[Number(e.detail.value)]
    const plan = clonePlan(this.data.plan)
    plan.conditions[rowIndex].value = option.value
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
    const incomplete = this.data.plan.conditions.some(condition => !VALUELESS_OPERATORS.includes(condition.operator) && (condition.value === '' || condition.value === null || (Array.isArray(condition.value) && condition.value.some(value => !value))))
    if (incomplete) {
      wx.showToast({ title: '请填写完整筛选条件', icon: 'none' })
      return
    }
    this.setData({ querying: true })
    try {
      const queryPlan = clonePlan(this.data.plan)
      queryPlan.conditions = queryPlan.conditions.map(condition => {
        if (condition.operator !== 'in' || typeof condition.value !== 'string') return condition
        return Object.assign({}, condition, {
          value: condition.value.split(/[,，]/).map(value => value.trim()).filter(Boolean),
        })
      })
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
      this.setData({
        result,
        metricCards: (result.cards || []).filter(card => !String(card.key).startsWith('dimension-')),
        dimensionCards: (result.cards || []).filter(card => String(card.key).startsWith('dimension-')),
        dimensionResultTitle: `${dimensionMetric ? dimensionMetric.label : '符合条件人数'} · 按${dimension ? dimension.label : '分组'}拆分`,
        resultItems,
        resultColumns: result.plan.columns,
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
