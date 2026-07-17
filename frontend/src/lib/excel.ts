import ExcelJS from "exceljs"

// exceljs 单元格值 → 导入用的原始字符串/数字
// 兼容富文本、超链接、公式结果、共享字符串与日期单元格
function cellToPrimitive(value: ExcelJS.CellValue): string | number {
  if (value == null) return ""
  if (value instanceof Date) {
    // 日期单元格统一转成 YYYY-MM-DD 字符串，便于导入校验
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map(t => t.text).join("")
    if ("text" in value) return String(value.text)
    if ("result" in value) return cellToPrimitive(value.result as ExcelJS.CellValue)
    if ("sharedString" in value) return String(value.sharedString)
    return String(value)
  }
  // 布尔单元格与原 xlsx 行为一致，经 String() 转为 "true"/"false"
  if (typeof value === "boolean") return String(value)
  return value
}

// 等价于 XLSX.utils.sheet_to_json(ws, { header: 1 })：工作表 → 二维数组
export function sheetToRows(ws: ExcelJS.Worksheet): (string | number)[][] {
  const rows: (string | number)[][] = []
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as ExcelJS.CellValue[]
    const arr: (string | number)[] = []
    // 注意：exceljs 的 row.values 是 1-based 数组，第 0 位为空
    for (let c = 1; c < values.length; c++) arr.push(cellToPrimitive(values[c]))
    rows.push(arr)
  })
  return rows
}
