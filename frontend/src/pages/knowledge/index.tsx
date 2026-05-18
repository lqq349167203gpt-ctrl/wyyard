import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileText, Search, Trash2, Upload } from "lucide-react"
import { knowledgeApi, type KnowledgeDocument, type SearchResult } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = () => {
    knowledgeApi.listDocuments().then(setDocuments).catch(() => {})
  }

  useEffect(() => { loadDocs() }, [])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(documents)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await knowledgeApi.uploadDocument(file)
      loadDocs()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDelete = async (id: string) => {
    await knowledgeApi.deleteDocument(id)
    loadDocs()
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    const results = await knowledgeApi.search(searchQuery)
    setSearchResults(results)
    setShowResults(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">知识库</h1>
          <p className="text-sm text-muted-foreground mt-1">管理文档和知识源，供 Agent 检索使用</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv"
            className="hidden"
            onChange={handleUpload}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "上传中..." : "上传文档"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索知识库..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" onClick={handleSearch} disabled={!searchQuery.trim()}>
          搜索
        </Button>
      </div>

      {showResults && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">搜索结果</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowResults(false)}>关闭</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">未找到相关内容</p>
            ) : (
              searchResults.map((result, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      来源: {result.metadata.filename}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      相关度: {(1 - result.score).toFixed(2)}
                    </Badge>
                  </div>
                  <p className="text-sm">{result.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">文档列表</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">暂无文档，点击上方「上传文档」添加</p>
          ) : (
            <div className="space-y-3">
              {paginatedItems.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.type} · {doc.size} · {doc.chunk_count} 个分块 · {new Date(doc.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={doc.status === "indexed" ? "default" : "secondary"}>
                      {doc.status === "indexed" ? "已索引" : doc.status === "indexing" ? "索引中" : "失败"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      </Card>
    </div>
  )
}
