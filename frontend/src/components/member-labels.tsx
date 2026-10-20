type Labels = { member_type?: string; card_status?: string; card_status_tone?: string }

export function memberLabelText(customer?: Labels | null) {
  return [customer?.member_type, customer?.card_status].filter(Boolean).join(" · ")
}

export function MemberLabels({ customer, empty = "—" }: { customer?: Labels | null; empty?: string }) {
  if (!customer?.member_type && !customer?.card_status) return <span className="text-[#b0b5bd]">{empty}</span>
  return <span className="inline-flex max-w-full flex-nowrap items-center gap-1 align-middle text-[12px] font-normal leading-5">
    {customer.member_type && <span title={customer.member_type} className="min-w-0 truncate rounded-[3px] bg-[#f2f3f5] px-1.5 text-[#646a73]">{customer.member_type}</span>}
    {customer.card_status && <span title="当前有效会员卡的卡次状态" className={`min-w-0 truncate rounded-[3px] px-1.5 ${customer.card_status_tone === "warning" ? "bg-[#fff5e6] text-[#94651e]" : "bg-[#f2f3f5] text-[#646a73]"}`}>{customer.card_status}</span>}
  </span>
}
