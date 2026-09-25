import { useMemo, useRef, useState } from "react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  currentFeedbackPersonName,
  FeedbackPersonSelect,
  feedbackPersonValue,
  type FeedbackPersonOption,
} from "@/components/visits/feedback-person-select"
import { customerApi, visitNoteApi, type PreviousVisitNeed, type VisitNote, type VisitNoteCategory } from "@/lib/api"

interface VisitNoteCellProps {
  visitId: string
  customerId?: string
  visitDate?: string
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

function feedbackPersonName(note: VisitNote): string {
  return (note.feedback_person || "").trim() || authorName(note)
}

export function VisitNoteCell({ visitId, customerId = "", visitDate = "", nickname, title, category, notes, disabled, expanded = false, privateToCreator = false, onNotesChange }: VisitNoteCellProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [savedValue, setSavedValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [previousNeed, setPreviousNeed] = useState<PreviousVisitNeed | null>(null)
  const [previousLoading, setPreviousLoading] = useState(false)
  const [showPrevious, setShowPrevious] = useState(false)
  const [visitPurpose, setVisitPurpose] = useState<string | null>(null)
  const [showVisitPurpose, setShowVisitPurpose] = useState(false)
  const [visitPurposeLoading, setVisitPurposeLoading] = useState(false)
  const [visitPurposeError, setVisitPurposeError] = useState("")
  const [feedbackPeople, setFeedbackPeople] = useState<FeedbackPersonOption[]>([])
  const [feedbackPerson, setFeedbackPerson] = useState("")
  const [savedFeedbackPerson, setSavedFeedbackPerson] = useState("")
  const savingRef = useRef(false)
  const currentActorName = useMemo(currentFeedbackPersonName, [])

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
    const initialPerson = myNote
      ? feedbackPersonValue({ customer_id: myNote.feedback_person_id || "", name: feedbackPersonName(myNote) })
      : currentActorName ? `name:${currentActorName}` : ""
    setFeedbackPeople(currentActorName ? [{ customer_id: "", name: currentActorName }] : [])
    setDraft(initialValue)
    setSavedValue(initialValue)
    setFeedbackPerson(initialPerson)
    setSavedFeedbackPerson(initialPerson)
    setShowPrevious(false)
    setPreviousNeed(null)
    setShowVisitPurpose(false)
    setVisitPurpose(null)
    setVisitPurposeError("")
    try {
      const [latestNotes, previous, peopleResult] = await Promise.all([
        refreshNotes(),
        category === "visit_need" && customerId
          ? visitNoteApi.previousVisitNeed(customerId, visitDate, visitId)
          : Promise.resolve(null),
        visitNoteApi.feedbackPeople().catch(() => ({
          current_person: { customer_id: "", name: currentActorName },
          options: currentActorName ? [{ customer_id: "", name: currentActorName }] : [],
        })),
      ])
      const latestMine = latestNotes.find((note) => note.category === category && note.can_edit)
      const nextValue = latestMine?.content || ""
      const preferredPerson: FeedbackPersonOption = latestMine
        ? { customer_id: latestMine.feedback_person_id || "", name: feedbackPersonName(latestMine) }
        : peopleResult.current_person
      const nextPeople = [...peopleResult.options]
      if (preferredPerson.name && !nextPeople.some(option => feedbackPersonValue(option) === feedbackPersonValue(preferredPerson))) {
        nextPeople.unshift(preferredPerson)
      }
      const nextFeedbackPerson = preferredPerson.name ? feedbackPersonValue(preferredPerson) : ""
      setDraft(nextValue)
      setSavedValue(nextValue)
      setFeedbackPeople(nextPeople)
      setFeedbackPerson(nextFeedbackPerson)
      setSavedFeedbackPerson(nextFeedbackPerson)
      setPreviousNeed(previous)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败")
    }
  }

  const togglePrevious = async () => {
    if (showPrevious) {
      setShowPrevious(false)
      return
    }
    setShowPrevious(true)
    if (previousNeed || !customerId || previousLoading) return
    setPreviousLoading(true)
    try {
      setPreviousNeed(await visitNoteApi.previousVisitNeed(customerId, visitDate, visitId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载上次需求失败")
    } finally {
      setPreviousLoading(false)
    }
  }

  const appendPrevious = () => {
    if (!previousNeed?.content) return
    setDraft((current) => {
      const normalized = current.trim()
      if (!normalized) return previousNeed.content
      if (normalized.includes(previousNeed.content.trim())) return current
      return `${normalized}\n${previousNeed.content}`
    })
  }

  const loadVisitPurpose = async () => {
    if (!customerId || visitPurposeLoading) return
    setVisitPurposeLoading(true)
    setVisitPurposeError("")
    try {
      const customer = await customerApi.get(customerId)
      setVisitPurpose((customer.tags || "").trim())
    } catch (reason) {
      setVisitPurpose(null)
      setVisitPurposeError(reason instanceof Error ? reason.message : "加载到访目的失败")
    } finally {
      setVisitPurposeLoading(false)
    }
  }

  const toggleVisitPurpose = async () => {
    if (showVisitPurpose) {
      setShowVisitPurpose(false)
      return
    }
    setShowVisitPurpose(true)
    if (visitPurpose !== null || visitPurposeLoading) return
    await loadVisitPurpose()
  }

  const appendVisitPurpose = () => {
    if (!visitPurpose) return
    setDraft((current) => {
      const normalized = current.trim()
      if (normalized.includes(visitPurpose)) return current
      return normalized ? `${normalized}\n${visitPurpose}` : visitPurpose
    })
  }

  const persistDraft = async () => {
    const content = draft.trim()
    if (!content || (content === savedValue.trim() && feedbackPerson === savedFeedbackPerson) || !visitId || savingRef.current) return
    const selectedPerson = feedbackPeople.find(option => feedbackPersonValue(option) === feedbackPerson)
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      if (myNote) {
        await visitNoteApi.update(myNote.id, content, selectedPerson ? { id: selectedPerson.customer_id, name: selectedPerson.name } : undefined)
      } else {
        await visitNoteApi.create({
          visit_id: visitId,
          category,
          content,
          feedback_person_id: selectedPerson?.customer_id || "",
          feedback_person: selectedPerson?.name || currentActorName,
        })
      }
      await refreshNotes()
      setDraft(content)
      setSavedValue(content)
      setSavedFeedbackPerson(feedbackPerson)
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
      setSavedFeedbackPerson(feedbackPerson)
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
            {privateToCreator ? note.content : <><span>{feedbackPersonName(note)}</span><span>：{note.content}</span></>}
          </span>
        )) : (
          privateToCreator ? compactText(latest.content) : <>
            <span>{feedbackPersonName(latest)}</span>
            <span>：{compactText(latest.content)}</span>
          </>
        ) : ""}
      </span>
      {!privateToCreator && categoryNotes.length > 0 && (
        <span className={`shrink-0 text-[11px] tabular-nums text-[#8f959e] ${expanded ? "mt-0.5" : ""}`}>{categoryNotes.length}条</span>
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
            <div className="mb-1.5 text-[11px] text-[#8f959e]">{title} · {categoryNotes.length} 条记录 · 点击编辑</div>
            {categoryNotes.map((note) => (
              <div key={note.id} className="flex items-baseline gap-2 border-b border-[#f0f0f0] py-1 last:border-b-0">
                <span className="max-w-[132px] shrink-0 truncate text-[12px] text-[#2b2f36]" title={feedbackPersonName(note)}>{feedbackPersonName(note)}</span>
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
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[12px] text-[#646a73]">反馈人</span>
              <FeedbackPersonSelect options={feedbackPeople} value={feedbackPerson} onChange={setFeedbackPerson} />
            </div>
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
              {category === "visit_need" && customerId && (
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    className="text-[11px] text-[#3370ff] hover:text-[#245bdb]"
                    onClick={() => void toggleVisitPurpose()}
                  >
                    {showVisitPurpose ? "收起到访目的" : "引用到访目的"}
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-[#3370ff] hover:text-[#245bdb]"
                    onClick={() => void togglePrevious()}
                  >
                    {showPrevious ? "收起上次需求" : "引用上次需求"}
                  </button>
                </div>
              )}
            </div>
            {category === "visit_need" && showVisitPurpose && (
              <div className="mb-3 rounded-[4px] border-[0.5px] border-[#dce5f8] bg-[#f7f9fc] px-2.5 py-2">
                {visitPurposeLoading ? (
                  <div className="text-[11px] text-[#8f959e]">正在加载到访目的…</div>
                ) : visitPurposeError ? (
                  <button type="button" className="flex w-full items-center justify-between text-left text-[11px] text-[#c4506a]" onClick={() => void loadVisitPurpose()}>
                    <span>{visitPurposeError}</span>
                    <span className="shrink-0 text-[#3370ff]">点击重试</span>
                  </button>
                ) : visitPurpose ? (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-[#8f959e]">客户详情中的到访目的</span>
                      <button type="button" className="shrink-0 text-[11px] text-[#3370ff] hover:text-[#245bdb]" onClick={appendVisitPurpose}>带入本次</button>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-[12px] leading-5 text-[#4e535a]">{visitPurpose}</div>
                  </>
                ) : (
                  <div className="text-[11px] text-[#8f959e]">暂无可引用的到访目的</div>
                )}
              </div>
            )}
            {category === "visit_need" && showPrevious && (
              <div className="mb-3 rounded-[4px] border-[0.5px] border-[#dce5f8] bg-[#f7f9fc] px-2.5 py-2">
                {previousLoading ? (
                  <div className="text-[11px] text-[#8f959e]">正在加载上次需求…</div>
                ) : previousNeed ? (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-[#8f959e]">{previousNeed.visit_date} 的来访需求</span>
                      <button type="button" className="shrink-0 text-[11px] text-[#3370ff] hover:text-[#245bdb]" onClick={appendPrevious}>带入本次</button>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-[12px] leading-5 text-[#4e535a]">{previousNeed.content}</div>
                  </>
                ) : (
                  <div className="text-[11px] text-[#8f959e]">暂无可引用的历史需求</div>
                )}
              </div>
            )}
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
                        <span className="max-w-[150px] truncate text-[12px] text-[#2b2f36]" title={feedbackPersonName(note)}>{feedbackPersonName(note)}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-right text-[11px] text-[#8f959e]">
                          <span className="tabular-nums">{formatTime(note.updated_at || note.created_at)}</span>
                          <span className="max-w-[130px] truncate" title={`创建人：${authorName(note)}`}>创建人：{authorName(note)}</span>
                        </span>
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
