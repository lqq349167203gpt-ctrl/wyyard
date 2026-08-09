// 活动相关共享常量

const BADGE_COLORS = {
  '沙龙': '#bfa060', '觉醒': '#7c5cfc', '觉醒游戏': '#8b72c7',
  '情绪释放': '#d97070', '能量结': '#d9944a', '内部课程': '#5ba88a',
  '呼吸禅茶': '#5ba88a', 'AB情景剧': '#d9944a',
  '沙盘疗愈': '#8b72c7', '身体课': '#d97070', '颂钵': '#c772a0',
  '艺术疗愈': '#bfa060', '疗愈行业分享会': '#4a90d9',
}

const ACTIVITY_TYPES = [
  { value: 'class', label: '沙龙活动' },
  { value: 'gcs', label: '觉醒游戏' },
  { value: 'ers', label: '情绪释放' },
  { value: 'eks', label: '能量结' },
  { value: 'ics', label: '内部课程' },
]

const TYPE_LABELS = {
  class: '沙龙', gcs: '觉醒', ers: '情绪释放',
  eks: '能量结', ics: '内部课程',
}

const TEACHER_POSITION = {
  class: '课程老师', gcs: '成就君', ers: '成就君',
  eks: '能量结老师', ics: '课程老师',
}

const SINGLE_TEACHER_TYPES = ['gcs', 'ers']

const ICS_COURSE_TYPES = ['疗愈师课程', '商业框架陪跑', '落地赋能班']

module.exports = {
  BADGE_COLORS,
  ACTIVITY_TYPES,
  TYPE_LABELS,
  TEACHER_POSITION,
  SINGLE_TEACHER_TYPES,
  ICS_COURSE_TYPES,
}
