export type DateRange = { date_from: string; date_to: string }
export type DatePreset = "today" | "week" | "month" | "year" | "all" | "custom"

function formatLocalDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

/** 本月：当月 1 日到今天（未来还没有数据，不把日期铺到月底） */
export function monthRange(): DateRange {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return { date_from: `${year}-${month}-01`, date_to: formatLocalDate(now) }
}

export function weekRange(): DateRange {
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  return { date_from: formatLocalDate(monday), date_to: formatLocalDate(now) }
}

export function todayRange(): DateRange {
  const today = formatLocalDate(new Date())
  return { date_from: today, date_to: today }
}

/** 本年：当年 1 月 1 日到今天（未来还没有数据，不把日期铺到年底） */
export function yearRange(year = new Date().getFullYear()): DateRange {
  const currentYear = new Date().getFullYear()
  return {
    date_from: `${year}-01-01`,
    date_to: year === currentYear ? formatLocalDate(new Date()) : `${year}-12-31`,
  }
}

export function selectedMonthRange(value: string): DateRange | null {
  const [year, month] = value.split("-").map(Number)
  if (!year || !month) return null
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
  return {
    date_from: `${year}-${String(month).padStart(2, "0")}-01`,
    date_to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  }
}

/** 当前日期区间对应「年份 / 月份」下拉里的哪一项；自定义区间返回空字符串 */
export function selectedPeriodValue(dateFrom: string, dateTo: string) {
  const monthKey = dateFrom && dateTo && dateFrom.slice(0, 7) === dateTo.slice(0, 7) ? dateFrom.slice(0, 7) : ""
  const monthMatched = monthKey
    && selectedMonthRange(monthKey)?.date_from === dateFrom
    && selectedMonthRange(monthKey)?.date_to === dateTo
  const yearMatched = dateFrom && dateTo
    && dateFrom === `${dateFrom.slice(0, 4)}-01-01`
    && dateTo === yearRange(Number(dateFrom.slice(0, 4))).date_to
  return yearMatched ? `year-${dateFrom.slice(0, 4)}` : monthMatched ? `month-${monthKey}` : ""
}

/** 当前日期区间命中哪个快捷档（当天/本周/本月/本年/全部），否则是自定义 */
export function datePresetOf(dateFrom: string, dateTo: string): DatePreset {
  if (!dateFrom && !dateTo) return "all"
  if (dateFrom === todayRange().date_from && dateTo === todayRange().date_to) return "today"
  if (dateFrom === weekRange().date_from && dateTo === weekRange().date_to) return "week"
  if (dateFrom === monthRange().date_from && dateTo === monthRange().date_to) return "month"
  if (dateFrom === yearRange().date_from && dateTo === yearRange().date_to) return "year"
  return "custom"
}

/** 近 10 年 + 每年 12 个月，供「年份或月份」下拉使用 */
export function buildPeriodOptions() {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 10 }, (_, index) => currentYear + 1 - index).flatMap(year => [
    { value: `year-${year}`, label: `${year}年全年` },
    {
      value: `months-${year}`,
      label: `${year}年按月`,
      children: Array.from({ length: 12 }, (_, monthIndex) => ({
        value: `month-${year}-${String(monthIndex + 1).padStart(2, "0")}`,
        label: `${year}年${monthIndex + 1}月`,
      })),
    },
  ])
}
