import { useMemo, useRef, useState } from "react"

import { CustomerSearchInput } from "@/components/customer-search-input"
import { NoteFeedbackMeta } from "@/components/visits/note-feedback-meta"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  currentFeedbackPersonName,
  FeedbackPersonSelect,
  feedbackPersonValue,
  type FeedbackPersonOption,
} from "@/components/visits/feedback-person-select"
import { customerApi, customerTagApi, visitNoteApi, type CustomerTag, type FollowUpPerson, type NextFollowUpPlan, type PreviousVisitNeed, type VisitNote, type VisitNoteCategory } from "@/lib/api"
import { formatNoteTime } from "@/lib/note-time"

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

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function noteText(note: VisitNote): string {
  return [(note.need_tags || []).map(tag => tag.name).join("、"), note.content].filter(Boolean).join("\n")
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

function followUpPlan(note: VisitNote | undefined, currentName: string): NextFollowUpPlan {
  return { next_follow_up_person_id: note?.next_follow_up_person_id || "",
    next_follow_up_person: note ? note.next_follow_up_person || "" : currentName,
    next_follow_up_date: note?.next_follow_up_date || "" }
}

export function VisitNoteCell({ visitId, customerId = "", visitDate = "", nickname, title, category, notes, disabled, expanded = false, privateToCreator = false, onNotesChange }: VisitNoteCellProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [savedValue, setSavedValue] = useState("")
  const [needOptions, setNeedOptions] = useState<CustomerTag[]>([])
  const [needTagIds, setNeedTagIds] = useState<string[]>([])
  const [savedNeedTagIds, setSavedNeedTagIds] = useState<string[]>([])
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
  const [followUpPeople, setFollowUpPeople] = useState<FollowUpPerson[]>([])
  const [plan, setPlan] = useState<NextFollowUpPlan>({})
  const [savedPlan, setSavedPlan] = useState<NextFollowUpPlan>({})
  const savingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const persistDraftRef = useRef<() => Promise<void>>(async () => {})
  const latestDraftRef = useRef({ draft, feedbackPerson, plan, needTagIds })
  latestDraftRef.current = { draft, feedbackPerson, plan, needTagIds }
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
    setNeedTagIds((myNote?.need_tags || []).map(tag => tag.id))
    setSavedNeedTagIds((myNote?.need_tags || []).map(tag => tag.id))
    setFeedbackPerson(initialPerson)
    setSavedFeedbackPerson(initialPerson)
    const initialPlan = followUpPlan(myNote, currentActorName)
    setPlan(initialPlan)
    setSavedPlan(initialPlan)
    setShowPrevious(false)
    setPreviousNeed(null)
    setShowVisitPurpose(false)
    setVisitPurpose(null)
    setVisitPurposeError("")
    try {
      const [latestNotes, previous, peopleResult, nextPeopleResult, tagOptions] = await Promise.all([
        refreshNotes(),
        category === "visit_need" && customerId
          ? visitNoteApi.previousVisitNeed(customerId, visitDate, visitId)
          : Promise.resolve(null),
        visitNoteApi.feedbackPeople().catch(() => ({
          current_person: { customer_id: "", name: currentActorName },
          options: currentActorName ? [{ customer_id: "", name: currentActorName }] : [],
        })),
        category === "follow_up" ? visitNoteApi.followUpPeople() : Promise.resolve([]),
        category === "visit_need" ? customerTagApi.list(false, "visit_need") : Promise.resolve([]),
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
      setNeedOptions(tagOptions)
      setNeedTagIds((latestMine?.need_tags || []).map(tag => tag.id))
      setSavedNeedTagIds((latestMine?.need_tags || []).map(tag => tag.id))
      setFeedbackPeople(nextPeople)
      setFeedbackPerson(nextFeedbackPerson)
      setSavedFeedbackPerson(nextFeedbackPerson)
      setFollowUpPeople(nextPeopleResult)
      const nextPlan = followUpPlan(latestMine, currentActorName)
      setPlan(nextPlan)
      setSavedPlan(nextPlan)
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

  const persistDraft = async (planOverride?: NextFollowUpPlan, tagsOverride?: string[]) => {
    const content = draft.trim()
    const selectedPlan = planOverride || plan
    const selectedTags = tagsOverride || needTagIds
    const tagsChanged = category === "visit_need" && JSON.stringify(selectedTags) !== JSON.stringify(savedNeedTagIds)
    const clearingTags = category === "visit_need" && !content && !selectedTags.length && Boolean(myNote) && tagsChanged
    const planChanged = category === "follow_up" && JSON.stringify(selectedPlan) !== JSON.stringify(savedPlan)
    if ((!content && !(category === "visit_need" && selectedTags.length) && !clearingTags) || (content === savedValue.trim() && feedbackPerson === savedFeedbackPerson && !planChanged && !tagsChanged) || !visitId) return
    if (savingRef.current) { pendingSaveRef.current = true; return }
    const selectedPerson = feedbackPeople.find(option => feedbackPersonValue(option) === feedbackPerson)
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      if (clearingTags && myNote) {
        await visitNoteApi.delete(myNote.id)
      } else if (myNote) {
        await visitNoteApi.update(myNote.id, content, selectedPerson ? { id: selectedPerson.customer_id, name: selectedPerson.name } : undefined, category === "follow_up" ? selectedPlan : undefined, category === "visit_need" ? selectedTags : undefined)
      } else {
        await visitNoteApi.create({
          visit_id: visitId,
          category,
          content,
          ...(category === "visit_need" ? { need_tag_ids: selectedTags } : {}),
          feedback_person_id: selectedPerson?.customer_id || "",
          feedback_person: selectedPerson?.name || currentActorName,
          ...(category === "follow_up" ? selectedPlan : {}),
        })
      }
      await refreshNotes()
      const latestDraft = latestDraftRef.current
      if (latestDraft.draft.trim() === content) setDraft(content)
      if (latestDraft.draft.trim() !== content || latestDraft.feedbackPerson !== feedbackPerson
        || (category === "follow_up" && JSON.stringify(latestDraft.plan) !== JSON.stringify(selectedPlan))
        || (category === "visit_need" && JSON.stringify(latestDraft.needTagIds) !== JSON.stringify(selectedTags))) {
        pendingSaveRef.current = true
      }
      setSavedValue(content)
      setSavedNeedTagIds(selectedTags)
      setSavedFeedbackPerson(feedbackPerson)
      setSavedPlan(selectedPlan)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败")
    } finally {
      savingRef.current = false
      setSaving(false)
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        window.setTimeout(() => { void persistDraftRef.current() }, 0)
      }
    }
  }
  persistDraftRef.current = () => persistDraft()

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
      setNeedTagIds([])
      setSavedNeedTagIds([])
      setSavedFeedbackPerson(feedbackPerson)
      const resetPlan = followUpPlan(undefined, currentActorName)
      setPlan(resetPlan)
      setSavedPlan(resetPlan)
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
            {privateToCreator ? noteText(note) : <><span>{feedbackPersonName(note)}</span><span>：{noteText(note)}</span></>}
          </span>
        )) : (
          privateToCreator ? compactText(noteText(latest)) : <>
            <span>{feedbackPersonName(latest)}</span>
            <span>：{compactText(noteText(latest))}</span>
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
            className={`block ${category === "follow_up" ? "w-[360px] max-w-[360px]" : "w-[280px] max-w-[280px]"} rounded-[4px] border-[0.5px] border-[#d3d6db] bg-white px-3 py-2.5 text-[#2b2f36] shadow-md [&>svg]:hidden`}
          >
            <div className="mb-1.5 text-[11px] text-[#8f959e]">{title} · {categoryNotes.length} 条记录 · 点击编辑</div>
            {categoryNotes.map((note) => (
              <div key={note.id} className={`border-b border-[#f0f0f0] py-1 last:border-b-0 ${category === "follow_up" ? "" : "flex items-baseline gap-2"}`}>
                {category === "follow_up" ? <>
                  <div className="text-[12px] leading-5"><NoteFeedbackMeta author={feedbackPersonName(note)} plan={note} inline /></div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5">{noteText(note)}</div>
                </> : <>
                <span className="max-w-[132px] shrink-0 truncate text-[12px] text-[#2b2f36]" title={feedbackPersonName(note)}><span className="font-normal text-[#a4abb4]">反馈：</span>{feedbackPersonName(note)}</span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#2b2f36]">{noteText(note)}</span>
                </>}
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
            {category === "visit_need" && <div className="mb-4">
              <div className="mb-2 text-[12px] text-[#646a73]">来访需求 <span className="text-[11px] text-[#a8b1bd]">（可多选）</span></div>
              <div className="flex flex-wrap gap-2">
                {[...needOptions, ...(myNote?.need_tags || []).filter(tag => !needOptions.some(option => option.id === tag.id))].map(tag => <button key={tag.id} type="button" aria-pressed={needTagIds.includes(tag.id)} disabled={saving} className={`rounded-[4px] border px-2.5 py-1 text-[12px] ${needTagIds.includes(tag.id) ? "border-[#adc4f5] bg-[#f2f6ff] text-[#3370ff]" : "border-[#e5e7eb] bg-white text-[#646a73]"}`} onClick={() => { const next = needTagIds.includes(tag.id) ? needTagIds.filter(id => id !== tag.id) : [...needTagIds, tag.id]; setNeedTagIds(next); void persistDraft(undefined, next) }}>{tag.name}</button>)}
                {!needOptions.length && !myNote?.need_tags?.length && <span className="text-[11px] text-[#a8b1bd]">暂未配置公共来访需求</span>}
              </div>
            </div>}
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
            <div className={`${category === "follow_up" ? "mb-2" : "mb-3"} grid grid-cols-2 gap-3`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-12 shrink-0 text-[12px] text-[#646a73]">反馈人</span>
                <div className="min-w-0 flex-1">
                  <FeedbackPersonSelect options={feedbackPeople} value={feedbackPerson} onChange={setFeedbackPerson} compact />
                </div>
              </div>
            </div>
            {category === "follow_up" && (
              <div className="mb-2 grid grid-cols-2 gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-12 shrink-0 text-[12px] text-[#646a73]">下次跟进</span>
                  <div className="min-w-0 flex-1">
                    <CustomerSearchInput customers={followUpPeople} value={plan.next_follow_up_person || ""} selectionOnly
                      placeholder="搜索昵称" className="h-[26px] text-[12px]"
                      onChange={(value) => {
                        const name = String(value)
                        const person = followUpPeople.find(item => item.nickname === name)
                        setPlan(current => ({ ...current, next_follow_up_person_id: person?.id || "", next_follow_up_person: name }))
                      }}
                      onSelectItem={(person) => {
                        const next = { ...plan, next_follow_up_person_id: person.id, next_follow_up_person: person.nickname }
                        setPlan(next)
                        void persistDraft(next)
                      }} />
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[12px] text-[#646a73]">跟进时间</span>
                  <Input type="date" className={`h-[26px] min-w-0 flex-1 text-[12px] ${plan.next_follow_up_date ? "text-[#2b2f36]" : "text-[#c0c4cc] [&::-webkit-datetime-edit]:text-[#c0c4cc]"}`} value={plan.next_follow_up_date || ""}
                    onChange={event => setPlan(current => ({ ...current, next_follow_up_date: event.target.value }))}
                    onBlur={() => void persistDraft()} />
                </div>
              </div>
            )}
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
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="min-w-0 text-[12px] leading-5"><NoteFeedbackMeta author={feedbackPersonName(note)} plan={note} /></span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-right text-[11px] text-[#a4abb4]">
                          <span className="tabular-nums">{formatNoteTime(note.updated_at || note.created_at)}</span>
                          <span className="max-w-[130px] truncate" title={`${authorName(note)} 创建`}>{authorName(note)}<span className="ml-1 font-normal">创建</span></span>
                        </span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#2b2f36]">{noteText(note)}</div>
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
