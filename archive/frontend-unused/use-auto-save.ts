import { useRef, useEffect, useCallback, useState } from "react"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

interface UseAutoSaveOptions<T extends Record<string, any>> {
  data: T
  onCreate: (data: Partial<T>) => Promise<{ id: string }>
  onUpdate: (id: string, data: Partial<T>) => Promise<any>
  entityId: string | null
  debounceMs?: number
  /** 该字段非空时触发 create（默认 "nickname"） */
  createTriggerField?: string
  /** create 时需要的额外字段（如 space_id, created_by） */
  buildCreatePayload?: (data: T) => Partial<T>
  /** 保存前转换数据（如合并 age + age_range） */
  transform?: (data: T, changedFields: Record<string, any>) => Record<string, any>
  /** 跳过保存的字段（如 age_range，已合并到 age） */
  skipFields?: string[]
}

export function useAutoSave<T extends Record<string, any>>({
  data,
  onCreate,
  onUpdate,
  entityId: initialEntityId,
  debounceMs = 1000,
  createTriggerField = "nickname",
  buildCreatePayload,
  transform,
  skipFields = [],
}: UseAutoSaveOptions<T>) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [entityId, setEntityId] = useState<string | null>(initialEntityId)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef<Record<string, any>>({})
  const entityIdRef = useRef<string | null>(initialEntityId)
  const dataRef = useRef<T>(data)
  const creatingRef = useRef(false)

  // 同步外部 entityId 变化
  useEffect(() => {
    if (initialEntityId && initialEntityId !== entityIdRef.current) {
      entityIdRef.current = initialEntityId
      setEntityId(initialEntityId)
    }
  }, [initialEntityId])

  // 始终保持最新 data 引用
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const diffFields = useCallback((prev: Record<string, any>, next: Record<string, any>) => {
    const changed: Record<string, any> = {}
    for (const key of Object.keys(next)) {
      if (skipFields.includes(key)) continue
      if (prev[key] !== next[key]) {
        changed[key] = next[key]
      }
    }
    return changed
  }, [skipFields])

  const doSave = useCallback(async () => {
    const current = dataRef.current
    const id = entityIdRef.current

    // 新建模式：需要先 create
    if (!id) {
      const triggerValue = (current[createTriggerField] || "").trim()
      if (!triggerValue) return // 昵称为空，不创建
      if (creatingRef.current) return

      creatingRef.current = true
      setSaveStatus("saving")
      setErrorMessage(null)
      try {
        const payload = buildCreatePayload ? buildCreatePayload(current) : { ...current }
        const result = await onCreate(payload as Partial<T>)
        entityIdRef.current = result.id
        setEntityId(result.id)
        // 更新快照为当前数据
        snapshotRef.current = { ...current }
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch (e) {
        setSaveStatus("error")
        setErrorMessage(e instanceof Error ? e.message : "创建失败")
      } finally {
        creatingRef.current = false
      }
      return
    }

    // 编辑模式：diff 后 update
    const changed = diffFields(snapshotRef.current, current)
    if (Object.keys(changed).length === 0) return

    const toSave = transform ? transform(current, changed) : changed
    if (Object.keys(toSave).length === 0) return

    setSaveStatus("saving")
    setErrorMessage(null)
    try {
      await onUpdate(id, toSave as Partial<T>)
      snapshotRef.current = { ...current }
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (e) {
      setSaveStatus("error")
      setErrorMessage(e instanceof Error ? e.message : "保存失败")
    }
  }, [createTriggerField, buildCreatePayload, onCreate, onUpdate, diffFields, transform])

  // 数据变化时触发 debounced 保存
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      doSave()
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data, debounceMs, doSave])

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    await doSave()
  }, [doSave])

  return { saveStatus, errorMessage, entityId, saveNow }
}
