import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, X, Building2, DoorOpen } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { spaceApi, type Space } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function SpacesPage() {
  const enterToNext = useEnterToNext()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSpace, setSelectedSpace] = useState<string>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSpaceDialogOpen, setDeleteSpaceDialogOpen] = useState(false)
  const [deletingRoom, setDeletingRoom] = useState<{ spaceId: string; roomId: string; roomName: string } | null>(null)
  const [deletingSpace, setDeletingSpace] = useState<Space | null>(null)
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [saving, setSaving] = useState(false)
  const [spaceName, setSpaceName] = useState("")
  const [roomName, setRoomName] = useState("")

  const loadSpaces = () => {
    spaceApi.list()
      .then(setSpaces)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSpaces()
  }, [])

  // 右侧内容：全部=空间列表，选中某空间=房间列表
  const currentSpace = spaces.find(s => s.name === selectedSpace)
  const filteredRooms = currentSpace ? currentSpace.rooms : []

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(
    currentSpace ? filteredRooms : spaces
  )

  const handleCreateSpace = async () => {
    if (!spaceName.trim()) return
    setSaving(true)
    try {
      await spaceApi.create({ name: spaceName.trim() })
      setSpaceDialogOpen(false)
      setSpaceName("")
      loadSpaces()
    } finally {
      setSaving(false)
    }
  }

  const handleOpenEditSpace = (space: Space) => {
    setEditingSpace(space)
    setSpaceName(space.name)
    setSpaceDialogOpen(true)
  }

  const handleSaveSpace = async () => {
    if (!spaceName.trim()) return
    setSaving(true)
    try {
      if (editingSpace) {
        await spaceApi.update(editingSpace.id, { name: spaceName.trim() })
      } else {
        await spaceApi.create({ name: spaceName.trim() })
      }
      setSpaceDialogOpen(false)
      setSpaceName("")
      setEditingSpace(null)
      loadSpaces()
    } finally {
      setSaving(false)
    }
  }

  const handleAddRoom = async () => {
    if (!roomName.trim() || !currentSpace) return
    setSaving(true)
    try {
      await spaceApi.addRoom(currentSpace.id, { name: roomName.trim() })
      setDialogOpen(false)
      setRoomName("")
      loadSpaces()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSpace = async () => {
    if (!deletingSpace) return
    await spaceApi.delete(deletingSpace.id)
    if (selectedSpace === deletingSpace.name) setSelectedSpace("全部")
    setDeleteSpaceDialogOpen(false)
    setDeletingSpace(null)
    loadSpaces()
  }

  const handleDeleteRoom = async () => {
    if (!deletingRoom) return
    await spaceApi.deleteRoom(deletingRoom.spaceId, deletingRoom.roomId)
    setDeleteDialogOpen(false)
    setDeletingRoom(null)
    loadSpaces()
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold text-left">疗愈空间</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            共 {spaces.length} 个空间，{spaces.reduce((sum, s) => sum + s.rooms.length, 0)} 个房间
          </p>
        </div>
      </div>

      {/* 主内容区 - 左右布局 */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧 - 空间列表 */}
        <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-[13px] font-medium text-[#2b2f36]">空间列表</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingSpace(null); setSpaceName(""); setSpaceDialogOpen(true) }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : spaces.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无空间</div>
            ) : (
              <div className="py-1">
                {/* 全部 */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                    selectedSpace === "全部"
                      ? "bg-[#f0f5ff] text-[#3370ff]"
                      : "text-[#646a73] hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => setSelectedSpace("全部")}
                >
                  <span className="text-[13px] font-light">全部</span>
                  <Badge variant="secondary" className="text-[11px] font-normal shrink-0 ml-2">
                    {spaces.length}
                  </Badge>
                </div>
                {/* 分割线 */}
                <div className="mx-4 my-1 border-t border-[#f0f0f0]" />
                {/* 各空间 */}
                {spaces.map((space) => (
                  <div
                    key={space.id}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${
                      selectedSpace === space.name
                        ? "bg-[#f0f5ff] text-[#3370ff]"
                        : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                    }`}
                    onClick={() => setSelectedSpace(space.name)}
                  >
                    <span className="text-[13px] truncate">{space.name}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {space.rooms.length}
                      </Badge>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                        onClick={(e) => { e.stopPropagation(); setDeletingSpace(space); setDeleteSpaceDialogOpen(true) }}
                      >
                        <Trash2 className="h-3 w-3 text-[#8f959e]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧 - 内容区 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          {selectedSpace === "全部" ? (
            // 全部：空间概览表
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[#2b2f36]">全部空间</span>
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {spaces.length} 个空间
                  </Badge>
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => { setEditingSpace(null); setSpaceName(""); setSpaceDialogOpen(true) }}>
                  <Plus className="mr-1 h-3 w-3" /> 新增空间
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {spaces.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">暂无疗愈空间</p>
                    <p className="text-xs text-muted-foreground mt-1">点击上方"新增空间"按钮添加</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4">空间名称</TableHead>
                        <TableHead>房间数</TableHead>
                        <TableHead>房间列表</TableHead>
                        <TableHead className="text-right pr-4">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.map((space) => (
                        <TableRow key={space.id} className="cursor-pointer hover:bg-[#f7f8fa]" onClick={() => setSelectedSpace(space.name)}>
                          <TableCell className="pl-4">
                            <span className="text-[13px] text-[#2b2f36] font-medium">{space.name}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-[13px] text-[#2b2f36]">{space.rooms.length} 个</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-[13px] text-[#8f959e] max-w-[300px] truncate inline-block">
                              {space.rooms.length > 0 ? space.rooms.map(r => r.name).join("、") : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEditSpace(space)}>
                                <Building2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingSpace(space); setDeleteSpaceDialogOpen(true) }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
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
            </>
          ) : (
            // 选中空间：房间列表
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[#2b2f36]">{selectedSpace}</span>
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {currentSpace?.rooms.length || 0} 个房间
                  </Badge>
                  {currentSpace && (
                    <button
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] transition-colors"
                      onClick={() => { setDeletingSpace(currentSpace); setDeleteSpaceDialogOpen(true) }}
                    >
                      <Trash2 className="h-3 w-3 text-[#8f959e]" />
                    </button>
                  )}
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => { setRoomName(""); setDialogOpen(true) }}>
                  <Plus className="mr-1 h-3 w-3" /> 添加房间
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredRooms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <DoorOpen className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">该空间下暂无房间</p>
                    <p className="text-xs text-muted-foreground mt-1">点击上方"添加房间"按钮添加</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4">房间名称</TableHead>
                        <TableHead className="text-right pr-4">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.map((room) => (
                        <TableRow key={room.id}>
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-2">
                              <DoorOpen className="h-3.5 w-3.5 text-[#8f959e]" />
                              <span className="text-[13px] text-[#2b2f36]">{room.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => { setDeletingRoom({ spaceId: currentSpace!.id, roomId: room.id, roomName: room.name }); setDeleteDialogOpen(true) }}
                            >
                              <X className="h-3.5 w-3.5 text-[#8f959e] hover:text-destructive" />
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
            </>
          )}
        </div>
      </div>

      {/* 新增/编辑空间弹窗 */}
      <Dialog open={spaceDialogOpen} onOpenChange={setSpaceDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingSpace ? "编辑空间" : "新增空间"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">空间名称</span>
              <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder="请输入空间名称" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setSpaceDialogOpen(false); setEditingSpace(null) }}>取消</Button>
              <Button size="sm" onClick={handleSaveSpace} disabled={saving || !spaceName.trim()}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 添加房间弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">添加房间</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">房间名称</span>
              <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="请输入房间名称" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleAddRoom} disabled={saving || !roomName.trim()}>
                {saving ? "添加中..." : "添加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除空间确认弹窗 */}
      <AlertDialog open={deleteSpaceDialogOpen} onOpenChange={setDeleteSpaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除空间</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除空间「{deletingSpace?.name}」吗？该空间下的所有房间也将被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSpace}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除房间确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除房间</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除房间「{deletingRoom?.roomName}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoom}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
