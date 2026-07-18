import { useRef, useCallback, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, X, ChevronRight } from "lucide-react"

interface Option {
  value: string
  label: string
  rightLabel?: string  // 右侧标签，用于左对齐名称右对齐价格
  children?: Option[]  // 子选项，用于级联菜单
}

interface SelectDropdownSingleProps {
  value: string
  options: Option[]
  placeholder?: string
  onChange: (value: string) => void
  className?: string
  buttonClassName?: string
  rounded?: string
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
  buttonClassName?: string
  rounded?: string
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

export function SelectDropdown({
  value,
  options,
  placeholder = "请选择",
  onChange,
  className = "",
  buttonClassName = "",
  rounded = "[4px]",
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
  const subMenuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<React.CSSProperties>({})
  const [hoveredOption, setHoveredOption] = useState<Option | null>(null)
  const [subMenuPos, setSubMenuPos] = useState<React.CSSProperties>({})
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setHoveredOption(null)
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
      zIndex: 2147483647,
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

  const calcSubMenuPos = useCallback((optEl: HTMLElement, opt: Option) => {
    const menuEl = menuRef.current
    const menuRect = menuEl?.getBoundingClientRect()
    const subMenuWidth = 120
    const h = 200

    const s: React.CSSProperties = {
      position: "fixed",
      zIndex: 2147483647,
      width: subMenuWidth,
    }

    // 二级菜单紧挨着一级菜单右侧，垂直位置与一级菜单顶部对齐
    if (menuRect) {
      const spaceRight = window.innerWidth - menuRect.right - 8
      const spaceLeft = menuRect.left - 8

      if (spaceRight >= subMenuWidth) {
        s.left = menuRect.right - 0.5
      } else if (spaceLeft >= subMenuWidth) {
        s.left = menuRect.left - subMenuWidth + 0.5
      } else {
        s.left = menuRect.right - 0.5
      }

      // 垂直位置与一级菜单顶部对齐
      const below = window.innerHeight - menuRect.top
      const above = menuRect.bottom
      if (below >= h || below >= above) {
        s.top = menuRect.top
        s.maxHeight = Math.min(h, below - 8)
      } else {
        s.bottom = window.innerHeight - menuRect.bottom
        s.maxHeight = Math.min(h, above - 8)
      }
    }

    setSubMenuPos(s)
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
    const h = (e: Event) => {
      const target = e.target as HTMLElement
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      if (subMenuRef.current?.contains(target)) return
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

  const handleMouseEnter = useCallback((opt: Option, e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (opt.children && opt.children.length > 0) {
      setHoveredOption(opt)
      calcSubMenuPos(e.currentTarget as HTMLElement, opt)
    } else {
      setHoveredOption(null)
    }
  }, [calcSubMenuPos])

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredOption(null)
    }, 150)
  }, [])

  const handleSubMenuMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }, [])

  const handleSubMenuMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredOption(null)
    }, 150)
  }, [])

  const currentLabels = multi && Array.isArray(value)
    ? value.map(v => options.find(o => o.value === v)?.label).filter(Boolean)
    : []
  // 查找当前值的标签（可能在子选项中）
  const findLabel = (opts: Option[], val: string): string | undefined => {
    for (const opt of opts) {
      if (opt.value === val) return opt.rightLabel ? `${opt.label} ${opt.rightLabel}` : opt.label
      if (opt.children) {
        const found = findLabel(opt.children, val)
        if (found) return found
      }
    }
    return undefined
  }
  const currentLabel = multi ? "" : findLabel(options, value as string)
  const sm = size === "sm"
  const radiusValue = rounded.startsWith("[") ? rounded.slice(1, -1) : rounded

  return (
    <div ref={rootRef} data-dropdown className={`relative ${className}`}>
      <button type="button"
        style={{ borderRadius: radiusValue }}
        className={`flex items-center justify-between w-full border border-input bg-transparent ${sm ? "h-7 px-2 text-[12px]" : "min-h-8 px-2 text-[12px]"} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${buttonClassName}`}
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
          <span className={`truncate ${textColor || (currentLabel || (multi && currentLabels.length > 0) ? "text-[#2b2f36]" : "text-[#c0c4cc] font-normal")}`}>
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
        <>
          <div ref={menuRef} className="bg-white border border-[#e8e8e8] shadow-lg overflow-y-auto" style={{ ...pos, borderRadius: radiusValue, scrollbarColor: "rgba(0,0,0,0.15) transparent" }}>
            {options.map((opt) => {
              const isSelected = multi && Array.isArray(value) ? value.includes(opt.value) : false
              const hasChildren = opt.children && opt.children.length > 0
              const isHovered = hoveredOption?.value === opt.value
              return (
                <div key={opt.value}
                  className={`flex items-center justify-between w-full text-left truncate ${sm ? "px-2 py-1.5 text-[12px]" : "px-2 py-2 text-[12px]"} ${isSelected && !hideSelectedStyle ? "bg-[#f0f5ff] text-[#3370ff]" : ""} ${isHovered ? "bg-[#f7f8fa]" : "hover:bg-[#f7f8fa]"} cursor-pointer`}
                  onMouseDown={hasChildren ? undefined : () => select(opt.value)}
                  onMouseEnter={(e) => handleMouseEnter(opt, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  {multi && !hideCheckbox && (
                    <span className={`inline-block w-4 h-4 mr-2 rounded border align-middle ${isSelected ? "bg-[#3370ff] border-[#3370ff]" : "border-[#d0d3d6]"}`}>
                      {isSelected && <span className="text-white text-[10px] leading-4 text-center block">✓</span>}
                    </span>
                  )}
                  {opt.rightLabel ? (
                    <>
                      <span className="truncate">{opt.label}</span>
                      <span className="text-[#8f959e] ml-2 shrink-0">{opt.rightLabel}</span>
                    </>
                  ) : (
                    <span className="flex-1 truncate">{opt.label}</span>
                  )}
                  {hasChildren && <ChevronRight className="h-3 w-3 text-[#8f959e] ml-1 shrink-0" />}
                </div>
              )
            })}
          </div>
          {hoveredOption?.children && hoveredOption.children.length > 0 && (
            <div ref={subMenuRef}
              className="bg-white rounded-r-md border border-l-0 border-[#e8e8e8] overflow-y-auto"
              style={{ ...subMenuPos, scrollbarColor: "rgba(0,0,0,0.15) transparent" }}
              onMouseEnter={handleSubMenuMouseEnter}
              onMouseLeave={handleSubMenuMouseLeave}
            >
              {hoveredOption.children.map((child) => {
                const isSelected = multi && Array.isArray(value) ? value.includes(child.value) : false
                return (
                  <button key={child.value}
                    type="button"
                    className={`block w-full text-left truncate hover:bg-[#f7f8fa] ${sm ? "px-2 py-1.5 text-[12px]" : "px-2 py-2 text-[12px]"} ${isSelected && !hideSelectedStyle ? "bg-[#f0f5ff] text-[#3370ff]" : ""}`}
                    onMouseDown={() => select(child.value)}
                  >
                    {multi && !hideCheckbox && (
                      <span className={`inline-block w-4 h-4 mr-2 rounded border align-middle ${isSelected ? "bg-[#3370ff] border-[#3370ff]" : "border-[#d0d3d6]"}`}>
                        {isSelected && <span className="text-white text-[10px] leading-4 text-center block">✓</span>}
                      </span>
                    )}
                    {child.label}
                  </button>
                )
              })}
            </div>
          )}
        </>,
        portalContainer || document.body
      )}
    </div>
  )
}
