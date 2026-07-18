const { clientApi } = require('../../utils/api')

const SOURCE_LABELS = {
  manual: '手动销卡',
  activity: '活动扣费',
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
    loading: true,
  },

  onShow() {
    this.loadDeductions()
  },

  async loadDeductions() {
    this.setData({ loading: true })
    try {
      const res = await clientApi.getDeductions()
      const items = (res.items || []).map(d => ({
        ...d,
        source_text: SOURCE_LABELS[d.source] || d.source,
        type_text: TYPE_LABELS[d.project_type] || d.project_type,
        remaining_text: d.remaining_after != null ? `剩余 ${d.remaining_after} 次` : '',
        date_text: d.deduction_date || '',
      }))
      this.setData({ items, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    }
  },
})
