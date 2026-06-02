import type { PaymentRecord } from "@/lib/api"

export default function PaymentRecords({ records }: { records: PaymentRecord[] }) {
  return (
    <div className="bg-white rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-medium text-[#2b2f36]">收费记录</h3>
      </div>
      {records.length === 0 ? (
        <div className="p-4 text-xs text-[#8f959e] text-center">暂无收费记录</div>
      ) : (
        <div className="p-4 space-y-2">
          {records.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="text-[#2b2f36]">{r.type} - {r.name}</span>
              <span className="text-[#8f959e]">x{r.quantity}</span>
              <span className="text-[#2b2f36] font-medium ml-auto">¥{r.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
