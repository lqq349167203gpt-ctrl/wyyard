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
  'oh-card-readings': 'OH卡梳理',
  'energy-knots': '能量结',
  'internal-courses': '内部课程',
  'other-projects': '其他项目',
}

Page({
  data: {
    items: [],
    groups: [],
    projects: [],
    activeProjects: [],
    expiredProjects: [],
    expiredProjectNames: '',
    expiredExpanded: false,
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
      projects: [],
      activeProjects: [],
      expiredProjects: [],
      expiredProjectNames: '',
    })
    try {
      const res = await clientApi.getDeductions()
      const projects = (res.projects || []).map(project => ({
        ...project,
        remaining_text: typeof project.remaining === 'number'
          ? `${project.remaining}`
          : (project.remaining === '不限次' ? '不限' : (project.remaining || '不限')),
        total_text: typeof project.remaining === 'number' && typeof project.total === 'number'
          ? `/ ${project.total}`
          : '',
        validity_text: this._projectValidityText(project),
        bar_width: this._projectBarWidth(project),
      }))
      const activeProjects = projects.filter(project => project.status !== 'expired')
      const expiredProjects = projects.filter(project => project.status === 'expired')
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
            ? `剩余 ${d.remaining_after} 次`
            : (['unlimited_card', 'internal_course'].includes(d.benefit_type) ? '不限次' : ''),
          date_label: this._dateLabel(d.deduction_date),
          reason_text: d.reason || '',
          activity_role_text: d.activity_role || '',
        }
      })
      this.setData({
        projects,
        activeProjects,
        expiredProjects,
        expiredProjectNames: expiredProjects.map(project => project.name).join('　'),
        items,
        groups: this._groupByDate(items),
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  _compactProjectDate(dateText) {
    if (!dateText) return ''
    const parts = String(dateText).slice(0, 10).split('-')
    if (parts.length !== 3) return dateText
    return `${parts[0]}.${parts[1]}.${parts[2]}`
  },

  _projectValidityText(project) {
    const effective = this._compactProjectDate(project.effective_date)
    const expiry = this._compactProjectDate(project.expiry_date)
    if (project.status === 'pending') return `生效于 ${effective || '未设置'}`
    if (effective && expiry) return `${effective} - ${expiry}`
    if (expiry) return `有效期至 ${expiry}`
    if (effective) return `${effective} 起长期有效`
    return '长期有效'
  },

  _projectBarWidth(project) {
    if (typeof project.remaining !== 'number' || typeof project.total !== 'number' || project.total <= 0) {
      return 100
    }
    return Math.max(0, Math.min(100, Math.round((project.remaining / project.total) * 100)))
  },

  toggleExpiredProjects() {
    this.setData({ expiredExpanded: !this.data.expiredExpanded })
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
