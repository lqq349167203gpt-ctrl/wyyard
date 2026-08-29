import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { Check, X } from "lucide-react"
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
  /** Compact multi-select display for narrow table columns */
  compactMulti?: boolean
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
  /** Single-select mode only: allow values to be committed only by selecting an existing customer */
  selectionOnly?: boolean
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
  compactMulti = false,
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
  selectionOnly = false,
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
    const h = compactMulti ? 220 : 192
    const below = window.innerHeight - r.bottom
    const above = r.top
    const width = dropdownWidth ?? r.width
    const s: React.CSSProperties = {
      position: "fixed",
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
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
  }, [compactMulti, dropdownWidth])

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
      const nicknameMatch = c.nickname.toLowerCase().includes(q)
      const nameMatch = c.name && c.name.toLowerCase().includes(q)
      if (nicknameMatch || nameMatch) {
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

  const compactOptions = useMemo(() => {
    const seen = new Set<string>()
    return customers.filter((customer) => {
      if (!customer.nickname || seen.has(customer.nickname)) return false
      if (excludeIds.includes(customer.id)) return false
      if (positionFilter && !(customer.positions || []).includes(positionFilter)) return false
      seen.add(customer.nickname)
      return true
    }).sort((a, b) => {
      if (!positionFilter) return 0
      const orderA = a.position_sort_orders?.[positionFilter] ?? 9999
      const orderB = b.position_sort_orders?.[positionFilter] ?? 9999
      return orderA - orderB
    })
  }, [customers, excludeIds, positionFilter])

  const selectItem = (customer: Customer | CustomerLight) => {
    if (multi) {
      onChange([...selectedNames, customer.nickname])
      setSearch("")
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      onChange(customer.nickname)
      if (onSelectItem) {
        onSelectItem(customer as Customer)
      }
      setOpen(false)
      setSearch("")
      inputRef.current?.focus()
    }
  }

  const toggleCompactItem = (customer: Customer | CustomerLight) => {
    if (selectedNames.includes(customer.nickname)) {
      onChange(selectedNames.filter((name) => name !== customer.nickname))
    } else {
      onChange([...selectedNames, customer.nickname])
    }
  }

  const renderMultiInput = () => (
    <input
      key="multi-search-input"
      ref={inputRef}
      className="h-5 w-[60px] shrink-0 border-none bg-transparent text-[12px] outline-none"
      value={search}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => { setSearch(event.target.value); calcPos(); setOpen(true) }}
      onFocus={() => { calcPos(); setOpen(true) }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          // 搜索框的 Enter 不参与 enterToNext 跳焦
          event.stopPropagation()
          return
        }
        if ((event.key === "Backspace" || event.key === "Delete") && search === "" && selectedNames.length > 0) {
          event.preventDefault()
          onChange(selectedNames.slice(0, -1))
        }
      }}
      placeholder={selectedNames.length === 0 ? placeholder : ""}
      disabled={disabled}
      autoComplete="off"
    />
  )

  return (
    <div className="relative" ref={ref}>
      {multi ? (
        // Multi-select: badges inline with search input
        <div
          style={{ borderRadius: radiusValue }}
          className={`h-7 w-full border border-[#e8eaed] bg-white px-1.5 flex items-center ${compactMulti ? "gap-0 overflow-hidden" : "gap-1 overflow-x-auto scrollbar-hide"} ${disabled ? "opacity-50" : ""} ${open ? "border-[#3370ff]" : ""} ${className}`}
          onClick={() => {
            if (disabled) return
            calcPos()
            if (compactMulti) {
              if (open) {
                setOpen(false)
                setSearch("")
              } else {
                setOpen(true)
              }
            } else {
              setOpen(true)
              requestAnimationFrame(() => inputRef.current?.focus())
            }
          }}
        >
          {compactMulti ? (
            <span
              className={`min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] scrollbar-hide ${selectedNames.length > 0 ? "text-[#2b2f36]" : "text-[#c0c4cc]"}`}
              title={selectedNames.join("、")}
            >
              {selectedNames.length > 0 ? selectedNames.join("、") : placeholder}
            </span>
          ) : (
            <>
              {selectedNames.map(name => (
                <span key={name} className="inline-flex shrink-0 items-center rounded bg-[#f5f6f7] px-1 py-0.5 text-[11px] text-[#4e535a]">
                  {name}
                </span>
              ))}
              {renderMultiInput()}
            </>
          )}
        </div>
      ) : (
        // Single select: show input with X clear button
        <div className="relative">
          <Input
            ref={inputRef}
            style={{ borderRadius: radiusValue }}
            value={selectionOnly && open ? search : (typeof value === "string" && value ? value : search)}
            onChange={(e) => {
              const v = e.target.value
              setSearch(v)
              calcPos()
              setOpen(true)
              if (!selectionOnly || !v) onChange(v)
            }}
            onFocus={() => {
              if (selectionOnly) setSearch(typeof value === "string" ? value : "")
              calcPos()
              setOpen(true)
            }}
            onBlur={() => {
              setTimeout(() => {
                if (selectionOnly) {
                  const exactMatch = customers.find((customer) => customer.nickname === search.trim())
                  if (exactMatch) onChange(exactMatch.nickname)
                  setSearch("")
                  setOpen(false)
                  onBlur?.(exactMatch?.nickname || (typeof value === "string" ? value : ""))
                  return
                }
                onBlur?.(typeof value === "string" ? value : "")
              }, 150)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // 搜索框的 Enter 不参与 enterToNext 跳焦
                e.preventDefault()
                e.stopPropagation()
                if (selectionOnly) {
                  const exactMatch = customers.find((customer) => customer.nickname === search.trim())
                  if (exactMatch) selectItem(exactMatch)
                  else {
                    setSearch("")
                    setOpen(false)
                  }
                }
                return
              }
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
      {open && !disabled && compactMulti && createPortal(
        <div
          ref={dropdownRef}
          className="overflow-hidden border border-[#dee0e3] bg-white shadow-md"
          style={{ ...pos, borderRadius: radiusValue }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="grid max-h-[210px] grid-cols-3 gap-1 overflow-y-auto p-2">
            {compactOptions.slice(0, MAX_VISIBLE).map((customer) => {
              const selected = selectedNames.includes(customer.nickname)
              return (
                <button
                  key={customer.id}
                  type="button"
                  title={customer.nickname}
                  className={`flex h-7 min-w-0 items-center gap-1 rounded-[4px] border px-1.5 text-left text-[12px] ${selected
                    ? "border-[#a8c1ff] bg-[#f0f5ff] text-[#3370ff]"
                    : "border-[#e8eaed] bg-white text-[#2b2f36] hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => toggleCompactItem(customer)}
                >
                  <span className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border ${selected ? "border-[#3370ff] bg-[#3370ff]" : "border-[#c9cdd4] bg-white"}`}>
                    {selected && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  <span className="whitespace-nowrap">{customer.nickname}</span>
                </button>
              )
            })}
            {compactOptions.length === 0 && (
              <div className="col-span-3 py-4 text-center text-[12px] text-[#8f959e]">无匹配结果</div>
            )}
          </div>
        </div>,
        portalContainer || document.body
      )}

      {open && !disabled && !compactMulti && search && createPortal(
        <div ref={dropdownRef} onPointerDown={(e) => e.stopPropagation()}>
          {(filtered.length > 0 || onNoResultsClick) && (() => {
            const exactMatch = filtered.some(c => c.nickname.toLowerCase() === search.trim().toLowerCase())
            const showCreate = onNoResultsClick && !exactMatch
            if (filtered.length === 0 && !showCreate) return null
            return (
              <div className="bg-white border border-[#dee0e3] overflow-y-auto" style={{ ...pos, borderRadius: radiusValue }}>
                {filtered.slice(0, MAX_VISIBLE).map(c => {
                  const q = search.toLowerCase()
                  const nameMatch = c.name && c.name.toLowerCase().includes(q) && !c.nickname.toLowerCase().includes(q)
                  return (
                    <div
                      key={c.id}
                      className="px-2 py-1.5 text-[12px] text-[#2b2f36] hover:bg-[#f7f8fa] cursor-pointer flex items-center gap-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseUp={(e) => { e.preventDefault(); selectItem(c) }}
                    >
                      <span>{c.nickname}</span>
                      {nameMatch && <span className="text-[10px] text-[#8f959e]">（{c.name}）</span>}
                      {(rightLabelMap?.[c.id] || c.member_type) && (
                        <span className={`text-[10px] ml-auto ${warnLabelIds?.includes(c.id) ? "text-[#e02020]" : "text-[#8f959e]"}`}>{rightLabelMap?.[c.id] || c.member_type}</span>
                      )}
                    </div>
                  )
                })}
                {showCreate && (
                  <div
                    className="px-2 py-1.5 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff] cursor-pointer text-left border-t border-[#f0f1f2]"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseUp={(e) => { e.preventDefault(); onNoResultsClick(search.trim()); setOpen(false); setSearch("") }}
                  >
                    新增用户「{search.trim()}」
                  </div>
                )}
              </div>
            )
          })()}

          {/* No results without onNoResultsClick */}
          {filtered.length === 0 && !onNoResultsClick && (
            <div className="bg-white border border-[#dee0e3] px-2 py-1.5 text-[12px] text-[#8f959e]" style={{ ...pos, borderRadius: radiusValue }}>
              无匹配结果
            </div>
          )}
        </div>,
        portalContainer || document.body
      )}
    </div>
  )
}
