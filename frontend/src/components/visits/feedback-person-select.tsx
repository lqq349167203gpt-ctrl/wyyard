import { SelectDropdown } from "@/components/select-dropdown"

export type FeedbackPersonOption = { customer_id: string; name: string }

export function feedbackPersonValue(option: FeedbackPersonOption): string {
  return option.customer_id ? `id:${option.customer_id}` : `name:${option.name}`
}

export function currentFeedbackPersonName(): string {
  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
    return String(user.owner || user.username || "").trim()
  } catch {
    return ""
  }
}

export function FeedbackPersonSelect({ options, value, onChange }: {
  options: FeedbackPersonOption[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <SelectDropdown
      value={value}
      options={options.map(option => ({ value: feedbackPersonValue(option), label: option.name }))}
      onChange={onChange}
      placeholder="选择反馈人"
      size="sm"
      className="w-[180px]"
      buttonClassName="!h-8 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2.5 !text-[12px] !shadow-none"
      dropdownWidth={180}
      menuMaxHeight={240}
    />
  )
}
