const { clientApi } = require('../../utils/api')

const SOURCE_LABELS = {
  manual: '人工销卡',
  activity: '沙龙活动扣卡',
  project_activity: '项目扣卡',
}

const TYPE_LABELS = {
  'membership-cards': '会员卡',
  'group-cases': '觉醒游戏',
  'emotional-releases': '情绪释放',
  'oh-card-readings': 'OH卡诊断',
  'energy-knots': '能量结',
  'internal-courses': '内部课程',
  'other-projects': '其他项目',
}

function formatCount(value) {
  if (value === '不限') return '不限次'
  return `${value === undefined || value === null ? 0 : value}次`
}

function formatValidity(effectiveDate, expiryDate) {
  const effective = effectiveDate || ''
  const expiry = expiryDate || ''
  if (effective && expiry) return `${effective} ~ ${expiry}`
  if (expiry) return `有效期至 ${expiry}`
  if (effective) return `${effective} 起长期有效`
  return '长期有效'
}

function normalizePurchaseItem(item, key) {
  const currentRemaining = item.current_remaining !== undefined && item.current_remaining !== null
    ? item.current_remaining
    : (item.effective_remaining !== undefined && item.effective_remaining !== null
      ? item.effective_remaining
      : item.remaining)
  const currentTotal = item.current_total !== undefined && item.current_total !== null
    ? item.current_total
    : (item.grand_total !== undefined && item.grand_total !== null
      ? item.grand_total
      : item.total_purchased)

  return Object.assign({}, item, {
    _key: key,
    _isOfflineCourse: item.type === '线下落地课程',
    _currentRemainingText: formatCount(currentRemaining),
    _currentTotalText: formatCount(currentTotal),
    _attendedCount: item.attended_count || 0,
    _debtCount: item.debt_count || 0,
    _debtActivities: item.debt_activities || [],
    _validityText: formatValidity(item.effective_date, item.expiry_date),
    _cardItems: [],
  })
}

function legacyProjectsToPurchaseSummary(projects) {
  return projects.map(project => {
    const remaining = project.remaining === '不限次' ? '不限' : project.remaining
    const total = project.total === '不限次' ? '不限' : project.total
    const isActive = project.status === 'active'
    return {
      _legacy: true,
      type: project.type,
      name: project.name,
      remaining,
      total_purchased: total,
      current_remaining: isActive ? remaining : 0,
      current_total: isActive ? total : 0,
      effective_date: project.effective_date || '',
      expiry_date: project.expiry_date || '',
      voided: false,
      debt_count: 0,
      debt_activities: [],
    }
  })
}

function buildPurchaseSummary(items) {
  const memberItems = items.filter(item => item.type === '会员卡')
  const result = []

  if (memberItems.length > 0) {
    let memberSource = memberItems[0]
    if (memberItems.every(item => item._legacy)) {
      const activeItems = memberItems.filter(item => item.current_total !== 0)
      const hasUnlimited = activeItems.some(item => item.current_remaining === '不限')
      memberSource = Object.assign({}, memberItems[0], {
        current_remaining: hasUnlimited
          ? '不限'
          : activeItems.reduce((sum, item) => sum + (Number(item.current_remaining) || 0), 0),
        current_total: hasUnlimited
          ? '不限'
          : activeItems.reduce((sum, item) => sum + (Number(item.current_total) || 0), 0),
      })
    }
    const memberSummary = normalizePurchaseItem(memberSource, 'membership-card')
    memberSummary.name = ''
    memberSummary._cardItems = memberItems
      .filter(item => item.name || item.effective_date || item.expiry_date)
      .map((item, index) => Object.assign({}, item, {
        _key: item.name ? `${item.name}-${index}` : `membership-card-${index}`,
        _validityText: formatValidity(item.effective_date, item.expiry_date),
        _countText: item.voided
          ? '已退费'
          : (item.remaining === '不限'
            ? '不限次'
            : `${item.remaining === undefined || item.remaining === null ? 0 : item.remaining} / ${item.total_purchased || 0}`),
      }))
    result.push(memberSummary)
  }

  items
    .filter(item => item.type !== '会员卡')
    .forEach((item, index) => result.push(normalizePurchaseItem(item, `${item.type}-${index}`)))

  return result
}

Page({
  data: {
    items: [],
    groups: [],
    purchaseSummary: [],
    loading: true,
  },

  onShow() {
    this.loadDeductions()
  },

  async loadDeductions() {
    this.setData({
      loading: true,
      items: [],
      groups: [],
      purchaseSummary: [],
    })
    try {
      const res = await clientApi.getDeductions()
      const purchaseItems = Array.isArray(res.purchase_summary) && res.purchase_summary.length > 0
        ? res.purchase_summary
        : legacyProjectsToPurchaseSummary(res.projects || [])
      const purchaseSummary = buildPurchaseSummary(purchaseItems)
      const items = (res.items || []).map(d => {
        const projectActivityTypeText = d.source === 'project_activity'
          ? (TYPE_LABELS[d.project_type] || d.project_type)
          : ''
        const isManual = d.source === 'manual'
        const isProject = d.source === 'project_activity'
        return {
          ...d,
          tag_text: isManual
            ? SOURCE_LABELS.manual
            : (isProject ? `${projectActivityTypeText}扣卡` : SOURCE_LABELS.activity),
          tag_tone: isManual ? 'manual' : (isProject ? 'project' : 'activity'),
          benefit_text: d.benefit_name && d.benefit_name !== d.project_name ? d.benefit_name : '',
          remaining_text: d.remaining_after != null
            ? (Number(d.remaining_after) < 0
              ? `欠卡 ${Math.abs(Number(d.remaining_after))} 次`
              : `剩余 ${d.remaining_after} 次`)
            : (['unlimited_card', 'internal_course'].includes(d.benefit_type) ? '不限次' : ''),
          date_label: this._dateLabel(d.deduction_date),
          reason_text: d.reason || '',
          activity_role_text: d.activity_role || '',
        }
      })
      this.setData({
        purchaseSummary,
        items,
        groups: this._groupByDate(items),
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _dateLabel(dateText) {
    if (!dateText) return '其他'
    const parts = String(dateText).slice(0, 10).split('-').map(Number)
    if (parts.length !== 3 || parts.some(n => !n)) return dateText
    const date = new Date(parts[0], parts[1] - 1, parts[2])
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const dayDiff = Math.round((today - target) / 86400000)
    if (dayDiff === 0) return '今天'
    if (dayDiff === 1) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  },

  _groupByDate(items) {
    const groups = []
    for (const item of items) {
      const last = groups[groups.length - 1]
      if (last && last.day === item.date_label) {
        last.items.push(item)
      } else {
        groups.push({ day: item.date_label, items: [item] })
      }
    }
    return groups
  },
})
