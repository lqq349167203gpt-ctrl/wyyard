import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, FileText, Search } from "lucide-react"
import { Input } from "@/components/ui/input"

const documents = [
  { name: "产品手册 v3.2", type: "PDF", size: "2.4 MB", status: "已索引", date: "2026-04-22" },
  { name: "常见问题汇总", type: "TXT", size: "156 KB", status: "已索引", date: "2026-04-21" },
  { name: "API 文档", type: "MD", size: "890 KB", status: "索引中", date: "2026-04-20" },
  { name: "培训资料合集", type: "PDF", size: "15.2 MB", status: "已索引", date: "2026-04-19" },
]

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">知识库</h1>
          <p className="text-sm text-muted-foreground mt-1">管理文档和知识源，供 Agent 检索使用</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          上传文档
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="搜索文档..." className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">文档列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.name}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.type} · {doc.size} · {doc.date}
                    </p>
                  </div>
                </div>
                <Badge variant={doc.status === "已索引" ? "default" : "secondary"}>
                  {doc.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
