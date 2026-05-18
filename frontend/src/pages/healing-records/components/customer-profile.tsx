import type { Customer } from "@/lib/api"

export default function CustomerProfile({ customer }: { customer: Customer }) {
  const fields = [
    { label: "昵称", value: customer.nickname },
    { label: "姓名", value: customer.name },
    { label: "年龄", value: customer.age },
    { label: "身份", value: customer.member_type },
    { label: "联系电话", value: customer.phone },
    { label: "微信", value: customer.wechat },
    { label: "引流人", value: customer.referrer },
    { label: "流量来源", value: customer.traffic_source },
    { label: "到场次数", value: String(customer.visit_count) },
  ]

  return (
    <div className="bg-white rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-medium text-[#2b2f36]">基本信息</h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-y-3 gap-x-6">
          {fields.map((f) => (
            <div key={f.label} className="flex items-baseline gap-2">
              <span className="text-[11px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">{f.label}</span>
              <span className="text-[12px] text-[#2b2f36]">{f.value || "-"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
