import { useMemo, useRef, useState } from "react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { visitNoteApi, type VisitNote, type VisitNoteCategory } from "@/lib/api"

interface VisitNoteCellProps {
  visitId: string
  nickname: string
  title: string
  category: VisitNoteCategory
  notes: VisitNote[]
  disabled?: boolean
  expanded?: boolean
  privateToCreator?: boolean
  onNotesChange: (notes: VisitNote[]) => void
}

function formatTime(value: string): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function authorKey(note: VisitNote): string {
  return note.created_by_id || note.created_by || note.id
}

function authorName(note: VisitNote): string {
  const name = (note.created_by || "").trim()
  return name && name !== "历史记录" ? name : "未知"
}

export function VisitNoteCell({ visitId, nickname, title, category, notes, disabled, expanded = false, privateToCreator = false, onNotesChange }: VisitNoteCellProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [savedValue, setSavedValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const savingRef = useRef(false)

  const categoryNotes = useMemo(() => {
    const seenAuthors = new Set<string>()
    return notes.filter((note) => {
      if (note.category !== category) return false
      if (privateToCreator && !note.can_edit) return false
      const key = authorKey(note)
      if (seenAuthors.has(key)) return false
      seenAuthors.add(key)
      return true
    })
  }, [category, notes, privateToCreator])
  const latest = categoryNotes[0]
  const myNote = categoryNotes.find((note) => note.can_edit)
  const colleagueNotes = categoryNotes.filter((note) => !note.can_edit)

  const refreshNotes = async (): Promise<VisitNote[]> => {
    if (!visitId) return []
    const latestNotes = await visitNoteApi.list(visitId)
    onNotesChange(latestNotes)
    return latestNotes
  }

  const openPanel = async () => {
    if (!visitId || disabled) return
    setOpen(true)
    setError("")
    const initialValue = myNote?.content || ""
    setDraft(initialValue)
    setSavedValue(initialValue)
    try {
      const latestNotes = await refreshNotes()
      const latestMine = latestNotes.find((note) => note.category === category && note.can_edit)
      const nextValue = latestMine?.content || ""
      setDraft(nextValue)
      setSavedValue(nextValue)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败")
    }
  }

  const persistDraft = async () => {
    const content = draft.trim()
    if (!content || content === savedValue.trim() || !visitId || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      if (myNote) await visitNoteApi.update(myNote.id, content)
      else await visitNoteApi.create({ visit_id: visitId, category, content })
      await refreshNotes()
      setDraft(content)
      setSavedValue(content)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const clearMine = async () => {
    if (!myNote || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      await visitNoteApi.delete(myNote.id)
      await refreshNotes()
      setDraft("")
      setSavedValue("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清空失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const cell = (
    <button
      type="button"
      disabled={!visitId || disabled}
      onClick={openPanel}
      className={`flex min-h-7 w-full min-w-0 gap-1.5 rounded-[4px] border-[0.5px] border-[#e8eaed] bg-white px-2 text-left text-[12px] ${expanded ? "items-start py-1" : "h-7 items-center"} ${!visitId || disabled ? "cursor-not-allowed text-[#c9cdd4]" : "cursor-pointer text-[#2b2f36] hover:border-[#3370ff]"}`}
      title={!visitId ? "请先保存邀约记录" : undefined}
    >
      <span className={`min-w-0 flex-1 ${expanded ? "flex flex-col gap-1" : "truncate"} ${latest ? "text-[#2b2f36]" : "text-[#c9cdd4]"}`}>
        {latest ? expanded ? categoryNotes.map((note) => (
          <span key={note.id} className="whitespace-pre-wrap break-words leading-5">
            {privateToCreator ? note.content : <><span>{authorName(note)}</span><span>：{note.content}</span></>}
          </span>
        )) : (
          privateToCreator ? compactText(latest.content) : <>
            <span>{authorName(latest)}</span>
            <span>：{compactText(latest.content)}</span>
          </>
        ) : ""}
      </span>
      {!privateToCreator && categoryNotes.length > 0 && (
        <span className={`shrink-0 text-[11px] tabular-nums text-[#8f959e] ${expanded ? "mt-0.5" : ""}`}>{categoryNotes.length}人</span>
      )}
    </button>
  )

  return (
    <>
      {categoryNotes.length > 0 && !disabled && !privateToCreator ? (
        <Tooltip>
          <TooltipTrigger render={cell} />
          <TooltipContent
            side="bottom"
            align="start"
            sideOffset={5}
            className="block w-[280px] max-w-[280px] rounded-[4px] border-[0.5px] border-[#d3d6db] bg-white px-3 py-2.5 text-[#2b2f36] shadow-md [&>svg]:hidden"
          >
            <div className="mb-1.5 text-[11px] text-[#8f959e]">{title} · {categoryNotes.length} 人已填写 · 点击编辑</div>
            {categoryNotes.map((note) => (
              <div key={note.id} className="flex items-baseline gap-2 border-b border-[#f0f0f0] py-1 last:border-b-0">
                <span className="max-w-[64px] shrink-0 truncate text-[12px] text-[#2b2f36]">{authorName(note)}</span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#2b2f36]">{note.content}</span>
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : cell}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) void persistDraft()
          setOpen(nextOpen)
        }}
      >
        <DialogContent className="w-[440px] max-w-[90vw] gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-[18px] py-3">
            <DialogTitle className="text-[14px] font-medium text-[#1f2329]">{nickname || "未命名客户"} · {title}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-[18px] pb-4 pt-3.5">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-[12px] font-medium text-[#1f2329]">我填写的</span>
              <span className="text-[11px] text-[#8f959e]">
                {saving ? "正在保存…" : myNote ? "改完点别处自动保存" : "回车保存"}
                {myNote && (
                  <>
                    <span> · </span>
                    <button
                      type="button"
                      className="text-[#646a73] hover:text-[#3370ff]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void clearMine()}
                    >
                      清空
                    </button>
                  </>
                )}
              </span>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void persistDraft()}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void persistDraft()
                }
              }}
              className="min-h-[64px] w-full resize-none rounded-[4px] border-[0.5px] border-[#d3d6db] bg-white px-2.5 py-2 text-[13px] leading-5 text-[#2b2f36] outline-none placeholder:text-[#c0c4cc] focus:border-[#3370ff]"
              placeholder={privateToCreator ? `填写${title}…` : `写下你观察到的${title}…`}
            />
            {error && <div className="mt-1.5 text-[11px] text-[#c4506a]">{error}</div>}

            {colleagueNotes.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 text-[12px] font-medium text-[#1f2329]">别人填写的</div>
                <div className="border-t border-[#f0f0f0]">
                  {colleagueNotes.map((note) => (
                    <div key={note.id} className="border-b border-[#f0f0f0] py-2 last:border-b-0">
                      <div className="flex items-baseline gap-2">
                        <span className="max-w-[120px] truncate text-[12px] text-[#2b2f36]">{authorName(note)}</span>
                        <span className="text-[11px] tabular-nums text-[#8f959e]">{formatTime(note.updated_at || note.created_at)}</span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#2b2f36]">{note.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
