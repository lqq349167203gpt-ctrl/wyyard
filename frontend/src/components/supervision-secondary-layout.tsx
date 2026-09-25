import type { ReactNode } from "react"

type SecondaryItem = {
  key: string
  label: string
  badge?: number
}

export function SupervisionSecondaryLayout({
  items,
  activeKey,
  onChange,
  disabled = false,
  children,
}: {
  items: SecondaryItem[]
  activeKey: string
  onChange: (key: string) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <nav aria-label="二级分类" className="relative z-[1] flex h-11 items-center gap-6 overflow-x-auto rounded-t-xl border-b border-[#f0f0f0] bg-white px-4 shadow-[0_1px_3px_rgba(33,38,49,.06)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(item => {
          const active = item.key === activeKey
          return (
            <button
              key={item.key}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(item.key)}
              className={`relative flex h-full shrink-0 items-center gap-1.5 px-0.5 text-[13px] transition-colors ${active ? "font-medium text-[#3370ff]" : "text-[#646a73] hover:text-[#2b2f36]"} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-[#eef4ff] text-[#3370ff]" : "bg-[#f2f3f5] text-[#8f959e]"}`}>{item.badge}</span>
              )}
              {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-sm bg-[#3370ff]" />}
            </button>
          )
        })}
      </nav>
      <div className="min-w-0 [&>*:first-child]:rounded-t-none">{children}</div>
    </div>
  )
}
