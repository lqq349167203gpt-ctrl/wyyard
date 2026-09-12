import { X } from "lucide-react"

import { AnalysisDatePicker } from "@/components/analysis-date-picker"
import { SelectDropdown } from "@/components/select-dropdown"
import { Input } from "@/components/ui/input"
import { VALUELESS_OPERATORS, type AnalysisFieldDefinition, type AnalysisFieldOption } from "@/lib/analysis-conditions"
import type { AnalysisCondition, AnalysisField, AnalysisOperator } from "@/lib/api"

interface AnalysisConditionRowProps {
  condition: AnalysisCondition
  fieldByName: Map<string, AnalysisFieldDefinition>
  operatorLabels: Partial<Record<AnalysisOperator, string>>
  fieldOptions: AnalysisFieldOption[]
  onChange: (next: AnalysisCondition) => void
  onRemove: () => void
  removeLabel?: string
  fieldWidth?: string
  operatorWidth?: string
}

/** 条件行的字段/规则/取值控件与「自定义筛选」同一套，两边改一处即同步。 */
export function AnalysisConditionRow({
  condition,
  fieldByName,
  operatorLabels,
  fieldOptions,
  onChange,
  onRemove,
  removeLabel = "删除筛选条件",
  // 默认宽度与主理人「从／到」那行的动作控件对齐：168 + 140，值列自动撑满
  fieldWidth = "w-[168px]",
  operatorWidth = "w-[140px]",
}: AnalysisConditionRowProps) {
  const definition = fieldByName.get(condition.field)
  const operatorOptions = (definition?.operators ?? []).map(operator => ({ value: operator, label: operatorLabels[operator] ?? operator }))
  const values = Array.isArray(condition.value) ? condition.value.map(String) : []
  const singleValue = condition.value === null || condition.value === undefined ? "" : String(condition.value)

  const changeField = (field: string) => {
    const next = fieldByName.get(field)
    const operator = (next?.operators[0] ?? "eq") as AnalysisOperator
    onChange({ field: field as AnalysisField, operator, value: VALUELESS_OPERATORS.has(operator) ? null : "", inherit_period: false })
  }
  const changeOperator = (operator: AnalysisOperator) => {
    const value = VALUELESS_OPERATORS.has(operator)
      ? null
      : operator === "between"
        ? ["", ""]
        : operator === "in"
          ? []
          : Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value
    onChange({ ...condition, operator, value, inherit_period: false })
  }

  const renderValue = () => {
    if (VALUELESS_OPERATORS.has(condition.operator)) return null
    if (condition.operator === "between") {
      if (definition?.value_type === "date") {
        // 两个日期各占一半，和数字区间保持同一个视觉宽度
        return (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="min-w-0 flex-1"><AnalysisDatePicker fullWidth value={values[0] ?? ""} onChange={value => onChange({ ...condition, value: [value, values[1] ?? ""] })} ariaLabel={`${definition.label}开始`} /></div>
            <span className="text-[11px] text-[#8f959e]">至</span>
            <div className="min-w-0 flex-1"><AnalysisDatePicker fullWidth value={values[1] ?? ""} onChange={value => onChange({ ...condition, value: [values[0] ?? "", value] })} ariaLabel={`${definition.label}结束`} /></div>
          </div>
        )
      }
      const inputType = definition?.value_type === "number" ? "number" : "text"
      return (
        <div className="flex h-7 min-w-0 flex-1 items-center rounded-[4px] border border-transparent bg-transparent hover:border-[#e1e4e7] focus-within:border-[#b9cdf8] focus-within:bg-white">
          <input type={inputType} value={values[0] ?? ""} onChange={event => onChange({ ...condition, value: [event.target.value, values[1] ?? ""] })} className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none" />
          <span className="text-[11px] text-[#8f959e]">至</span>
          <input type={inputType} value={values[1] ?? ""} onChange={event => onChange({ ...condition, value: [values[0] ?? "", event.target.value] })} className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none" />
        </div>
      )
    }
    if (definition?.value_type === "date") {
      return (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <AnalysisDatePicker fullWidth value={singleValue} onChange={value => onChange({ ...condition, value })} ariaLabel={definition.label} />
        </div>
      )
    }
    if (definition?.options.length) {
      const options = definition.options.map(value => ({ value, label: value }))
      return condition.operator === "in" ? (
        <SelectDropdown value={values} options={options} onChange={value => onChange({ ...condition, value })} multi singleLineMulti size="sm" className="min-w-0 flex-1" buttonClassName="!h-7 !border-transparent !bg-transparent !px-2 !text-[12px] hover:!border-[#e1e4e7]" dropdownWidth={220} />
      ) : (
        <SelectDropdown value={singleValue} options={options} onChange={value => onChange({ ...condition, value })} size="sm" className="min-w-0 flex-1" buttonClassName="!h-7 !border-transparent !bg-transparent !px-2 !text-[12px] hover:!border-[#e1e4e7]" dropdownWidth={220} />
      )
    }
    return (
      <Input
        type={definition?.value_type === "number" ? "number" : "text"}
        value={singleValue}
        onChange={event => onChange({ ...condition, value: definition?.value_type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value })}
        className="h-7 min-w-0 flex-1 rounded-[4px] border-transparent bg-transparent px-2 text-[12px] font-normal shadow-none hover:border-[#e1e4e7] focus-visible:border-[#b9cdf8] focus-visible:bg-white focus-visible:ring-0"
      />
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-[4px] border border-[#eceef0] bg-[#fbfcfd] px-2 py-1">
      <SelectDropdown
        value={condition.field}
        options={fieldOptions}
        onChange={changeField}
        size="sm"
        className={`${fieldWidth} shrink-0`}
        buttonClassName="!h-7 !border-transparent !bg-transparent !px-1.5 !text-[12px] !font-medium hover:!border-[#e1e4e7]"
        dropdownWidth={200}
        menuMaxHeight={320}
        
      />
      <SelectDropdown
        value={condition.operator}
        options={operatorOptions}
        onChange={value => changeOperator(value as AnalysisOperator)}
        size="sm"
        className={`${operatorWidth} shrink-0`}
        buttonClassName="!h-7 !border-transparent !bg-transparent !px-1.5 !text-[12px] !text-[#8f959e] hover:!border-[#e1e4e7]"
      />
      {renderValue()}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[#b0b5bb] hover:bg-[#f0f1f3] hover:text-[#4e535a]"
        aria-label={removeLabel}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
