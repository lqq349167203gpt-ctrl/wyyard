import type { KeyboardEventHandler } from "react"

export function useEnterToNext(): { onKeyDown: KeyboardEventHandler<HTMLElement> } {
  return {
    onKeyDown: (e) => {
      if (e.key !== "Enter") return
      const target = e.target as HTMLElement
      if (!(target instanceof HTMLElement)) return
      const tag = target.tagName
      const isFormField = tag === "INPUT" || tag === "TEXTAREA" || (tag === "BUTTON" && !!target.closest("[data-dropdown]"))
      if (!isFormField) return
      e.preventDefault()
      const focusable = Array.from(
        e.currentTarget.querySelectorAll("input, textarea, [data-dropdown] > button")
      )
      const idx = focusable.indexOf(target)
      if (idx >= 0 && idx < focusable.length - 1) {
        const next = focusable[idx + 1] as HTMLElement
        next.focus()
        if (next.tagName === "INPUT" && "select" in next) (next as HTMLInputElement).select()
      }
    },
  }
}
