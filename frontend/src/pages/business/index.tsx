import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Database, Plus, RefreshCw, Trash2, Eye } from "lucide-react"
import { businessApi, type FeishuTable, type FeishuTableCreate } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function BusinessPage() {
  const [tables, setTables] = useState<FeishuTable[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FeishuTableCreate>({ name: "", app_token: "", table_id: "" })
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [currentTable, setCurrentTable] = useState<FeishuTable | null>(null)

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(tables)

  const loadTables = () => {
    businessApi.listTables().then(setTables).catch(() => {})
  }

  useEffect(() => { loadTables() }, [])

  const handleLink = async () => {
    await businessApi.linkTable(form)
    setOpen(false)
    setForm({ name: "", app_token: "", table_id: "" })
    loadTables()
  }

  const handleSync = async (table: FeishuTable) => {
    await businessApi.syncTable(table.table_id, table.app_token)
    loadTables()
  }

  const handleUnlink = async (table: FeishuTable) => {
    await businessApi.unlinkTable(table.table_id, table.app_token)
    loadTables()
  }

  const handleViewRecords = async (table: FeishuTable) => {
    setCurrentTable(table)
    const res = await businessApi.getRecords(table.table_id, table.app_token)
    setRecords(res.records)
    setRecordsOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">业务数据</h1>
          <p className="text-sm text-muted-foreground mt-1">飞书多维表格数据源管理</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            关联表格
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>关联飞书多维表格</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>表格名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="给表格起个中文名" />
              </div>
              <div className="space-y-2">
                <Label>App Token</Label>
                <Input value={form.app_token} onChange={(e) => setForm({ ...form, app_token: e.target.value })} placeholder="多维表格 URL 中的 app_token" />
              </div>
              <div className="space-y-2">
                <Label>Table ID</Label>
                <Input value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })} placeholder="表格 ID" />
              </div>
              <Button onClick={handleLink} disabled={!form.app_token || !form.table_id} className="w-full">关联</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">已关联表格</CardTitle>
        </CardHeader>
        <CardContent>
          {tables.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无关联表格，点击上方「关联表格」添加</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>表格名称</TableHead>
                  <TableHead>App Token</TableHead>
                  <TableHead className="text-right">记录数</TableHead>
                  <TableHead>最近同步</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((table) => (
                  <TableRow key={`${table.app_token}-${table.table_id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        {table.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {table.app_token}
                    </TableCell>
                    <TableCell className="text-right">{table.record_count}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {table.last_synced_at ? new Date(table.last_synced_at).toLocaleString("zh-CN") : "未同步"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={table.sync_status === "synced" ? "default" : "secondary"}>
                        {table.sync_status === "synced" ? "已同步" : "待同步"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleViewRecords(table)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleSync(table)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleUnlink(table)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </CardContent>
      </Card>

      <Dialog open={recordsOpen} onOpenChange={setRecordsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{currentTable?.name} — 记录列表</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            {records.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">暂无记录</p>
            ) : (
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                {JSON.stringify(records, null, 2)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
