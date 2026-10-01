// 课表、邀约、每日报表共用一个选中日期；旧键仅兼容既有入口。
const DATE_KEYS = ['schedule_selected_date', 'visit_selected_date', 'activity_selected_date']

function isScheduleDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function readScheduleDate(fallback) {
  for (const key of DATE_KEYS) {
    const value = wx.getStorageSync(key)
    if (isScheduleDate(value)) return value
  }
  return fallback
}

function writeScheduleDate(date) {
  if (!isScheduleDate(date)) return
  DATE_KEYS.forEach(key => wx.setStorageSync(key, date))
}

module.exports = { readScheduleDate, writeScheduleDate }
