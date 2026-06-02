import { memo, useRef, useCallback, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, X } from "lucide-react"

interface Option {
  value: string
  label: string
}

interface SelectDropdownProps {
  value: string
  options: Option[]
  placeholder?: string
  onChange: (value: string) => void
  className?: string
  size?: "default" | "sm"
  disabled?: boolean
  clearable?: boolean
}

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
}: SelectDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
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
      width: r.width,
      zIndex: 9999,
    }
    if (below >= h || below >= above) {
      s.top = r.bottom + 4
      s.maxHeight = Math.min(h, below - 8)
    } else {
      s.bottom = window.innerHeight - r.top + 4
      s.maxHeight = Math.min(h, above - 8)
    }
    setPos(s)
  }, [])

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
    const h = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown]")) return
      close()
    }
    const t = setTimeout(() => document.addEventListener("mousedown", h), 0)
    return () => { clearTimeout(t); document.removeEventListener("mousedown", h) }
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
    onChange(v)
    close()
  }, [onChange, close])

  const currentLabel = options.find(o => o.value === value)?.label
  const sm = size === "sm"

  return (
    <div ref={rootRef} data-dropdown className={`relative ${className}`}>
      <button type="button"
        className={`flex items-center justify-between w-full rounded-md border border-input bg-transparent ${sm ? "h-7 px-2 text-[11px]" : "h-8 px-2 text-[12px]"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onMouseDown={handleToggle}
        disabled={disabled}
      >
        <span className={`truncate ${currentLabel ? "text-[#2b2f36]" : "text-[#8f959e]"}`}>
          {currentLabel || placeholder}
        </span>
        <span className="flex items-center shrink-0 ml-1">
          {clearable && currentLabel && (
            <button
              type="button"
              className="text-[#8f959e] hover:text-[#f54a45] mr-0.5"
              onMouseDown={(e) => { e.stopPropagation(); onChange("") }}
            >
              <X className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          )}
          <ChevronDown className={`${sm ? "h-3 w-3" : "h-3.5 w-3.5"} text-[#8f959e]`} />
        </span>
      </button>

      {open && createPortal(
        <div className="bg-white rounded-md border border-[#e8e8e8] shadow-lg overflow-y-auto" style={pos}>
          {options.map((opt) => (
            <button key={opt.value}
              type="button"
              className={`block w-full text-left truncate hover:bg-[#f7f8fa] ${sm ? "px-2 py-1.5 text-[11px]" : "px-2 py-2 text-[12px]"}`}
              onMouseDown={() => select(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
})
