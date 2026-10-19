import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CustomerAccessPermissions, PositionEditPermissions } from "@/lib/api"
import { NOTE_PERMISSION_OPTIONS } from "@/lib/note-permissions"
import { PAGE_PERMISSIONS } from "@/lib/page-registry"
import {
  DETAIL_OPTIONS, DIRECTORY_GROUPS, EDIT_OPTIONS, pageLabel, pageSearchText, pageSummary, permissionChanges,
  SENSITIVE_OPTIONS, SHARED_IMPACTS, SCOPE_LABELS, TRANSACTION_OPTIONS, detailAllowed,
  type SharedImpact,
} from "./permission-model"

type Props = {
  roleName: string
  system: boolean
  pages: string[]
  edit: PositionEditPermissions
  setEdit: Dispatch<SetStateAction<PositionEditPermissions>>
  togglePage: (key: string) => void
  savedSnapshot: string
  emptyAccess: CustomerAccessPermissions
}

function Explanation({ children }: { children: ReactNode }) {
  return <details className="text-[12px] font-normal text-[#646a73]">
    <summary className="cursor-pointer text-right">说明</summary>
    <div className="mt-2 text-left leading-6">{children}</div>
  </details>
}

function Section({ title, source = "本页设置", help, children }: { title: string; source?: string; help?: ReactNode; children: ReactNode }) {
  return <section aria-label={`${title} · ${source}`} className="mb-6 last:mb-0">
    <div className="mb-1 flex items-start gap-4 rounded-[4px] bg-[#f7f8fa] px-3 py-2.5">
      <h3 className="shrink-0 text-[14px] font-medium text-[#1f2329]">{title}</h3>
      {help && <div className="min-w-0 flex-1">{help}</div>}
    </div>
    <div className="px-3">{children}</div>
  </section>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid min-h-11 items-center gap-2 border-b border-[#f4f5f6] py-2 last:border-0 sm:grid-cols-[minmax(120px,0.65fr)_minmax(0,1fr)] sm:gap-5">
    <div>{label}</div><div className="min-w-0">{children}</div>
  </div>
}

function Options({ label, value, options, onChange }: {
  label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void
}) {
  return <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={key === value} onClick={() => onChange(key)}
      className={`min-h-8 rounded-[4px] border px-2.5 text-[12px] transition-colors disabled:cursor-default ${key === value ? "border-[#3370ff] bg-[#eef4ff] text-[#3370ff]" : "border-[#dee0e3] bg-white text-[#646a73] enabled:hover:bg-[#f7f8fa]"}`}>
      {text}
    </button>)}
  </div>
}

function BooleanSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="inline-flex min-h-8 items-center gap-2">
    <input type="checkbox" aria-label={label} checked={checked} onChange={onChange} className="h-4 w-4 accent-[#3370ff]" />
    <span className="text-[12px]">{checked ? "允许" : "不允许"}</span>
  </label>
}

