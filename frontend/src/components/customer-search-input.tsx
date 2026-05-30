import { useState, useEffect, useRef } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { type Customer } from "@/lib/api"

export interface CustomerSearchInputProps {
  /** All available customers to search from */
  customers: Customer[]
  /** Currently selected value (nickname for single, array for multi) */
  value: string | string[]
  /** Called when selection changes (receives nickname(s)) */
  onChange: (value: string | string[]) => void
  /** Optional: called with full Customer object on select */
  onSelectItem?: (customer: Customer) => void
  /** Placeholder text */
  placeholder?: string
  /** Allow multiple selections */
  multi?: boolean
  /** Filter customers by position (e.g., "成就君") */
  positionFilter?: string
  /** Customer IDs to exclude from results */
  excludeIds?: string[]
  /** Disabled state */
  disabled?: boolean
  /** Extra class for the input container */
  className?: string
}

export function CustomerSearchInput({
  customers,
  value,
  onChange,
  onSelectItem,
  placeholder = "搜索客户昵称",
  multi = false,
  positionFilter,
  excludeIds = [],
  disabled = false,
  className = "",
}: CustomerSearchInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Filter customers
  const selectedNames = multi
    ? (Array.isArray(value) ? value : [])
    : (typeof value === "string" && value ? [value] : [])

  let filtered = customers.filter(c => {
    if (!c.nickname) return false
    if (excludeIds.includes(c.id)) return false
    if (positionFilter && !(c.positions || []).includes(positionFilter)) return false
    if (search && !c.nickname.includes(search)) return false
    if (selectedNames.includes(c.nickname)) return false
    return true
  })

  const removeItem = (name: string) => {
    if (multi) {
      onChange(selectedNames.filter(n => n !== name))
    } else {
      onChange("")
    }
  }

  const selectItem = (customer: Customer) => {
    if (multi) {
      onChange([...selectedNames, customer.nickname])
      setSearch("")
    } else {
      onChange(customer.nickname)
      onSelectItem?.(customer)
      setOpen(false)
      setSearch("")
    }
  }

  return (
    <div className="relative" ref={ref}>
      {multi ? (
        // Multi-select: show badges + search input
        <div
          className={`min-h-8 w-full rounded-md border border-[#dee0e3] bg-white px-2 py-1 flex flex-wrap gap-1 items-center ${disabled ? "opacity-50" : ""} ${open ? "border-[#3370ff]" : ""} ${className}`}
          onClick={() => !disabled && setOpen(true)}
        >
          {selectedNames.map(name => (
            <span key={name} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f0f5ff] text-[11px] text-[#3370ff]">
              {name}
              <button
                onClick={(e) => { e.stopPropagation(); removeItem(name) }}
                className="hover:text-[#e02020]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            className="flex-1 min-w-[80px] h-6 border-none outline-none text-[12px] bg-transparent"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={selectedNames.length === 0 ? placeholder : ""}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      ) : (
        // Single select: show input with X clear button
        <div className="relative">
          <Input
            value={typeof value === "string" && value ? value : search}
            onChange={(e) => {
              const v = e.target.value
              if (typeof value === "string") {
                onChange(v)
              }
              setSearch(v)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
          />
          {typeof value === "string" && value && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f959e] hover:text-[#2b2f36]"
              onClick={() => { onChange(""); setSearch("") }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#dee0e3] rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <div
              key={c.id}
              className="px-3 py-2 text-[12px] text-[#2b2f36] hover:bg-[#f7f8fa] cursor-pointer flex items-center gap-2"
              onMouseDown={(e) => { e.preventDefault(); selectItem(c) }}
            >
              <span>{c.nickname}</span>
              {c.member_type && (
                <span className="text-[10px] text-[#8f959e] ml-auto">{c.member_type}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {open && !disabled && search && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#dee0e3] rounded-md shadow-lg px-3 py-2 text-[12px] text-[#8f959e]">
          无匹配结果
        </div>
      )}
    </div>
  )
}
