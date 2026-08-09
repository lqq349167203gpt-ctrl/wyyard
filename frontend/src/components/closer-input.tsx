import { useState, useCallback } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { type Customer, type CustomerLight } from "@/lib/api"

export interface Closer {
  id: string
  name: string
  amount: number
}

interface CloserInputProps {
  customers: Customer[] | CustomerLight[]
  value: Closer[]
  onChange: (closers: Closer[]) => void
  disabled?: boolean
  defaultAmount?: number
}

export function CloserInput({ customers, value, onChange, disabled, defaultAmount }: CloserInputProps) {
  const [searchValue, setSearchValue] = useState("")

  const selectedIds = value.map(c => c.id)

  const handleSelect = useCallback((customer: Customer) => {
    if (value.some(c => c.id === customer.id)) return
    onChange([...value, { id: customer.id, name: customer.nickname, amount: defaultAmount ?? 0 }])
    setSearchValue("")
  }, [value, onChange, defaultAmount])

  const handleRemove = useCallback((id: string) => {
    onChange(value.filter(c => c.id !== id))
  }, [value, onChange])

  const handleAmountChange = useCallback((id: string, amount: string) => {
    const num = parseFloat(amount) || 0
    onChange(value.map(c => c.id === id ? { ...c, amount: num } : c))
  }, [value, onChange])

  const total = value.reduce((sum, c) => sum + c.amount, 0)

  return (
    <div className="space-y-2">
      <CustomerSearchInput
        customers={customers}
        value={searchValue}
        onChange={(v) => setSearchValue(typeof v === "string" ? v : "")}
        onSelectItem={handleSelect}
        placeholder="搜索成交人"
        excludeIds={selectedIds}
        disabled={disabled}
      />
      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map(closer => (
            <div key={closer.id} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f0f5ff] text-[11px] text-[#3370ff] shrink-0">
                {closer.name}
              </span>
              <Input
                type="number"
                value={closer.amount || ""}
                onChange={(e) => handleAmountChange(closer.id, e.target.value)}
                placeholder="金额"
                className="h-7 text-[12px] w-24"
                disabled={disabled}
              />
              <span className="text-[11px] text-[#8f959e]">元</span>
              <button
                onClick={() => handleRemove(closer.id)}
                className="text-[#8f959e] hover:text-[#e02020] shrink-0"
                disabled={disabled}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {value.length > 1 && (
            <div className="text-[11px] text-[#8f959e]">
              总金额: <span className="text-[#2b2f36] font-medium">{total}</span> 元
            </div>
          )}
        </div>
      )}
    </div>
  )
}
