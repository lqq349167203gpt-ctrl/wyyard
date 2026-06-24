const TYPE_COLORS = {
  '课表': '#4a90d9',
  '读书会': '#8b72c7',
  '情绪释放': '#d97070',
  '能量结': '#d9944a',
  '内部课程': '#5ba88a',
  'OH卡': '#c772a0',
  '沙龙': '#bfa060',
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
