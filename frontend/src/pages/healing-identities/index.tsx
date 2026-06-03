import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Users, Zap, Plus, Trash2 } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { customerApi, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"

const HEALING_POSITIONS = [
  { key: "成就君", label: "成就君", icon: Users, desc: "负责成就达成" },
  { key: "能量结老师", label: "能量结老师", icon: Zap, desc: "负责能量结活动的课程老师" },
  { key: "课程老师", label: "课程老师", icon: Users, desc: "负责沙龙活动的课程老师" },
] as const

type PositionKey = typeof HEALING_POSITIONS[number]["key"]

export default function HealingIdentitiesPage() {
  const enterToNext = useEnterToNext()
  const [activePosition, setActivePosition] = useState<PositionKey>("成就君")
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingMember, setDeletingMember] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)

  const [selectedNicknames, setSelectedNicknames] = useState<string[]>([])

  const loadCustomers = () => {
    customerApi.list()
      .then(setCustomers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadCustomers() }, [])

  const currentConfig = HEALING_POSITIONS.find(p => p.key === activePosition)!
  const members = customers.filter(c => c.positions?.includes(activePosition))

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(members)

  const handleAddMembers = async () => {
    if (selectedNicknames.length === 0) return
    setSaving(true)
    try {
      for (const nickname of selectedNicknames) {
        const customer = customers.find(c => c.nickname === nickname)
        if (!customer) continue
        const existingPositions = customer.positions || []
        if (!existingPositions.includes(activePosition)) {
          await customerApi.update(customer.id, { positions: [...existingPositions, activePosition] })
        }
      }
      setSelectedNicknames([])
      setDialogOpen(false)
      loadCustomers()
    } catch (error) {
      console.error("添加失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingMember) return
    const newPositions = deletingMember.positions.filter(p => p !== activePosition)
    await customerApi.update(deletingMember.id, { positions: newPositions })
    setDeleteDialogOpen(false)
    setDeletingMember(null)
    loadCustomers()
  }

  const resetForm = () => {
    setSelectedNicknames([])
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">疗愈身份</h1>
          <p className="text-xs text-muted-foreground mt-1.5">管理疗愈相关身份人员配置</p>
        </div>
      </div>

      {/* 左右布局 */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧：身份类型列表 */}
        <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 h-[45px] border-b border-[#f0f0f0] shrink-0">
            <span className="text-[13px] font-medium text-[#2b2f36]">身份类型</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {HEALING_POSITIONS.map((pos) => {
              const isActive = activePosition === pos.key
              const Icon = pos.icon
              const count = customers.filter(c => c.positions?.includes(pos.key)).length
              return (
                <div
                  key={pos.key}
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#f0f5ff] text-[#3370ff]"
                      : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => setActivePosition(pos.key)}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${isActive ? "text-[#3370ff]" : "text-[#8f959e]"}`} />
                    <span className="text-[13px] truncate">{pos.label}</span>
                  </div>
                  <span className={`text-[11px] ${isActive ? "text-[#3370ff]/70" : "text-[#8f959e]"}`}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧：人员列表 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 h-[45px] border-b border-[#f0f0f0] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[#2b2f36]">{currentConfig.label}</span>
              <span className="text-[11px] text-[#8f959e]">{members.length} 人</span>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => { resetForm(); setDialogOpen(true) }}>
              <Plus className="mr-1 h-3 w-3" /> 新增
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">暂无{currentConfig.label}</p>
                <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium pl-4">昵称</TableHead>
                    <TableHead className="text-xs font-medium">姓名</TableHead>
                    <TableHead className="text-xs font-medium">会员类型</TableHead>
                    <TableHead className="text-xs font-medium">到场次数</TableHead>
                    <TableHead className="text-xs text-right pr-4">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="text-xs pl-4">{member.nickname}</TableCell>
                      <TableCell className="text-xs">{member.name || "-"}</TableCell>
                      <TableCell className="text-xs">{member.member_type || "-"}</TableCell>
                      <TableCell className="text-xs">{member.visit_count || 0}</TableCell>
                      <TableCell className="text-right pr-4">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingMember(member); setDeleteDialogOpen(true) }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={goToPage}
          />
        </div>
      </div>

      {/* 新增弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增{currentConfig.label}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">搜索用户</span>
              <CustomerSearchInput
                customers={customers}
                value={selectedNicknames}
                onChange={(v) => setSelectedNicknames(v as string[])}
                multi
                excludeIds={members.map(m => m.id)}
                placeholder="输入昵称或姓名搜索..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleAddMembers} disabled={saving || selectedNicknames.length === 0}>
                {saving ? "添加中..." : `添加 (${selectedNicknames.length} 人)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除{currentConfig.label}</AlertDialogTitle>
            <AlertDialogDescription>
              确定要将 {deletingMember?.nickname || deletingMember?.name} 从{currentConfig.label}中移除吗？用户数据不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
