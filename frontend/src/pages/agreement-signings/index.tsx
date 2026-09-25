import { useEffect, useRef, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { agreementSigningApi, customerApi, type AgreementSigning, type AgreementSigningResult, type CustomerLight } from "@/lib/api"
import { confirmDialog } from "@/components/confirm-dialog"
import { PaginationBar } from "@/components/pagination-bar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SupervisionSecondaryLayout } from "@/components/supervision-secondary-layout"

const dash = <span className="text-[#d0d3d6]">—</span>

export default function AgreementSigningsPage({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<"unsigned" | "signed">("unsigned")
  const [keyword, setKeyword] = useState("")
  const [nickname, setNickname] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<AgreementSigningResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const signing = useRef(false)

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => setCustomers([]))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNickname(keyword.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [keyword])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    agreementSigningApi.list(tab, nickname, page).then(result => {
      if (active) setData(result)
    }).catch(err => { if (active) setError(err.message || "加载失败，请重试") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tab, nickname, page, revision])

  async function sign(row: AgreementSigning) {
    if (signing.current || loading || !row.can_change_status) return
    const targetStatus = row.agreement_status === "signed" ? "unsigned" : "signed"
    signing.current = true
    setBusy(row.id)
    try {
      if (!await confirmDialog({
        title: targetStatus === "signed" ? "确认已签订协议？" : "确认改为未签？",
        description: `${row.nickname} · ${row.card_type} · 生效日期 ${row.effective_date || "未填写"}`,
        hint: targetStatus === "unsigned" ? (row.period === "有效期内" ? "改回后将返回“未签”列表，不影响会员卡权益。" : "改回后仍保留在此列表，状态显示未签，不影响会员卡权益。") : undefined,
        confirmText: targetStatus === "signed" ? "确认已签" : "改为未签",
      })) return
      await agreementSigningApi.sign(row.id, targetStatus)
      setRevision(v => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败，请重试")
    } finally { signing.current = false; setBusy("") }
  }

  const secondaryItems = (["unsigned", "signed"] as const).map(value => ({
    key: value,
    label: value === "unsigned" ? "未签" : "已签/过期",
    badge: data?.counts[value],
  }))

  return <div className={`${embedded ? "" : "min-h-full bg-[#f4f5f6] p-4 pb-6"} text-[#2b2f36]`}>
    <SupervisionSecondaryLayout
      items={secondaryItems}
      activeKey={tab}
      disabled={!!busy}
      onChange={value => { setTab(value as "unsigned" | "signed"); setPage(1) }}
    >
    <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5">
        <div className="w-[172px]">
          <CustomerSearchInput
            customers={customers}
            value={keyword}
            onChange={value => setKeyword(typeof value === "string" ? value : "")}
            placeholder="搜索姓名或昵称"
            filterSelected={false}
            className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
            rounded="7px"
          />
        </div>
      </div>
      {error && <div role="alert" className="px-4 pb-3 text-xs text-red-600">{error}<button className="ml-3 underline" onClick={() => setRevision(v => v + 1)}>重试</button></div>}
      <div className="overflow-x-auto" aria-busy={loading}>
        <Table className="min-w-[850px] [&_th]:h-10 [&_th]:bg-[#fafbfc] [&_th]:text-[12px] [&_td]:py-3 [&_td]:text-[13px]">
          <TableHeader><TableRow>
            {["昵称", "会员卡", "成交日期", "有效期", "成交归属", "成交人", "状态", "操作"].map(label => <TableHead key={label} className={label === "操作" ? "text-right pr-4" : ""}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {!error && data?.items.map(row => <TableRow key={row.id}>
              <TableCell className="max-w-[160px] whitespace-normal break-words pl-4 font-medium">{row.nickname || dash}</TableCell>
              <TableCell>{row.card_type}</TableCell>
              <TableCell>{row.deal_date || dash}</TableCell>
              <TableCell><div className="whitespace-nowrap tabular-nums text-[12px]">{row.effective_date || "—"} ～ {row.expiry_date || "长期有效"}</div><span className="mt-1 block text-[11px] text-[#8f959e]">{row.period}</span></TableCell>
              <TableCell className="max-w-[160px] whitespace-normal break-words">{row.organization_name || dash}</TableCell>
              <TableCell className="max-w-[160px] whitespace-normal break-words">{row.closer_names || dash}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1.5 py-0.5 text-[11px] ${row.agreement_status === "signed" ? "bg-[#eef8f3] text-[#3f8f69]" : "bg-[#fff7e6] text-[#b46f12]"}`}><span className="size-1.5 rounded-full bg-current" aria-hidden />{row.agreement_status === "signed" ? "已签" : "未签"}</span>
              </TableCell>
              <TableCell className="pr-4 text-right">
                {row.can_change_status ? <button type="button" disabled={loading || !!busy} onClick={() => sign(row)} className="ml-auto inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2 text-xs text-[#4e535a] transition-colors hover:bg-[#f5f6f7] focus-visible:outline-2 focus-visible:outline-[#3370ff] disabled:cursor-not-allowed disabled:opacity-40">
                  {row.agreement_status === "signed" ? <RotateCcw aria-hidden className="size-3" /> : <Check aria-hidden className="size-3" />}
                  {busy === row.id ? "处理中…" : row.agreement_status === "signed" ? "改为未签" : "已签"}
                </button> : dash}
              </TableCell>
            </TableRow>)}
            {!data?.items.length && !error && <TableRow><TableCell colSpan={8} className="h-28 text-center text-[#8f959e]">{loading ? "加载中…" : "暂无记录"}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {data && !error && <PaginationBar currentPage={data.page} totalPages={data.total_pages} totalItems={data.total}
        startIndex={(data.page - 1) * 20 + 1} endIndex={Math.min(data.page * 20, data.total)}
        onPageChange={value => { if (!busy && !loading) setPage(value) }} />}
    </div>
    </SupervisionSecondaryLayout>
  </div>
}
