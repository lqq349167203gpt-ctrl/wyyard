import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { customerApi, customerTagApi, type CustomerCreate, type CustomerLight, type CustomerTag } from "@/lib/api"
import { CustomerTagField } from "@/components/customer-tag-editor"

const emptyCustomer: Record<string, any> = {
  nickname: "", name: "", gender: "", phone: "", wechat: "", age: "", age_range: "", referrer: "", referral_date: "",
  follow_up_status: "未配置",
  member_type: "", paid_content: [], visit_count: 0,
  basic_info: "", assessment: "", tags: "", traffic_source: "", traffic_source_detail: "",
}

const UPDATE_FIELDS = [
  "nickname", "name", "gender", "phone", "wechat", "age",
  "service_teacher", "referrer", "referral_date", "referrer_handler",
  "follow_up_status",
  "traffic_source", "traffic_source_detail",
  "work_status", "work_description",
  "basic_info", "assessment", "tags", "other_info",
]

function getTodayDate(): string {
  return new Date().toLocaleDateString("sv-SE")
}

function buildPayload(form: Record<string, any>, changedFields?: Record<string, any>): Record<string, any> {
  const range = form.age_range
  const ageValue = range ? (form.age ? `${form.age} (${range})` : range) : form.age

  const data: Record<string, any> = {}
  const fields = changedFields ? Object.keys(changedFields) : UPDATE_FIELDS
  for (const key of fields) {
    if (!UPDATE_FIELDS.includes(key)) continue
    if (form[key] !== undefined && form[key] !== null) {
      data[key] = form[key]
    }
  }
  data.age = ageValue
  delete data.age_range
  return data
}

