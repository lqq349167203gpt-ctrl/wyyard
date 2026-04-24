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
import { Database, Plus, RefreshCw } from "lucide-react"

const tables = [
  { name: "客户信息", appToken: "bascnxxx", records: 1250, lastSync: "10 分钟前", status: "已同步" },
  { name: "订单数据", appToken: "bascnyyy", records: 3420, lastSync: "30 分钟前", status: "已同步" },
  { name: "产品目录", appToken: "bascnzzz", records: 580, lastSync: "1 小时前", status: "待同步" },
  { name: "服务记录", appToken: "bascnwww", records: 8900, lastSync: "5 分钟前", status: "已同步" },
  { name: "员工排班", appToken: "bascnvvv", records: 320, lastSync: "2 小时前", status: "待同步" },
]

export default function BusinessPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">业务数据</h1>
          <p className="text-sm text-muted-foreground mt-1">飞书多维表格数据源管理</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          关联表格
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">已关联表格</CardTitle>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-1 h-3 w-3" /> 全部同步
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>表格名称</TableHead>
                <TableHead>App Token</TableHead>
                <TableHead className="text-right">记录数</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((table) => (
                <TableRow key={table.appToken}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      {table.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {table.appToken}
                  </TableCell>
                  <TableCell className="text-right">{table.records.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{table.lastSync}</TableCell>
                  <TableCell>
                    <Badge variant={table.status === "已同步" ? "default" : "secondary"}>
                      {table.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
