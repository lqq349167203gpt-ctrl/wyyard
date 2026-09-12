import type { AnalysisCondition, AnalysisMetadata, AnalysisOperator } from "@/lib/api"

/** 与自定义筛选保持一致：这些操作符不需要填值 */
export const VALUELESS_OPERATORS = new Set<AnalysisOperator>(["is_empty", "is_not_empty"])

export type AnalysisFieldDefinition = AnalysisMetadata["fields"][number]
// 平铺 + 分组小标题：不再用二级菜单（悬停容易丢），一条列表点一下就能选
export type AnalysisFieldOption = { value: string; label: string; groupLabel?: string }

/** 新增条件：默认字段取列表第一个，操作符取该字段支持的第一个 */
export function makeCondition(fields: AnalysisFieldDefinition[]): AnalysisCondition | null {
  const first = fields[0]
  if (!first) return null
  const operator = first.operators[0]
  return { field: first.value, operator, value: VALUELESS_OPERATORS.has(operator) ? null : "" }
}

/** 条件字段按「组」展示，与自定义筛选的字段下拉一致（同一份平铺列表） */
export function groupFieldOptions(fields: AnalysisFieldDefinition[]): AnalysisFieldOption[] {
  return fields.map(field => ({ value: field.value, label: field.label, groupLabel: field.group }))
}
