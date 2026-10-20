function dateRange(mode, data) {
  if (mode === 'all') return {}
  if (mode === 'day') return { date_from: data.day, date_to: data.day }
  if (mode === 'year') return { date_from: data.year + '-01-01', date_to: data.year + '-12-31' }
  if (mode === 'month') {
    const parts = data.month.split('-').map(Number)
    return { date_from: data.month + '-01', date_to: data.month + '-' + new Date(parts[0], parts[1], 0).getDate() }
  }
  return { date_from: data.dateFrom, date_to: data.dateTo }
}
module.exports = { dateRange }
