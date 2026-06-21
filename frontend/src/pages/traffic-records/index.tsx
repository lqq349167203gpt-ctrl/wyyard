import { useEffect, useState, useRef, useMemo } from "react"
import { TrendingUp, X } from "lucide-react"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { customerApi, type CustomerLight } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const SOURCE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  "小红书": { label: "小红书", color: "#4e535a", bg: "#f5f6f7" },
  "抖音": { label: "抖音", color: "#4e535a", bg: "#f5f6f7" },
  "公众号": { label: "公众号", color: "#4e535a", bg: "#f5f6f7" },
  "视频号": { label: "视频号", color: "#4e535a", bg: "#f5f6f7" },
  "朋友圈": { label: "朋友圈", color: "#4e535a", bg: "#f5f6f7" },
  "美团": { label: "美团", color: "#4e535a", bg: "#f5f6f7" },
  "大众点评": { label: "大众点评", color: "#4e535a", bg: "#f5f6f7" },
  "好友推荐": { label: "好友推荐", color: "#4e535a", bg: "#f5f6f7" },
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getDetailLabel(source: string) {
  if (["小红书", "抖音", "公众号", "视频号"].includes(source)) return "内容链接"
  if (source === "好友推荐") return "好友昵称"
  if (source === "朋友圈") return "所属人"
  return ""
}

export function TrafficRecordsContent({ embedded }: { embedded?: boolean }) {
  const [allCustomers, setAllCustomers] = useState<CustomerLight[]>([])
  const [loading, setLoading] = useState(true)
  const retryRef = useRef(0)

  // 搜索状态
  const [filterReferrer, setFilterReferrer] = useState("")
  const [filterSource, setFilterSource] = useState("")
  const [filterStartDate, setFilterStartDate] = useState("")
  const [filterEndDate, setFilterEndDate] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const list = await customerApi.light()
        if (cancelled) return
        const filtered = list
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        setAllCustomers(filtered)
        setLoading(false)
      } catch {
        if (!cancelled && retryRef.current < 2) {
          retryRef.current++
          load()
        } else {
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleClear = () => {
    setFilterReferrer("")
    setFilterSource("")
    setFilterStartDate("")
    setFilterEndDate("")
  }

  const customers = useMemo(() => allCustomers.filter((c) => {
    if (filterReferrer && c.referrer !== filterReferrer) return false
    if (filterSource === "__none__" && c.traffic_source) return false
    if (filterSource && filterSource !== "__none__" && c.traffic_source !== filterSource) return false
    if (filterStartDate) {
      const d = (c.created_at || "").split("T")[0]
      if (d < filterStartDate) return false
    }
    if (filterEndDate) {
      const d = (c.created_at || "").split("T")[0]
      if (d > filterEndDate) return false
    }
    return true
  }), [allCustomers, filterReferrer, filterSource, filterStartDate, filterEndDate])

  const referrers = useMemo(() => [...new Set(allCustomers.map(c => c.referrer).filter(Boolean))].sort(), [allCustomers])

  const sources = [...new Set(allCustomers.map(c => c.traffic_source).filter(Boolean))].sort()

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(customers)

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-5"}>
      {!embedded && (
        <div>
          <h1 className="text-lg font-semibold">引流记录</h1>
          <p className="text-xs text-muted-foreground mt-0.5">共 {customers.length} 条引流记录</p>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <SelectDropdown
          className="w-36"
          value={filterReferrer}
          options={[{value: "", label: "全部引流人"}, ...referrers.map(r => ({value: r, label: r}))]}
          placeholder="全部引流人"
          onChange={(v) => setFilterReferrer(v)}
        />
        <SelectDropdown
          className="w-36"
          value={filterSource}
          options={[{value: "", label: "全部来源"}, {value: "__none__", label: "无来源"}, ...sources.filter(s => s !== "其他").map(s => ({value: s, label: s}))]}
          placeholder="全部来源"
          onChange={(v) => setFilterSource(v)}
        />
        <div className="flex items-center h-8 rounded-md border border-input overflow-hidden">
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${!filterStartDate ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
          <span className="text-[12px] text-[#8f959e] px-1">~</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${!filterEndDate ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`}
          />
        </div>
        <button
          onClick={handleClear}
          className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <TrendingUp className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">暂无引流记录</p>
          <p className="text-xs text-muted-foreground mt-1">客户信息中填写流量来源后将自动显示</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">添加日期</TableHead>
                <TableHead>新增客户</TableHead>
                <TableHead>流量来源</TableHead>
                <TableHead>引流人</TableHead>
                <TableHead className="pr-4">链接/昵称</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((c) => {
                const badge = SOURCE_BADGE[c.traffic_source]
                const detailLabel = getDetailLabel(c.traffic_source)
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 text-[#2b2f36]">{formatDate(c.created_at)}</TableCell>
                    <TableCell className="text-[#2b2f36]">{c.nickname}</TableCell>
                    <TableCell>
                      {badge ? (
                        <span
                          className="inline-block text-[12px] px-2 py-0.5 rounded"
                          style={{ color: badge.color, backgroundColor: badge.bg }}
                        >
                          {badge.label}
                        </span>
                      ) : c.traffic_source ? (
                        <span className="text-[#2b2f36]">{c.traffic_source}</span>
                      ) : (
                        <span className="text-[#8f959e]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[#2b2f36]">
                      {c.referrer || <span className="text-[#8f959e]">-</span>}
                    </TableCell>
                    <TableCell className="pr-4 text-[#2b2f36]">
                      {detailLabel && c.traffic_source_detail ? c.traffic_source_detail : <span className="text-[#8f959e]">-</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </>
      )}
    </div>
  )
}

export default function TrafficRecordsPage() {
  return <TrafficRecordsContent />
}