export function PermissionWorkspace({ roleName, system, pages, edit, setEdit, togglePage, savedSnapshot, emptyAccess }: Props) {
  const [selectedPage, setSelectedPage] = useState(() => {
    let stored: string | null = null
    try { stored = localStorage.getItem("role_permission_page") } catch {}
    return PAGE_PERMISSIONS.some(page => page.key === stored) ? stored! : "healing-records"
  })
  const [overview, setOverview] = useState(false)
  const [query, setQuery] = useState("")
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const enabled = system || pages.includes(selectedPage)
  const access = edit.customer_access
  const changes = permissionChanges(savedSnapshot, pages, edit)

  function navigate(key: string) {
    setSelectedPage(key)
    setOverview(false)
    setQuery("")
    setOnlyEnabled(false)
    detailRef.current?.scrollTo({ top: 0 })
    try { localStorage.setItem("role_permission_page", key) } catch {}
  }

  function updateAccess(update: Partial<CustomerAccessPermissions>, external = false) {
    const key = external ? "principal_external_access" : "customer_access"
    setEdit(current => ({ ...current, [key]: { ...(current[key] || emptyAccess), ...update } }))
  }

  function updateFlag(group: "sensitive_fields" | "detail_tabs", key: string, external = false) {
    const target = external ? "principal_external_access" : "customer_access"
    setEdit(current => {
      const previous = current[target] || emptyAccess
      const flags = previous[group] as Record<string, boolean>
      const checked = group === "detail_tabs" ? detailAllowed(previous, key as keyof CustomerAccessPermissions["detail_tabs"]) : flags[key]
      return { ...current, [target]: { ...previous, [group]: { ...flags, [key]: !checked } } }
    })
  }

  function impact(kind: SharedImpact, note?: string) {
    return <details key={`${roleName}:${selectedPage}:${kind}`} className="text-[12px] font-normal text-[#646a73]" data-shared-impact={kind}>
      <summary className="cursor-pointer text-right">共用页面 · {SHARED_IMPACTS[kind].length}</summary>
      <p className="mt-2 text-left leading-5">以下页面共用此设置，修改后统一生效。</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-left leading-6">
        {SHARED_IMPACTS[kind].map(key => <button key={key} type="button" className="text-[#4e535a] hover:underline" onClick={() => navigate(key)}>{pageLabel(key)}</button>)}
      </div>
      {note && <p className="mt-2 text-left leading-5">{note}</p>}
    </details>
  }

  function flagRows(group: "sensitive_fields" | "detail_tabs", options: readonly { key: string; label: string }[], external = false) {
    const target = external ? edit.principal_external_access || emptyAccess : access
    return options.map(item => <Row key={item.key} label={item.label}>
      <BooleanSetting label={`${external ? "外部人员 · " : ""}${item.label}`} checked={system || (group === "detail_tabs" ? detailAllowed(target, item.key as keyof CustomerAccessPermissions["detail_tabs"]) : (target[group] as Record<string, boolean>)[item.key])}
        onChange={() => updateFlag(group, item.key, external)} />
    </Row>)
  }

  const hasShared = (kind: SharedImpact) => (SHARED_IMPACTS[kind] as readonly string[]).includes(selectedPage)
  const visibleGroups = DIRECTORY_GROUPS.map(group => ({ ...group, keys: group.keys.filter(key => {
    const search = `${pageSearchText(key)} ${pageSummary(key, pages, edit, system).join(" ")}`
    return (!onlyEnabled || system || pages.includes(key)) && (!query.trim() || search.includes(query.trim()))
  }) })).filter(group => group.keys.length)

  function sharedOverview(title: string, kind: SharedImpact, content: ReactNode, note?: string) {
    return <Section title={title} source="跨页共用" help={impact(kind, note)}>{content}</Section>
  }

  const sharedNotes = "只控制这些页面中的对应信息；页面入口和记录归属仍按原规则。数据统计的外部参与者使用独立设置。"
  const detailNote = "用于以上页面打开的客户详情。沟通记录开关还影响“沟通记录”独立页面；回访记录开关还影响“回访记录”独立页面。卡次统计不代表交易明细权限。"
  const profileSettings = <>
    {hasShared("sensitive") && <Section title="隐私信息" source="跨页共用" help={impact("sensitive", "用于客户资料及客户详情；自定义筛选中的对应字段也使用此设置。")}>{flagRows("sensitive_fields", SENSITIVE_OPTIONS)}
    </Section>}
    {hasShared("details") && <Section title="详情内容" source="跨页共用" help={impact("details", detailNote)}>{flagRows("detail_tabs", DETAIL_OPTIONS.filter(item => !NOTE_PERMISSION_OPTIONS.some(note => note.key === item.key)))}
    </Section>}
    {hasShared("contacts") && <Section title="联系方式" source="跨页共用" help={impact("contacts", "用于已有客户资料及客户详情。新建客户仍可录入；相关操作沿用现有日志规则。")}>
      {(["phone", "wechat"] as const).map(field => <Row key={field} label={field === "phone" ? "手机号" : "微信号"}>
        <div className="flex flex-wrap gap-4">{(["view", "copy", "edit"] as const).map((action, index) => <label key={action} className="inline-flex min-h-8 items-center gap-2 text-[12px]">
          <input type="checkbox" aria-label={`${field === "phone" ? "手机号" : "微信号"}${["查看", "复制", "修改"][index]}`} checked={edit.contacts[field][action]} className="h-4 w-4 accent-[#3370ff]" onChange={() => setEdit(current => ({ ...current, contacts: { ...current.contacts, [field]: { ...current.contacts[field], [action]: !current.contacts[field][action] } } }))} />{["查看", "复制", "修改"][index]}
        </label>)}</div>
      </Row>)}
    </Section>}
  </>

  return <div className="overflow-hidden rounded-[4px] border border-[#e8eaee] bg-white text-[13px] text-[#2b2f36]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8eaee] px-4 py-3">
      <span className="text-[12px] text-[#646a73]">已开启 {PAGE_PERMISSIONS.filter(page => system || pages.includes(page.key)).length} / {PAGE_PERMISSIONS.length} 项</span>
      <Button variant="outline" size="sm" onClick={() => setOverview(current => !current)} aria-pressed={overview}>
        {overview ? "返回配置" : "权限总览"}
      </Button>
    </div>
    {overview ? <div className="p-4 sm:p-5">
      <p className="mb-4 text-[12px] text-[#646a73]">当前显示「{roleName}」的配置{changes.length ? "（含未保存修改）" : ""}。账号拥有多个角色时，最终权限按现有规则合并。</p>
      <Table>
        <TableHeader><TableRow><TableHead>页面</TableHead><TableHead>入口</TableHead><TableHead>操作与范围</TableHead></TableRow></TableHeader>
        <TableBody>{DIRECTORY_GROUPS.flatMap(group => group.keys).map(key => <TableRow key={key}>
          <TableCell className="align-top"><button type="button" onClick={() => navigate(key)} className="text-[#2b2f36] underline decoration-[#c9cdd4] underline-offset-4">{pageLabel(key)}</button></TableCell>
          <TableCell className="align-top">{system || pages.includes(key) ? "已开启" : "未开启"}</TableCell>
          <TableCell className="min-w-[220px] whitespace-normal align-top">
            {!system && !pages.includes(key) && <div className="mb-1 text-[12px] text-[#646a73]">保留配置</div>}
            {pageSummary(key, pages, edit, system).map(line => <div key={line}>{line}</div>)}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <div className="mt-6">
        {sharedOverview("数据范围", "scope", <p>可查看客户：{SCOPE_LABELS[access.scope]}{access.scope === "related" ? `（${[access.relations.referrer && "本人为引流人", access.relations.referrer_handler && "本人为承接人"].filter(Boolean).join("、") || "未选关联关系"}）` : ""}</p>)}
        {sharedOverview("需求备注", "notes", <div>{NOTE_PERMISSION_OPTIONS.map(item => <div key={item.key}>{item.label}：{detailAllowed(access, item.key) ? "允许" : "不允许"}</div>)}</div>, sharedNotes)}
        {sharedOverview("隐私信息", "sensitive", <div>{SENSITIVE_OPTIONS.map(item => <div key={item.key}>{item.label}：{access.sensitive_fields[item.key] ? "允许" : "不允许"}</div>)}</div>)}
        {sharedOverview("详情内容", "details", <div>{DETAIL_OPTIONS.filter(item => !NOTE_PERMISSION_OPTIONS.some(note => note.key === item.key)).map(item => <div key={item.key}>{item.label}：{detailAllowed(access, item.key) ? "允许" : "不允许"}</div>)}</div>, detailNote)}
        {sharedOverview("交易信息", "transactions", <p>{TRANSACTION_OPTIONS.find(item => item[0] === access.transaction_access)?.[1]}</p>)}
        {sharedOverview("联系方式", "contacts", <div>{(["phone", "wechat"] as const).map(field => <div key={field}>{field === "phone" ? "手机号" : "微信号"}：{(["view", "copy", "edit"] as const).map((action, index) => `${["查看", "复制", "修改"][index]}${edit.contacts[field][action] ? "允许" : "不允许"}`).join("、")}</div>)}</div>)}
        <Section title="外部人员" source="数据统计独立设置">
          {[...SENSITIVE_OPTIONS, ...DETAIL_OPTIONS].map(item => <div key={item.key}>{item.label}：{system || (item.key in (edit.principal_external_access || emptyAccess).sensitive_fields ? (edit.principal_external_access || emptyAccess).sensitive_fields[item.key as keyof CustomerAccessPermissions["sensitive_fields"]] : detailAllowed(edit.principal_external_access || emptyAccess, item.key as keyof CustomerAccessPermissions["detail_tabs"])) ? "允许" : "不允许"}</div>)}
          <div>交易信息：{TRANSACTION_OPTIONS.find(item => item[0] === (system ? "detail" : edit.principal_external_access?.transaction_access || "none"))?.[1]}</div>
        </Section>
      </div>
    </div> : <div className="grid min-w-0 md:h-[calc(100dvh-270px)] md:min-h-[420px] md:grid-cols-[190px_minmax(0,1fr)]">
      <aside aria-label="页面目录" className="hidden overflow-y-auto border-r border-[#e8eaee] p-3 md:block">
        <Input aria-label="搜索页面或权限" placeholder="搜索页面或权限" value={query} onChange={event => setQuery(event.target.value)} />
        <label className="my-3 flex items-center gap-2 text-[12px] text-[#646a73]"><input type="checkbox" checked={onlyEnabled} onChange={event => setOnlyEnabled(event.target.checked)} className="accent-[#3370ff]" />只看已开启</label>
        <nav className="space-y-3">
          {visibleGroups.map(group => <div key={group.label}>
            <div className="mb-1 px-2 text-[12px] text-[#646a73]">{group.label}</div>
            {group.keys.map(key => <button key={key} type="button" aria-current={selectedPage === key ? "page" : undefined} onClick={() => navigate(key)}
              className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-[4px] px-2 text-left ${selectedPage === key ? "bg-[#eef4ff] text-[#3370ff]" : "hover:bg-[#f7f8fa]"}`}>
              <span className="min-w-0 break-words">{pageLabel(key)}</span><span className="shrink-0 text-[12px] text-[#646a73]">{system || pages.includes(key) ? "已开" : "未开"}</span>
            </button>)}
          </div>)}
          {!visibleGroups.length && <p className="py-3 text-[12px] text-[#646a73]">没有匹配的页面</p>}
        </nav>
      </aside>
      <div ref={detailRef} className="min-w-0 p-4 sm:p-5 md:overflow-y-auto" data-permission-detail>
        <label className="mb-4 block md:hidden">选择页面
          <select aria-label="选择页面" value={selectedPage} onChange={event => navigate(event.target.value)} className="mt-2 min-h-9 w-full rounded-[4px] border border-[#dee0e3] bg-white px-2">
            {DIRECTORY_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.keys.map(key => <option key={key} value={key}>{pageLabel(key)} · {system || pages.includes(key) ? "已开启" : "未开启"}</option>)}</optgroup>)}
          </select>
        </label>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[18px] font-medium text-[#1f2329]">{pageLabel(selectedPage)}</h2>
          <label className="flex min-h-8 items-center gap-2 text-[12px]">
            <input aria-label={`${pageLabel(selectedPage)}页面入口`} type="checkbox" checked={enabled} disabled={system} onChange={() => togglePage(selectedPage)} className="h-4 w-4 accent-[#3370ff]" />
            {enabled ? "页面已开启" : "页面未开启"}
          </label>
        </div>
        {!enabled && <p className="mb-4 text-[12px] text-[#646a73]">开启页面后可配置权限</p>}
        {enabled && hasShared("scope") && access.scope === "none" && <p className="mb-4 rounded-[4px] bg-[#fff8ec] px-3 py-2 text-[12px] text-[#8a5c1e]">客户范围为“不可查看”，当前看不到客户记录。</p>}
        <fieldset disabled={system || !enabled} className={`min-w-0 ${!enabled ? "opacity-60" : ""}`}>
          {EDIT_OPTIONS.some(item => item.page === selectedPage) || selectedPage === "offline-course-records" ? <Section title="操作权限" help={<Explanation>{EDIT_OPTIONS.filter(item => item.page === selectedPage).map(item => <p key={item.key}>{item.label}：{item.description}</p>)}</Explanation>}>
            {EDIT_OPTIONS.filter(item => item.page === selectedPage).map(item => <div key={item.key}>
              <Row label={item.label}><Options label={item.label} value={edit[item.key]} options={item.key === "activity_teachers" && edit.activity_teachers === "all" ? [...item.options, ["all", "允许（历史：全部）"]] : item.options} onChange={value => setEdit(current => ({ ...current, [item.key]: value }))} /></Row>
            </div>)}
            {selectedPage === "class-records" && <Row label="核对与解锁"><BooleanSetting label="邀约核对与解锁" checked={edit.visit_lock} onChange={() => setEdit(current => ({ ...current, visit_lock: !current.visit_lock }))} /></Row>}
            {selectedPage === "daily-activities" && <>
              <Row label="核对与解锁"><BooleanSetting label="课表核对与解锁" checked={edit.activity_lock} onChange={() => setEdit(current => ({ ...current, activity_lock: !current.activity_lock }))} /></Row>
              <Row label="小程序核销"><button type="button" className="min-h-8 text-[12px] text-[#3370ff]" onClick={() => navigate("activity-checkin")}>{system || pages.includes("activity-checkin") ? "已开启" : "未开启"} · 独立配置</button></Row>
            </>}
            {selectedPage === "offline-course-records" && <Row label="课程类型管理"><BooleanSetting label="课程类型管理" checked={system || pages.includes("offline-course-types")} onChange={() => togglePage("offline-course-types")} /></Row>}
          </Section> : null}

          {selectedPage === "principal" && <Section title="数据范围" source="本页独立设置" help={<Explanation>个人跟随组织范围。“仅自己”按账号归属人判断；“所有人”仅限组织范围内可选的引流人。</Explanation>}>
            <Row label="可选范围"><div className="flex flex-wrap gap-4">{([ ["organization", "组织／俱乐部"], ["person", "个人"] ] as const).map(([key, label]) => <label key={key} className="inline-flex min-h-8 items-center gap-2 text-[13px]">
              <input type="checkbox" aria-label={`统计范围 · ${label}`} checked={system || (edit.principal_views?.[key] ?? true)} className="h-4 w-4 accent-[#3370ff]" onChange={() => setEdit(current => ({ ...current, principal_views: { organization: true, person: true, ...current.principal_views, [key]: !(current.principal_views?.[key] ?? true) } }))} />{label}
            </label>)}</div></Row>
            <Row label="组织范围"><Options label="组织范围" value={edit.principal_scope || "own"} options={[["own", "本人所属组织"], ["all", "所有组织"]]} onChange={value => setEdit(current => ({ ...current, principal_scope: value as "own" | "all" }))} /></Row>
            {(system || (edit.principal_views?.person ?? true)) && <Row label="个人范围"><Options label="个人范围" value={edit.principal_person_scope || "all"} options={[["own", "仅自己"], ["all", "所有人"]]} onChange={value => setEdit(current => ({ ...current, principal_person_scope: value as "own" | "all" }))} /></Row>}
          </Section>}
          {selectedPage === "course-statistics" && <Section title="数据范围" source="本页独立设置" help={<Explanation>“与本人相关”指本人作为老师或成就君的课程。页面与导出使用同一范围。</Explanation>}>
            <Row label="可查看课程"><Options label="可查看课程" value={edit.course_records || "all"} options={[["own", "与本人相关"], ["all", "全部课程"]]} onChange={value => setEdit(current => ({ ...current, course_records: value as "own" | "all" }))} /></Row>
          </Section>}
          {hasShared("scope") && <Section title="数据范围" source="跨页共用" help={impact("scope", "课表、技能训练课程中的客户选择和新增关联也使用此范围；数据统计、组织信息及课程记录的独立范围不受此项控制。关联关系可组合勾选，并包含本人资料；未选关系时没有相关客户可见。")}>
            <Row label="可查看客户"><Options label="可查看客户" value={access.scope} options={[["all", "全部客户"], ["related", "与本人相关"], ["none", "不可查看"]]} onChange={value => updateAccess({ scope: value as CustomerAccessPermissions["scope"] })} /></Row>
            {access.scope === "related" && <Row label="关联关系"><div className="flex flex-wrap gap-x-5 gap-y-2">{([["referrer", "本人为引流人"], ["referrer_handler", "本人为承接人"]] as const).map(([key, label]) => <label key={key} className="inline-flex min-h-8 items-center gap-2 text-[12px]"><input type="checkbox" className="accent-[#3370ff]" checked={access.relations[key]} onChange={() => updateAccess({ relations: { ...access.relations, [key]: !access.relations[key] } })} />{label}</label>)}</div></Row>}

          </Section>}
          {hasShared("notes") && <Section title="信息权限" source="跨页共用" help={impact("notes", sharedNotes)}>{flagRows("detail_tabs", NOTE_PERMISSION_OPTIONS)}
          </Section>}
          {selectedPage === "communication-records" && <Section title="信息权限" source="跨页共用" help={impact("details", "“沟通记录”同时影响当前独立页面和以上页面的客户详情。")}>{flagRows("detail_tabs", [{ key: "communication", label: "沟通记录" }])}
          </Section>}
          {selectedPage === "followup-records" && <Section title="信息权限" source="跨页共用" help={impact("details", "“回访记录”同时影响当前独立页面和以上页面的客户详情。")}>{flagRows("detail_tabs", [{ key: "customer_followups", label: "回访记录" }])}
          </Section>}
          {hasShared("transactions") && <Section title="交易信息" source="跨页共用" help={impact("transactions", "分别影响消费汇总、交易明细和相关导出；只看汇总不能查看或操作需要交易明细的页面。")}>
            <Row label="交易可见内容"><Options label="交易可见内容" value={access.transaction_access} options={TRANSACTION_OPTIONS} onChange={value => updateAccess({ transaction_access: value as CustomerAccessPermissions["transaction_access"] })} /></Row>
          </Section>}
          {selectedPage === "healing-records" ? profileSettings : hasShared("details") && <details className="border-t border-[#e8eaee] py-4">
            <summary className="w-fit cursor-pointer text-[14px] font-medium text-[#1f2329]">详情权限</summary>
            <div className="mt-4">{profileSettings}</div>
          </details>}
          {selectedPage === "principal" && <Section title="外部人员" source="本页独立设置" help={<Explanation>仅用于组织课程中的外部参与者。内部参与者使用共用设置。</Explanation>}>
            <details className="mb-3"><summary className="w-fit cursor-pointer text-[13px] text-[#4e535a]">隐私信息</summary>{flagRows("sensitive_fields", SENSITIVE_OPTIONS, true)}</details>
            <details className="mb-3"><summary className="w-fit cursor-pointer text-[13px] text-[#4e535a]">详情内容</summary>{flagRows("detail_tabs", DETAIL_OPTIONS, true)}</details>
            <Row label="交易可见内容"><Options label="外部人员交易信息" value={system ? "detail" : edit.principal_external_access?.transaction_access || "none"} options={TRANSACTION_OPTIONS} onChange={value => updateAccess({ transaction_access: value as CustomerAccessPermissions["transaction_access"] }, true)} /></Row>
          </Section>}
          {!EDIT_OPTIONS.some(item => item.page === selectedPage) && !Object.values(SHARED_IMPACTS).some(keys => (keys as readonly string[]).includes(selectedPage)) && !["principal", "course-statistics", "offline-course-records"].includes(selectedPage) && <p className="py-4 text-[12px] text-[#646a73]">无需其他设置</p>}
        </fieldset>
      </div>
    </div>}
    {!system && <div aria-live="polite" className="border-t border-[#e8eaee] px-4 py-3 text-[12px] text-[#646a73]">
      {changes.length ? <details><summary className="w-fit cursor-pointer">本次修改 {changes.length} 项</summary><div className="mt-2 space-y-1">{changes.map((text, index) => <div key={index}>{text}</div>)}</div></details> : "暂无修改"}
    </div>}
  </div>
}
