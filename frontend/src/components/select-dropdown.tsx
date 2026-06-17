import { memo, useRef, useCallback, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, X } from "lucide-react"

interface Option {
  value: string
  label: string
}

interface SelectDropdownSingleProps {
  value: string
  options: Option[]
  placeholder?: string
  onChange: (value: string) => void
  className?: string
  size?: "default" | "sm"
  disabled?: boolean
  clearable?: boolean
  multi?: false
  hideCheckbox?: boolean
  hideSelectedStyle?: boolean
  hideChevron?: boolean
  textColor?: string
  portalContainer?: HTMLElement | null
  dropdownWidth?: number
}

interface SelectDropdownMultiProps {
  value: string[]
  options: Option[]
  placeholder?: string
  onChange: (value: string[]) => void
  className?: string
  size?: "default" | "sm"
  disabled?: boolean
  clearable?: boolean
  multi: true
  hideCheckbox?: boolean
  hideSelectedStyle?: boolean
  hideChevron?: boolean
  textColor?: string
  portalContainer?: HTMLElement | null
  dropdownWidth?: number
}

type SelectDropdownProps = SelectDropdownSingleProps | SelectDropdownMultiProps

let activeClose: (() => void) | null = null

export const SelectDropdown = memo(function SelectDropdown({
  value,
  options,
  placeholder = "请选择",
  onChange,
  className = "",
  size = "default",
  disabled = false,
  clearable = false,
  multi = false,
  hideCheckbox = false,
  hideSelectedStyle = false,
  hideChevron = false,
  textColor,
  portalContainer,
  dropdownWidth,
}: SelectDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<React.CSSProperties>({})

  const close = useCallback(() => {
    setOpen(false)
    activeClose = null
  }, [])

  const calcPos = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const h = 200
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

  const handleToggle = useCallback(() => {
    if (disabled) return
    if (open) {
      close()
    } else {
      activeClose?.()
      activeClose = close
      calcPos()
      setOpen(true)
    }
  }, [open, close, calcPos, disabled])

  // 外部点击关闭
  useEffect(() => {
    if (!open) return
    const h = (e: Event) => {
      const target = e.target as HTMLElement
      // 点击当前下拉框自身（触发按钮或菜单项）不关闭
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      // 点击其他区域一律关闭
      close()
    }
    const t = setTimeout(() => {
      document.addEventListener("mousedown", h)
      document.addEventListener("pointerdown", h)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener("mousedown", h)
      document.removeEventListener("pointerdown", h)
    }
  }, [open, close])

  // 滚动更新位置
  useEffect(() => {
    if (!open) return
    window.addEventListener("scroll", calcPos, true)
    window.addEventListener("resize", calcPos)
    return () => {
      window.removeEventListener("scroll", calcPos, true)
      window.removeEventListener("resize", calcPos)
    }
  }, [open, calcPos])

  const select = useCallback((v: string) => {
    if (multi) {
      const arr = Array.isArray(value) ? value : []
      const newVal = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
      ;(onChange as (value: string[]) => void)(newVal)
    } else {
      ;(onChange as (value: string) => void)(v)
      close()
    }
  }, [multi, value, onChange, close])

  const currentLabels = multi && Array.isArray(value)
    ? value.map(v => options.find(o => o.value === v)?.label).filter(Boolean)
    : []
  const currentLabel = multi ? "" : options.find(o => o.value === (value as string))?.label
  const sm = size === "sm"

  return (
    <div ref={rootRef} data-dropdown className={`relative ${className}`}>
      <button type="button"
        className={`flex items-center justify-between w-full rounded-md border border-input bg-transparent ${sm ? "h-7 px-2 text-[12px]" : "min-h-8 px-2 text-[12px]"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onMouseDown={handleToggle}
        disabled={disabled}
      >
        {multi && currentLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1 py-1">
            {currentLabels.map((label, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f0f1f2] text-[11px] text-[#2b2f36]">
                {label}
                <button type="button" className="text-[#8f959e] hover:text-[#f54a45]"
                  onMouseDown={(e) => { e.stopPropagation(); const arr = (value as string[]).filter((_, idx) => idx !== i); (onChange as (value: string[]) => void)(arr) }}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={`truncate ${textColor || (currentLabel || (multi && currentLabels.length > 0) ? "text-[#2b2f36]" : "text-[#8f959e]")}`}>
            {currentLabel || (multi ? placeholder : placeholder)}
          </span>
        )}
        <span className="flex items-center shrink-0 ml-1">
          {clearable && !multi && currentLabel && (
            <button
              type="button"
              className="text-[#8f959e] hover:text-[#f54a45] mr-0.5"
              onMouseDown={(e) => { e.stopPropagation(); (onChange as (value: string) => void)("") }}
            >
              <X className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          )}
          {!hideChevron && <ChevronDown className={`${sm ? "h-3 w-3" : "h-3.5 w-3.5"} text-[#8f959e]`} />}
        </span>
      </button>

      {open && createPortal(
        <div ref={menuRef} className="bg-white rounded-md border border-[#e8e8e8] shadow-lg overflow-y-auto" style={pos}>
          {options.map((opt) => {
            const isSelected = multi && Array.isArray(value) ? value.includes(opt.value) : false
            return (
              <button key={opt.value}
                type="button"
                className={`block w-full text-left truncate hover:bg-[#f7f8fa] ${sm ? "px-2 py-1.5 text-[12px]" : "px-2 py-2 text-[12px]"} ${isSelected && !hideSelectedStyle ? "bg-[#f0f5ff] text-[#3370ff]" : ""}`}
                onMouseDown={() => select(opt.value)}
              >
                {multi && !hideCheckbox && (
                  <span className={`inline-block w-4 h-4 mr-2 rounded border align-middle ${isSelected ? "bg-[#3370ff] border-[#3370ff]" : "border-[#d0d3d6]"}`}>
                    {isSelected && <span className="text-white text-[10px] leading-4 text-center block">✓</span>}
                  </span>
                )}
                {opt.label}
              </button>
            )
          })}
        </div>,
        portalContainer || document.body
      )}
    </div>
  )
})
