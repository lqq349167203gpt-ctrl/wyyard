import { useEffect, useState, useRef } from "react"
import { TrendingUp } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { customerApi, type CustomerLight } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const SOURCE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  "小红书": { label: "小红书", color: "#ff2442", bg: "#fff0f0" },
  "抖音": { label: "抖音", color: "#111", bg: "#f5f5f5" },
  "公众号": { label: "公众号", color: "#07c160", bg: "#f0fff4" },
  "视频号": { label: "视频号", color: "#576b95", bg: "#f0f4ff" },
  "朋友圈": { label: "朋友圈", color: "#576b95", bg: "#f0f4ff" },
  "美团": { label: "美团", color: "#ffb400", bg: "#fffbe6" },
  "大众点评": { label: "大众点评", color: "#ff6633", bg: "#fff4f0" },
  "好友推荐": { label: "好友推荐", color: "#3370ff", bg: "#f0f5ff" },
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getDetailLabel(source: string) {
  if (["小红书", "抖音", "公众号", "视频号"].includes(source)) return "内容链接"
  if (source === "好友推荐") return "好友昵称"
  if (source === "朋友圈") return "所属人"
  return ""
}

export default function TrafficRecordsPage() {
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [loading, setLoading] = useState(true)
  const retryRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const list = await customerApi.light()
        if (cancelled) return
        const filtered = list
          .filter((c) => c.traffic_source)
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        setCustomers(filtered)
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

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(customers)

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">引流记录</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            共 {customers.length} 条引流记录
          </p>
        </div>
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
                      ) : (
                        <span className="text-[#2b2f36]">{c.traffic_source}</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-[#2b2f36]">
                      {detailLabel && c.traffic_source_detail ? c.traffic_source_detail : <span className="text-[#8f959e]">—</span>}
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
