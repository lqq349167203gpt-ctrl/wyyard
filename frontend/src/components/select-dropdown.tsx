import { useRef, useCallback, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, X, ChevronRight } from "lucide-react"

import { broadcastPopoverOpen } from "@/lib/popover"

interface Option {
  value: string
  label: string
  rightLabel?: string  // 右侧标签，用于左对齐名称右对齐价格
  groupLabel?: string  // 子菜单分组标题，仅在该组第一项上设置
  children?: Option[]  // 子选项，用于级联菜单
  /** 弱化显示（如「未配置」） */
  muted?: boolean
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
  /** 没选值时的文字颜色（默认 #c0c4cc），用于和旁边的日期框等控件保持一致 */
  placeholderColor?: string
  /** 触发器里只显示选项名称，不带右侧数量（数量留在菜单里看） */
  hideRightLabelInTrigger?: boolean
  portalContainer?: HTMLElement | null
  dropdownWidth?: number
  menuMaxHeight?: number
  singleLineMulti?: boolean
  triggerLabel?: string
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
  placeholderColor?: string
  hideRightLabelInTrigger?: boolean
  portalContainer?: HTMLElement | null
  dropdownWidth?: number
  menuMaxHeight?: number
  singleLineMulti?: boolean
  triggerLabel?: string
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
  placeholderColor,
  hideRightLabelInTrigger = false,
  portalContainer,
  dropdownWidth,
  menuMaxHeight = 200,
  singleLineMulti = false,
  triggerLabel,
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
    const h = menuMaxHeight
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
  }, [dropdownWidth, menuMaxHeight])

  const calcSubMenuPos = useCallback((optEl: HTMLElement, opt: Option) => {
    const menuEl = menuRef.current
    const menuRect = menuEl?.getBoundingClientRect()
    const optRect = optEl.getBoundingClientRect()
    // 宽度按最长标签估算，避免「沟通次数」这类标签被截断
    const longest = (opt.children || []).reduce((max, child) => Math.max(max, child.label.length), 0)
    const subMenuWidth = Math.min(260, Math.max(148, longest * 13 + 32))
    const maxHeight = 260

    const s: React.CSSProperties = {
      position: "fixed",
      zIndex: 2147483647,
      width: subMenuWidth,
    }

    // 二级菜单紧贴一级菜单右侧（重叠 1px，避免中间留缝导致鼠标一移就离开）
    if (menuRect) {
      const spaceRight = window.innerWidth - menuRect.right - 8
      const spaceLeft = menuRect.left - 8

      if (spaceRight >= subMenuWidth) {
        s.left = menuRect.right - 1
      } else if (spaceLeft >= subMenuWidth) {
        s.left = menuRect.left - subMenuWidth + 1
      } else {
        s.left = Math.max(8, window.innerWidth - subMenuWidth - 8)
      }

      // 与鼠标正在悬停的那一项对齐：靠下的分组不用跨过其他项就能碰到子菜单
      let top = optRect.top
      if (window.innerHeight - top - 8 < 140) top = Math.max(8, window.innerHeight - maxHeight - 8)
      s.top = top
      s.maxHeight = Math.min(maxHeight, window.innerHeight - top - 8)
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
      // 通知页面上的其它浮层（比如日期日历）先收起来，避免两个浮层叠着
      broadcastPopoverOpen(rootRef.current)
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
    }, 260)
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
    }, 260)
  }, [])

  const currentLabels = multi && Array.isArray(value)
    ? value.map(v => options.find(o => o.value === v)?.label).filter(Boolean)
    : []
  // 查找当前值的标签（可能在子选项中）
  const findLabel = (opts: Option[], val: string): string | undefined => {
    for (const opt of opts) {
      if (opt.value === val) return !opt.rightLabel || hideRightLabelInTrigger ? opt.label : `${opt.label} ${opt.rightLabel}`
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
        className={`flex items-center justify-between w-full border border-input bg-transparent ${sm ? "h-7 px-2 text-[12px]" : singleLineMulti ? "h-8 px-2 text-[12px]" : "min-h-8 px-2 text-[12px]"} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${buttonClassName}`}
        onMouseDown={handleToggle}
        disabled={disabled}
      >
        {triggerLabel ? (
          <span className="truncate text-[#3370ff]">{triggerLabel}</span>
        ) : multi && currentLabels.length > 0 ? (
          <div
            title={singleLineMulti ? currentLabels.join("、") : undefined}
            className={singleLineMulti
              ? "flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto whitespace-nowrap py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "flex flex-wrap gap-1 py-1"}
          >
            {currentLabels.map((label, i) => (
              <span key={i} className="inline-flex shrink-0 items-center gap-0.5 rounded bg-[#f0f1f2] px-1.5 py-0.5 text-[11px] text-[#2b2f36]">
                {label}
                <button type="button" className="text-[#8f959e] hover:text-[#f54a45]"
                  onMouseDown={(e) => { e.stopPropagation(); const arr = (value as string[]).filter((_, idx) => idx !== i); (onChange as (value: string[]) => void)(arr) }}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={`truncate ${textColor || (currentLabel || (multi && currentLabels.length > 0) ? "text-[#2b2f36]" : `${placeholderColor || "text-[#c0c4cc]"} font-normal`)}`}>
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
          {/* overscroll-contain：菜单滚到底不要把滚动传给页面 */}
          <div ref={menuRef} data-dropdown className="overscroll-contain bg-white border border-[#e8e8e8] shadow-lg overflow-y-auto" style={{ ...pos, borderRadius: radiusValue, scrollbarColor: "rgba(0,0,0,0.15) transparent" }}>
            {options.map((opt, index) => {
              const isSelected = multi && Array.isArray(value) ? value.includes(opt.value) : false
              const hasChildren = opt.children && opt.children.length > 0
              const isHovered = hoveredOption?.value === opt.value
              const groupTitle = opt.groupLabel && opt.groupLabel !== options[index - 1]?.groupLabel ? opt.groupLabel : ""
              return (
                <div key={opt.value}>
                {groupTitle && <div className="bg-[#f7f8fa] px-2 py-1 text-[11px] text-[#8f959e]">{groupTitle}</div>}
                <div
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
                      {/* flex-1 + text-left：多选带勾选框时名字也要贴在左边，不能被 justify-between 挤到中间 */}
                      <span className={`min-w-0 flex-1 truncate text-left ${opt.muted ? "text-[#a8b1bd]" : ""}`}>{opt.label}</span>
                      <span className="text-[#8f959e] ml-2 shrink-0">{opt.rightLabel}</span>
                    </>
                  ) : (
                    <span className={`min-w-0 flex-1 truncate text-left ${opt.muted ? "text-[#a8b1bd]" : ""}`}>{opt.label}</span>
                  )}
                  {hasChildren && <ChevronRight className="h-3 w-3 text-[#8f959e] ml-1 shrink-0" />}
                </div>
                </div>
              )
            })}
          </div>
          {hoveredOption?.children && hoveredOption.children.length > 0 && (
            <div ref={subMenuRef} data-dropdown
              className="overscroll-contain bg-white rounded-r-md border border-l-0 border-[#e8e8e8] overflow-y-auto"
              style={{ ...subMenuPos, scrollbarColor: "rgba(0,0,0,0.15) transparent" }}
              onMouseEnter={handleSubMenuMouseEnter}
              onMouseLeave={handleSubMenuMouseLeave}
            >
              {hoveredOption.children.map((child) => {
                const isSelected = multi && Array.isArray(value) ? value.includes(child.value) : false
                return (
                  <div key={child.value}>
                    {child.groupLabel && (
                      <div className="bg-[#f7f8fa] px-2 py-1.5 text-[11px] text-[#8f959e]">
                        {child.groupLabel}
                      </div>
                    )}
                    <button
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
                  </div>
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
