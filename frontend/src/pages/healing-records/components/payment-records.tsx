import type { PaymentRecordGroup } from "@/lib/api"

export default function PaymentRecords({ records }: { records: PaymentRecordGroup[] }) {
  return (
    <div className="bg-white rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-medium text-[#2b2f36]">收费记录</h3>
      </div>
      {records.length === 0 ? (
        <div className="p-4 text-xs text-[#8f959e] text-center">暂无收费记录</div>
      ) : (
        <div className="p-4 space-y-3">
          {records.map((group, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[12px] text-[#2b2f36] font-medium">{group.type}</span>
                <span className="text-[11px] text-[#8f959e]">¥{group.total}</span>
              </div>
              <div className="space-y-1 pl-3">
                {group.items.map((item, j) => (
                  <div key={j} className="flex items-center gap-2 text-[11px] text-[#4e535a]">
                    <span>- {item.name}</span>
                    <span>¥{item.amount}</span>
                    <span className="text-[#8f959e]">({item.date})</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
