import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { type Customer, type CustomerLight } from "@/lib/api"

const MAX_VISIBLE = 50

export interface CustomerSearchInputProps {
  /** All available customers to search from */
  customers: Customer[] | CustomerLight[]
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
  /** Filter out already-selected names from dropdown (default true) */
  filterSelected?: boolean
  /** Extra class for the input container */
  className?: string
  /** Called when user clicks "新增用户" in no-results state */
  onNoResultsClick?: (searchText: string) => void
  /** Called when input loses focus with current text */
  onBlur?: (value: string) => void
  /** Portal container for dropdown */
  portalContainer?: HTMLElement | null
  /** Custom right-side label per customer ID (overrides member_type) */
  rightLabelMap?: Record<string, string>
  /** Customer IDs whose right label should be red */
  warnLabelIds?: string[]
  /** Show clear X button in single-select mode (default true) */
  showClear?: boolean
  /** Custom dropdown width (default: match input width) */
  dropdownWidth?: number
  /** Border radius override (default: "4px") */
  rounded?: string
}

export function CustomerSearchInput({
  customers,
  value,
  onChange,
  onSelectItem,
  placeholder = "",
  multi = false,
  positionFilter,
  excludeIds = [],
  disabled = false,
  filterSelected = false,
  className = "",
  onNoResultsClick,
  onBlur,
  portalContainer,
  rightLabelMap,
  warnLabelIds,
  showClear = true,
  dropdownWidth,
  rounded = "4px",
}: CustomerSearchInputProps) {
  const radiusValue = rounded.startsWith("[") ? rounded.slice(1, -1) : rounded
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [pos, setPos] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const calcPos = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const h = 192 // max-h-48
    const below = window.innerHeight - r.bottom
    const above = r.top
    const s: React.CSSProperties = {
      position: "fixed",
      left: r.left,
      width: dropdownWidth ?? r.width,
      zIndex: 2147483647, // 最大 z-index 值
    }
    if (below >= h || below >= above) {
      s.top = r.bottom + 4
      s.maxHeight = Math.min(h, below - 8)
    } else {
      s.bottom = window.innerHeight - r.top + 4
      s.maxHeight = Math.min(h, above - 8)
    }
    setPos(s)
  }, [dropdownWidth])

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("pointerdown", handleClick)
    return () => document.removeEventListener("pointerdown", handleClick)
  }, [])

  // Update position on scroll/resize
  useEffect(() => {
    if (!open) return
    window.addEventListener("scroll", calcPos, true)
    window.addEventListener("resize", calcPos)
    return () => {
      window.removeEventListener("scroll", calcPos, true)
      window.removeEventListener("resize", calcPos)
    }
  }, [open, calcPos])

  const selectedNames = multi
    ? (Array.isArray(value) ? value : [])
    : (typeof value === "string" && value ? [value] : [])

  const filtered = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    const seen = new Set<string>()
    return customers.filter(c => {
      if (!c.nickname) return false
      if (excludeIds.includes(c.id)) return false
      if (positionFilter && !(c.positions || []).includes(positionFilter)) return false
      if (filterSelected && selectedNames.includes(c.nickname)) return false
      if (seen.has(c.nickname)) return false
      if (c.nickname.toLowerCase().includes(q)) {
        seen.add(c.nickname)
        return true
      }
      return false
    }).sort((a, b) => {
      if (!positionFilter) return 0
      const orderA = a.position_sort_orders?.[positionFilter] ?? 9999
      const orderB = b.position_sort_orders?.[positionFilter] ?? 9999
      return orderA - orderB
    })
  }, [customers, search, excludeIds, positionFilter, filterSelected, selectedNames])

  const removeItem = (name: string) => {
    if (multi) {
      onChange(selectedNames.filter(n => n !== name))
    } else {
      onChange("")
    }
  }

  const selectItem = (customer: Customer | CustomerLight) => {
    if (multi) {
      onChange([...selectedNames, customer.nickname])
      setSearch("")
      inputRef.current?.focus()
    } else {
      onChange(customer.nickname)
      if (onSelectItem) {
        onSelectItem(customer as Customer)
      }
      setOpen(false)
      setSearch("")
    }
  }

  return (
    <div className="relative" ref={ref}>
      {multi ? (
        // Multi-select: badges inline with search input
        <div
          style={{ borderRadius: radiusValue }}
          className={`h-7 w-full border border-[#e8eaed] bg-white px-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide ${disabled ? "opacity-50" : ""} ${open ? "border-[#3370ff]" : ""} ${className}`}
          onClick={() => { if (!disabled) { calcPos(); setOpen(true); inputRef.current?.focus() } }}
        >
          {selectedNames.map(name => (
            <span key={name} className="inline-flex items-center px-1 py-0.5 rounded bg-[#f5f6f7] text-[11px] text-[#4e535a] shrink-0">
              {name}
            </span>
          ))}
          <input
            ref={inputRef}
            className="shrink-0 w-[60px] h-5 border-none outline-none text-[12px] bg-transparent"
            value={search}
            onChange={(e) => { setSearch(e.target.value); calcPos(); setOpen(true) }}
            onFocus={() => { calcPos(); setOpen(true) }}
            onKeyDown={(e) => {
              if ((e.key === "Backspace" || e.key === "Delete") && search === "" && selectedNames.length > 0) {
                e.preventDefault()
                removeItem(selectedNames[selectedNames.length - 1])
              }
            }}
            placeholder={selectedNames.length === 0 ? placeholder : ""}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      ) : (
        // Single select: show input with X clear button
        <div className="relative">
          <Input
            style={{ borderRadius: radiusValue }}
            value={typeof value === "string" && value ? value : search}
            onChange={(e) => {
              const v = e.target.value
              setSearch(v)
              calcPos()
              setOpen(true)
              onChange(v)
            }}
            onFocus={() => { calcPos(); setOpen(true) }}
            onBlur={() => { setTimeout(() => onBlur?.(typeof value === "string" ? value : ""), 150) }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !search && typeof value === "string" && value) {
                e.preventDefault()
                onChange("")
                setSearch("")
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className={className}
            autoComplete="off"
          />
          {showClear && typeof value === "string" && value && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f959e] hover:text-[#2b2f36]"
              onClick={() => { onChange(""); setSearch("") }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Dropdown via portal */}
      {open && !disabled && search && createPortal(
        <div ref={dropdownRef} onPointerDown={(e) => e.stopPropagation()}>
          {(filtered.length > 0 || onNoResultsClick) && (() => {
            const exactMatch = filtered.some(c => c.nickname.toLowerCase() === search.trim().toLowerCase())
            const showCreate = onNoResultsClick && !exactMatch
            if (filtered.length === 0 && !showCreate) return null
            return (
              <div className="bg-white border border-[#e8eaed] shadow-lg overflow-y-auto" style={{ ...pos, borderRadius: radiusValue }}>
                {filtered.slice(0, MAX_VISIBLE).map(c => (
                  <div
                    key={c.id}
                    className="px-3 py-2 text-[12px] text-[#2b2f36] hover:bg-[#f7f8fa] cursor-pointer flex items-center gap-2"
                    onMouseDown={(e) => { e.preventDefault(); selectItem(c) }}
                  >
                    <span>{c.nickname}</span>
                    {(rightLabelMap?.[c.id] || c.member_type) && (
                      <span className={`text-[10px] ml-auto ${warnLabelIds?.includes(c.id) ? "text-[#e02020]" : "text-[#8f959e]"}`}>{rightLabelMap?.[c.id] || c.member_type}</span>
                    )}
                  </div>
                ))}
                {showCreate && (
                  <div
                    className="px-3 py-2 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff] cursor-pointer text-left border-t border-[#f0f1f2]"
                    onMouseDown={(e) => { e.preventDefault(); onNoResultsClick(search.trim()); setOpen(false); setSearch("") }}
                  >
                    新增用户「{search.trim()}」
                  </div>
                )}
              </div>
            )
          })()}

          {/* No results without onNoResultsClick */}
          {filtered.length === 0 && !onNoResultsClick && (
            <div className="bg-white border border-[#e8eaed] shadow-lg px-3 py-2 text-[12px] text-[#8f959e]" style={{ ...pos, borderRadius: radiusValue }}>
              无匹配结果
            </div>
          )}
        </div>,
        portalContainer || document.body
      )}
    </div>
  )
}