export default function CustomerFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const backPath = searchParams.get("back") || "/healing-records"
  const isEdit = !!id
  const enterToNext = useEnterToNext()

  const [form, setForm] = useState<Record<string, any>>(() => ({
    ...emptyCustomer,
    referral_date: id ? "" : getTodayDate(),
  }))
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [referrerError, setReferrerError] = useState("")
  const [referrerHandlerError, setReferrerHandlerError] = useState("")
  const [loading, setLoading] = useState(false)
  const [entityId, setEntityId] = useState<string | null>(id || null)
  const [availableTags, setAvailableTags] = useState<CustomerTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [tagsLoaded, setTagsLoaded] = useState(false)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagLoadError, setTagLoadError] = useState("")
  const initializedRef = useRef(false)
  const initialTagIdsRef = useRef<string[]>([])

  // 加载客户列表（供搜索输入用）
  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => {})
  }, [])

  // 加载草稿或客户数据
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // 新建模式：尝试加载草稿
    if (!id) {
      try {
        const draft = localStorage.getItem("customer-draft-new")
        if (draft) {
          const parsed = JSON.parse(draft)
          if (parsed && Object.keys(parsed).some(k => parsed[k])) {
            setForm(prev => ({
              ...prev,
              ...parsed,
              // 新建页每次进入时默认今天，避免旧草稿中的空值覆盖。
              referral_date: parsed.referral_date || getTodayDate(),
            }))
          }
        }
      } catch {}
      return
    }

    // 编辑模式：从服务器加载
    setLoading(true)
    customerApi.get(id).then(c => {
      const ageParts = (c.age || "").match(/^(\d+)(?:\s*\(([^)]+)\))?$/)
      const isRangeOnly = /^\d+~\d+\+?$|^\d+\+$/.test(c.age || "")
      setForm({
        ...emptyCustomer,
        ...c,
        age: ageParts ? ageParts[1] || "" : isRangeOnly ? "" : c.age || "",
        age_range: ageParts?.[2] || (isRangeOnly ? c.age : ""),
      })
    }).catch(() => {
      alert("加载客户信息失败")
      navigate(backPath)
    }).finally(() => setLoading(false))

  }, [id, navigate, backPath])

  // 新建和编辑页面都加载可选标签；编辑时额外加载客户已有标签。
  useEffect(() => {
    let cancelled = false
    setTagsLoading(true)
    Promise.all([
      customerTagApi.list(),
      id ? customerTagApi.listForCustomer(id) : Promise.resolve([] as CustomerTag[]),
    ])
      .then(([tags, selectedTags]) => {
        if (cancelled) return
        setAvailableTags(tags)
        const selectedIds = selectedTags.map(tag => tag.id)
        setSelectedTagIds(selectedIds)
        initialTagIdsRef.current = selectedIds
        setTagsLoaded(true)
        setTagLoadError("")
      })
      .catch(error => {
        if (cancelled) return
        setTagsLoaded(false)
        setTagLoadError(error instanceof Error ? error.message : "标签加载失败")
      })
      .finally(() => { if (!cancelled) setTagsLoading(false) })
    return () => { cancelled = true }
  }, [id])

  // 草稿本地存储
  const draftKey = id ? `customer-draft-${id}` : "customer-draft-new"
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 保存草稿到 localStorage
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(form)) } catch {}
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [form, draftKey])

  // 保存到服务端
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleSave = useCallback(async () => {
    // 验证引流人/承接人
    if (form.referrer?.trim() && !customers.some(c => c.nickname === form.referrer.trim())) {
      setReferrerError("引流人不存在")
      return
    }
    if (form.referrer_handler?.trim() && !customers.some(c => c.nickname === form.referrer_handler.trim())) {
      setReferrerHandlerError("承接人不存在")
      return
    }

    setSaving(true)
    setFieldErrors({})
    try {
      const payload = buildPayload(form)
      if (!entityId) {
        payload.space_id = localStorage.getItem("selected-space-id") || ""
        const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
        payload.created_by = currentUser.owner || currentUser.username || ""
      }
      if (entityId) {
        await customerApi.update(entityId, payload as Partial<CustomerCreate>)
        const initialTagIds = initialTagIdsRef.current
        const tagsChanged = selectedTagIds.length !== initialTagIds.length
          || selectedTagIds.some(tagId => !initialTagIds.includes(tagId))
        if (tagsLoaded && tagsChanged) await customerTagApi.setForCustomer(entityId, selectedTagIds)
      } else {
        const result = await customerApi.create(payload as Partial<CustomerCreate>)
        if (tagsLoaded && selectedTagIds.length > 0) {
          await customerTagApi.setForCustomer(result.id, selectedTagIds)
        }
        setEntityId(result.id)
        navigate(`/healing-records/${result.id}/edit`, { replace: true })
      }
      localStorage.removeItem(draftKey)
      navigate(backPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败"
      if (msg.includes("昵称")) setFieldErrors({ nickname: msg })
      else if (msg.includes("微信")) setFieldErrors({ wechat: msg })
      else if (msg.includes("手机")) setFieldErrors({ phone: msg })
      else setFieldErrors({ _general: msg })
    } finally {
      setSaving(false)
    }
  }, [form, entityId, navigate, backPath, selectedTagIds, tagsLoaded, customers, draftKey])

  // 引流人/承接人验证（blur 时检查）
  const validateReferrer = (value: string, field: "referrer" | "referrer_handler") => {
    const setError = field === "referrer" ? setReferrerError : setReferrerHandlerError
    if (value.trim() && !customers.some(c => c.nickname === value.trim())) {
      setError(field === "referrer" ? "引流人不存在" : "承接人不存在")
    } else {
      setError("")
    }
  }

  const setField = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full bg-white flex flex-col">
      {/* 顶栏 */}
      <div className="shrink-0 bg-white border-b border-[#f0f0f0]">
        <div className="px-6 h-12 flex items-center gap-3">
          <button onClick={() => navigate(backPath)} className="flex items-center gap-1 text-[13px] text-[#4e535a] hover:text-[#1f2329] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <div className="h-4 w-px bg-[#e0e0e0]" />
          <h1 className="text-[14px] font-medium text-[#1f2329]">
            {isEdit ? `编辑客户 - ${form.nickname || ""}` : "新建客户"}
          </h1>
        </div>
      </div>

      {/* 表单 */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 pb-20" {...enterToNext}>
        {/* 基本信息 */}
        <div className="space-y-3">
          <h2 className="text-[13px] font-normal text-[#1f2329]">基本信息</h2>
          <div className="flex flex-wrap gap-x-[14px] gap-y-3 pl-[15px]">
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">昵称</label>
                <Input value={form.nickname || ""} onChange={(e) => { setField("nickname", e.target.value); setFieldErrors(prev => { const { nickname, ...rest } = prev; return rest }) }} placeholder="请输入" className="w-[200px]" />
              </div>
              {fieldErrors.nickname && <p className="text-[11px] text-[#f54a45] mt-0.5 ml-[60px]">{fieldErrors.nickname}</p>}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">姓名</label>
              <Input value={form.name || ""} onChange={(e) => setField("name", e.target.value)} placeholder="请输入" className="w-[200px]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">性别</label>
              <SelectDropdown value={form.gender || ""} options={[{value: "男", label: "男"}, {value: "女", label: "女"}]} placeholder="请选择" onChange={(v) => setField("gender", v)} className="w-[200px]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">年龄</label>
              <div className="flex">
                <Input value={form.age || ""} onChange={(e) => { const v = e.target.value; const n = parseInt(v); let range = ""; if (n >= 60) range = "60+"; else if (n >= 51) range = "51~60"; else if (n >= 41) range = "41~50"; else if (n >= 31) range = "31~40"; else if (n >= 18) range = "18~30"; setForm({ ...form, age: v, age_range: range }); }} placeholder="年龄" className="w-[100px]" rounded="4px 0 0 4px" />
                <SelectDropdown value={form.age_range || ""} options={["18~30", "31~40", "41~50", "51~60", "60+"].map(v => ({value: v, label: v}))} placeholder="年龄段" onChange={(v) => setField("age_range", v)} className="w-[100px]" rounded="0 4px 4px 0" buttonClassName="border-l-0" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">微信</label>
                <Input value={form.wechat || ""} onChange={(e) => { setField("wechat", e.target.value); setFieldErrors(prev => { const { wechat, ...rest } = prev; return rest }) }} placeholder="请输入" className="w-[200px]" />
              </div>
              {fieldErrors.wechat && <p className="text-[11px] text-[#f54a45] mt-0.5 ml-[60px]">{fieldErrors.wechat}</p>}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">电话</label>
                <Input value={form.phone || ""} onChange={(e) => { setField("phone", e.target.value); setFieldErrors(prev => { const { phone, ...rest } = prev; return rest }) }} placeholder="请输入" className="w-[200px]" />
              </div>
              {fieldErrors.phone && <p className="text-[11px] text-[#f54a45] mt-0.5 ml-[60px]">{fieldErrors.phone}</p>}
            </div>
            <div className="flex items-center gap-2 w-full">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">工作情况</label>
              <SelectDropdown value={form.work_status || ""} options={[{ value: "在职", label: "在职" }, { value: "离职", label: "离职" }, { value: "自由职业", label: "自由职业" }]} placeholder="是否在职" onChange={(v) => setField("work_status", v)} className="w-[100px]" />
              <Input value={form.work_description || ""} onChange={(e) => setField("work_description", e.target.value)} placeholder="工作情况详情..." className="flex-1 mr-[96px]" />
            </div>
          </div>
        </div>

        <div className="border-t border-[#f0f0f0]" />

        {/* 流量情况 */}
        <div>
          <h2 className="mb-3 text-[13px] font-normal text-[#1f2329]">流量情况</h2>
          <div className="flex flex-wrap gap-x-[14px] gap-y-3 pl-[15px]">
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">引流人</label>
                <div className="w-[200px]">
                  <CustomerSearchInput customers={customers} value={form.referrer || ""} onChange={(v) => { setField("referrer", typeof v === "string" ? v : v[0] || ""); setReferrerError("") }} placeholder="请搜索" excludeIds={form.id ? [form.id] : []} filterSelected={false} onBlur={() => validateReferrer(form.referrer || "", "referrer")} />
                </div>
              </div>
              {referrerError && <p className="text-[11px] text-[#f54a45] mt-0.5 ml-[60px]">{referrerError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">引流日期</label>
              <Input
                type="date"
                value={form.referral_date || ""}
                onChange={(e) => setField("referral_date", e.target.value)}
                className={`w-[200px] ${form.referral_date ? "" : "date-empty"}`}
                style={{ color: form.referral_date ? "#2b2f36" : "#c0c4cc" }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">承接人</label>
                <div className="w-[200px]">
                  <CustomerSearchInput customers={customers} value={form.referrer_handler || ""} onChange={(v) => { setField("referrer_handler", typeof v === "string" ? v : v[0] || ""); setReferrerHandlerError("") }} placeholder="请搜索" excludeIds={form.id ? [form.id] : []} filterSelected={false} onBlur={() => validateReferrer(form.referrer_handler || "", "referrer_handler")} />
                </div>
              </div>
              {referrerHandlerError && <p className="text-[11px] text-[#f54a45] mt-0.5 ml-[60px]">{referrerHandlerError}</p>}
            </div>
            <div className="flex basis-full items-center gap-2">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">流量来源</label>
              <SelectDropdown
                className="w-[200px]"
                value={form.traffic_source || ""}
                options={["小红书", "抖音", "公众号", "视频号", "朋友圈", "美团", "大众点评", "好友推荐", "粗门"].map(v => ({value: v, label: v}))}
                placeholder="请选择"
                menuMaxHeight={304}
                onChange={(v) => setForm({ ...form, traffic_source: v, traffic_source_detail: "" })}
              />
              {["小红书", "抖音", "公众号", "视频号"].includes(form.traffic_source) && (
                <Input value={form.traffic_source_detail || ""} onChange={(e) => setField("traffic_source_detail", e.target.value)} placeholder="内容链接" className="w-[200px]" />
              )}
              {form.traffic_source === "好友推荐" && (
                <div className="w-[200px]">
                  <CustomerSearchInput customers={customers} value={form.traffic_source_detail || ""} onChange={(v) => setField("traffic_source_detail", typeof v === "string" ? v : v[0] || "")} placeholder="好友昵称" filterSelected={false} />
                </div>
              )}
              {form.traffic_source === "朋友圈" && (
                <div className="w-[200px]">
                  <CustomerSearchInput customers={customers} value={form.traffic_source_detail || ""} onChange={(v) => setField("traffic_source_detail", typeof v === "string" ? v : v[0] || "")} placeholder="所属人" filterSelected={false} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#f0f0f0]" />

        {/* 标签信息 */}
        <div>
          <h2 className="mb-3 text-[13px] font-normal text-[#1f2329]">标签信息</h2>
          <div className="flex flex-wrap gap-x-[14px] gap-y-3 pl-[15px]">
            <div className="flex items-center gap-2">
              <label className="w-12 flex-shrink-0 text-right text-[12px] font-normal text-[#4e535a]">跟进阶段</label>
              <SelectDropdown
                value={form.follow_up_status || "未配置"}
                options={["新添加", "前期沟通中", "已邀约未到店", "已到店", "已成交", "沉默/流失", "未配置"].map(value => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => setField("follow_up_status", value)}
                className="w-[200px]"
              />
            </div>
            <CustomerTagField
              tags={availableTags}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              onTagCreated={tag => setAvailableTags(current => [...current, tag])}
              disabled={!tagsLoaded}
              loading={tagsLoading}
            />
            {tagLoadError && (
              <p className="basis-full ml-[60px] text-[12px] text-[#c4506a]">{tagLoadError}，本次保存不会修改客户标签</p>
            )}
          </div>
        </div>

        <div className="border-t border-[#f0f0f0]" />

        {/* 背景信息 */}
        <div>
          <h2 className="text-[13px] font-normal text-[#1f2329] mb-3">疗愈情况</h2>
          <div className="flex flex-wrap gap-x-[14px] gap-y-3 pl-[15px]">
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">服务老师</label>
              <div className="w-[200px]">
                <CustomerSearchInput customers={customers} value={form.service_teacher || ""} onChange={(v) => setField("service_teacher", typeof v === "string" ? v : v[0] || "")} placeholder="请搜索" excludeIds={form.id ? [form.id] : []} filterSelected={false} />
              </div>
            </div>
            <div className="flex items-center gap-2 w-full">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">到访目的</label>
              <Input value={form.tags || ""} onChange={(e) => setField("tags", e.target.value)} placeholder="请输入" className="flex-1 mr-[96px]" />
            </div>
            <div className="flex items-center gap-2 w-full">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">创伤经历</label>
              <Input value={form.basic_info || ""} onChange={(e) => setField("basic_info", e.target.value)} placeholder="请输入" className="flex-1 mr-[96px]" />
            </div>
            <div className="flex items-center gap-2 w-full">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">当下卡点</label>
              <Input value={form.assessment || ""} onChange={(e) => setField("assessment", e.target.value)} placeholder="请输入" className="flex-1 mr-[96px]" />
            </div>
            <div className="flex items-center gap-2 w-full">
              <label className="text-[12px] text-[#4e535a] font-light w-12 flex-shrink-0 text-right">其他信息</label>
              <Input value={form.other_info || ""} onChange={(e) => setField("other_info", e.target.value)} placeholder="请输入" className="flex-1 mr-[96px]" />
            </div>
          </div>
        </div>
      </div>

      {/* 底部固定按钮栏 */}
      <div className="fixed bottom-0 left-[var(--sidebar-width)] right-0 bg-white border-t border-[#f0f0f0] px-6 py-3 z-50">
        <div className="flex flex-col items-center gap-2">
          {fieldErrors._general && <p className="text-[12px] text-[#f54a45]">{fieldErrors._general}</p>}
          <div className="flex items-center gap-[18px]">
            <Button variant="outline" size="sm" className="h-[34px] text-xs w-[140px]" onClick={() => navigate(backPath)}>
              返回
            </Button>
            <Button size="sm" className="h-[34px] text-xs w-[140px]" onClick={handleSave} disabled={saving || (isEdit && tagsLoading)}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
