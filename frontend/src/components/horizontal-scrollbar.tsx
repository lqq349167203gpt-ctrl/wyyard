import { useCallback, useEffect, useRef, useState } from "react"

interface HorizontalScrollbarProps {
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export function HorizontalScrollbar({ scrollRef }: HorizontalScrollbarProps) {
  const [thumb, setThumb] = useState({ width: 40, left: 0 })
  const [visible, setVisible] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth + 1) {
      setVisible(false)
      return
    }
    setVisible(true)
    const thumbWidth = Math.max((clientWidth / scrollWidth) * clientWidth, 40)
    const maxLeft = clientWidth - thumbWidth
    const left = maxLeft > 0 ? (el.scrollLeft / (scrollWidth - clientWidth)) * maxLeft : 0
    setThumb({ width: thumbWidth, left })
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [scrollRef, update])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    const track = trackRef.current
    if (!el || !track) return
    e.preventDefault()
    const rect = track.getBoundingClientRect()
    const maxScroll = el.scrollWidth - el.clientWidth
    const maxLeft = rect.width - thumb.width
    const clickX = e.clientX - rect.left
    const onThumb = clickX >= thumb.left && clickX <= thumb.left + thumb.width

    if (!onThumb && maxLeft > 0) {
      let targetLeft = clickX - thumb.width / 2
      targetLeft = Math.max(0, Math.min(maxLeft, targetLeft))
      el.scrollLeft = (targetLeft / maxLeft) * maxScroll
    }

    const startX = e.clientX
    const startScrollLeft = el.scrollLeft

    const onMove = (ev: MouseEvent) => {
      const el2 = scrollRef.current
      const track2 = trackRef.current
      if (!el2 || !track2) return
      const rect2 = track2.getBoundingClientRect()
      const maxLeft2 = rect2.width - thumb.width
      const maxScroll2 = el2.scrollWidth - el2.clientWidth
      const startThumbLeft = maxScroll2 > 0 ? (startScrollLeft / maxScroll2) * maxLeft2 : 0
      let nextLeft = startThumbLeft + (ev.clientX - startX)
      nextLeft = Math.max(0, Math.min(maxLeft2, nextLeft))
      el2.scrollLeft = maxLeft2 > 0 ? (nextLeft / maxLeft2) * maxScroll2 : 0
    }
    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.userSelect = ""
    }
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [scrollRef, thumb.left, thumb.width])

  if (!visible) return null

  return (
    <div className="h-3 flex items-center shrink-0 select-none">
      <div
        ref={trackRef}
        onMouseDown={onMouseDown}
        className="relative w-full h-2.5 rounded-full bg-[#f0f0f0] cursor-pointer"
      >
        <div
          className="absolute top-0 h-full rounded-full bg-[#c1c1c1] hover:bg-[#a8a8a8] cursor-grab active:cursor-grabbing"
          style={{ width: thumb.width, left: thumb.left }}
        />
      </div>
    </div>
  )
}
