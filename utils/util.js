function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function getWeekday(date) {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return '周' + days[date.getDay()]
}

function getWeekDates(centerDate) {
  // 返回包含 centerDate 在内的一周日期
  const dates = []
  const d = new Date(centerDate)
  const day = d.getDay()
  const start = new Date(d)
  start.setDate(d.getDate() - day) // 从周日开始
  for (let i = 0; i < 7; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    dates.push({
      date: formatDate(date),
      day: date.getDate(),
      weekday: getWeekday(date),
      isToday: formatDate(date) === formatDate(new Date()),
    })
  }
  return dates
}

function debounce(fn, delay = 300) {
  let timer = null
  return function () {
    var args = arguments
    if (timer) clearTimeout(timer)
    timer = setTimeout(function() { fn.apply(this, args) }, delay)
  }
}

module.exports = { formatDate, formatTime, getWeekday, getWeekDates, debounce }
