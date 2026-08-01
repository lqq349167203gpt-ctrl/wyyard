export type ChartGranularity = "day" | "week" | "month"

export function getDatePeriodKey(dateString: string, granularity: ChartGranularity) {
  if (!dateString) return ""
  if (granularity === "day") return dateString.slice(0, 10)
  if (granularity === "month") return dateString.slice(0, 7)

  const date = new Date(`${dateString.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ""
  const isoDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = isoDate.getUTCDay() || 7
  isoDate.setUTCDate(isoDate.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(isoDate.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((isoDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${isoDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

export function formatPeriodLabel(periodKey: string, granularity: ChartGranularity) {
  if (!periodKey) return ""
  if (granularity === "day") return periodKey.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日")
  if (granularity === "month") return periodKey.replace(/^(\d{4})-(\d{2})$/, "$1年$2月")
  const match = periodKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return periodKey
  const year = Number(match[1])
  const week = Number(match[2])
  const januaryFourth = new Date(Date.UTC(year, 0, 4))
  const monday = new Date(januaryFourth)
  monday.setUTCDate(januaryFourth.getUTCDate() - (januaryFourth.getUTCDay() || 7) + 1 + (week - 1) * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const format = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  return `${year}年第${week}周（${format(monday)}-${format(sunday)}）`
}
