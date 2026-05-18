import { useEffect, useState } from "react"
import { Plus, Trash2, X, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { positionApi, positionPermissionApi, accountApi } from "@/lib/api"
import type { Position, Account } from "@/lib/api"

const ALL_PAGES = [
  { key: "dashboard", label: "工作台" },
  { key: "customers", label: "用户管理" },
  { key: "healing-records", label: "客户信息" },
  { key: "class-records-visitors", label: "到场人员" },
  { key: "class-records-activities", label: "当日活动" },
  { key: "class-records-arrival", label: "到场确认" },
  { key: "membership-cards", label: "会员活动" },
  { key: "group-cases", label: "觉醒游戏" },
  { key: "emotional-releases", label: "情绪释放" },
  { key: "energy-knots", label: "能量结" },
  { key: "internal-courses", label: "内部课程" },
  { key: "group-case-sessions", label: "觉醒游戏场次" },
  { key: "emotional-release-sessions", label: "情绪释放场次" },
  { key: "energy-knot-sessions", label: "能量结场次" },
  { key: "internal-course-sessions", label: "内部课程场次" },
  { key: "agents", label: "AI 配置" },
  { key: "knowledge", label: "知识库" },
  { key: "business", label: "业务数据" },

  { key: "system-logs", label: "系统日志" },
  { key: "operation-logs", label: "操作日志" },
  { key: "accounts", label: "账号管理" },
  { key: "member-identities", label: "会员身份" },
  { key: "healing-identities", label: "疗愈身份" },
  { key: "position-management", label: "角色管理" },
  { key: "courses", label: "沙龙类型" },
  { key: "spaces", label: "疗愈空间" },
]

const PERMISSION_GROUPS = [
  { label: "业务", keys: ["customers", "healing-records"] },
  { label: "人员到场", keys: ["class-records-visitors", "class-records-activities", "class-records-arrival"] },
  { label: "付费项目", keys: ["membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses"] },
  { label: "场次", keys: ["group-case-sessions", "emotional-release-sessions", "energy-knot-sessions", "internal-course-sessions"] },
  { label: "信息配置", keys: ["courses", "member-identities", "healing-identities", "spaces"] },
  { label: "账号管理", keys: ["accounts", "position-management"] },
  { label: "系统配置", keys: ["dashboard", "agents", "knowledge", "business", "system-logs", "operation-logs"] },
]

export default function PositionManagementPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  // 弹窗状态
  const [showDialog, setShowDialog] = useState(false)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [deletePosition, setDeletePosition] = useState<Position | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")

  const loadData = async () => {
    try {
      const [p, a, perm] = await Promise.all([
        positionApi.list(),
        accountApi.list(),
        positionPermissionApi.getAll(),
      ])
      setPositions(p)
      setAccounts(a)
      setPermissions(perm)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const getPersonCount = (positionName: string) => {
    return accounts.filter(a => a.role === positionName).length
  }

  const openCreateDialog = () => {
    setEditingPosition(null)
    setFormName("")
    setFormDescription("")
    setFormPermissions(ALL_PAGES.map(p => p.key))
    setShowDialog(true)
  }

  const openEditDialog = (position: Position) => {
    setEditingPosition(position)
    setFormName(position.name)
    setFormDescription(position.description || "")
    setFormPermissions(permissions[position.name] || [])
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return

    let positionName = formName.trim()

    if (editingPosition) {
      await positionApi.update(editingPosition.id, { name: positionName, description: formDescription })
    } else {
      const created = await positionApi.create({ name: positionName, description: formDescription })
      positionName = created.name
    }

    await positionPermissionApi.set(positionName, formPermissions)

    setShowDialog(false)
    setEditingPosition(null)
    loadData()
  }

  const handleDelete = async () => {
    if (!deletePosition) return
    await positionApi.delete(deletePosition.id)
    setDeletePosition(null)
    loadData()
  }

  const handleTogglePermission = (pageKey: string) => {
    setFormPermissions(prev =>
      prev.includes(pageKey) ? prev.filter(k => k !== pageKey) : [...prev, pageKey]
    )
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">角色管理</h1>
          <p className="text-xs text-muted-foreground mt-1.5">管理各角色类型与页面权限配置</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={openCreateDialog}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 新增身份
        </Button>
      </div>

      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : positions.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无身份类型，点击上方按钮创建</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">身份名称</TableHead>
                <TableHead>角色简介</TableHead>
                <TableHead>账号数</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => (
                <TableRow key={pos.id}>
                  <TableCell className="pl-4">
                    <span className="text-[13px] text-[#2b2f36] font-medium">{pos.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#8f959e]">{pos.description || "-"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#8f959e]">{getPersonCount(pos.name)}</span>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    {pos.is_system ? (
                      <span className="text-[11px] text-[#b0b5bb]">系统角色</span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(pos)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeletePosition(pos)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="bg-white rounded-lg w-[520px] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <span className="text-sm font-medium">{editingPosition ? "编辑身份" : "新增身份"}</span>
              <button onClick={() => setShowDialog(false)}>
                <X className="h-4 w-4 text-[#8f959e]" />
              </button>
            </div>
            <div className="px-5 py-4 max-h-[500px] overflow-y-auto space-y-4">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-14 shrink-0 text-right">身份名称</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="输入身份类型名称"
                  className="h-8 flex-1"
                />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-14 shrink-0 text-right">角色简介</Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="输入角色简介"
                  className="h-8 flex-1"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground">页面权限</Label>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label} className="border border-[#e8e8e8] rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#f7f8fa] border-b border-[#e8e8e8]">
                      <span className="text-[12px] font-medium text-[#2b2f36]">{group.label}</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={group.keys.every(k => formPermissions.includes(k))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormPermissions(prev => [...new Set([...prev, ...group.keys])])
                            } else {
                              setFormPermissions(prev => prev.filter(k => !group.keys.includes(k)))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-[11px] text-[#8f959e]">全选</span>
                      </label>
                    </div>
                    <div className="px-4 py-2.5 grid grid-cols-2 gap-1">
                      {group.keys.map((key) => {
                        const page = ALL_PAGES.find(p => p.key === key)
                        return (
                          <label key={key} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#f7f8fa] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formPermissions.includes(key)}
                              onChange={() => handleTogglePermission(key)}
                              className="rounded"
                            />
                            <span className="text-[13px] text-[#2b2b2b]">{page?.label || key}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={!formName.trim()}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletePosition && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setDeletePosition(null); setDeleteConfirmName("") }}>
          <div className="bg-white rounded-lg w-[360px] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <span className="text-sm font-medium">删除角色</span>
              <button onClick={() => { setDeletePosition(null); setDeleteConfirmName("") }}>
                <X className="h-4 w-4 text-[#8f959e]" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-[#2b2f36]">
                确定要删除「<span className="font-medium">{deletePosition.name}</span>」吗？该角色下的人员不会被删除。
              </p>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">请输入角色名称确认删除</Label>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={deletePosition.name}
                  className="h-8"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <Button variant="outline" size="sm" onClick={() => { setDeletePosition(null); setDeleteConfirmName("") }}>取消</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteConfirmName !== deletePosition.name}
              >
                确定删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
