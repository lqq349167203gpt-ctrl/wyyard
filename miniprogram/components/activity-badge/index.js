const TYPE_COLORS = {
  '课表': '#4a90d9',
  '觉醒游戏': '#8b72c7',
  '情绪释放': '#d97070',
  '能量结': '#d9944a',
  '内部课程': '#5ba88a',
  '沙龙': '#bfa060',
  '呼吸禅茶': '#5ba88a',
  'AB情景剧': '#d9944a',
  '沙盘疗愈': '#8b72c7',
  '身体课': '#d97070',
  '颂钵': '#c772a0',
  '艺术疗愈': '#bfa060',
  '疗愈行业分享会': '#4a90d9',
}

Component({
  properties: {
    name: { type: String, value: '' },
    type: { type: String, value: '' },
  },

  data: {
    color: '#3370ff',
  },

  observers: {
    'type': function (type) {
      this.setData({ color: TYPE_COLORS[type] || '#3370ff' })
    },
  },
})
