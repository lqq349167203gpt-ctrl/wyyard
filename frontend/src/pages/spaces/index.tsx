import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, DoorOpen } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { spaceApi, type Space } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function SpacesPage() {
  const enterToNext = useEnterToNext()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [deleteSpaceDialogOpen, setDeleteSpaceDialogOpen] = useState(false)
  const [deleteRoomInfo, setDeleteRoomInfo] = useState<{ open: boolean; spaceId: string; roomId: string; roomName: string; isReferenced: boolean; checking: boolean }>({ open: false, spaceId: "", roomId: "", roomName: "", isReferenced: false, checking: false })
  const [deletingSpace, setDeletingSpace] = useState<Space | null>(null)
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingRoom, setDeletingRoom] = useState(false)
  const [spaceName, setSpaceName] = useState("")
  const [roomName, setRoomName] = useState("")
  const [formSpaceId, setFormSpaceId] = useState("")
  const [spaceError, setSpaceError] = useState("")
  const [roomError, setRoomError] = useState("")
  const [spaceBlockedOpen, setSpaceBlockedOpen] = useState(false)
  const [spaceBlockedMessage, setSpaceBlockedMessage] = useState("")
  const [deleteRoomInput, setDeleteRoomInput] = useState("")
  const [deleteRoomError, setDeleteRoomError] = useState("")
  const [editRoomDialogOpen, setEditRoomDialogOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<{ spaceId: string; roomId: string; name: string } | null>(null)
  const [editRoomName, setEditRoomName] = useState("")
  const [editRoomError, setEditRoomError] = useState("")

  const loadSpaces = () => {
    spaceApi.list()
      .then(setSpaces)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSpaces()
  }, [])

  const currentSpace = spaces.find(s => s.id === selectedSpaceId)

  // 全部=所有空间的房间，选中某空间=该空间的房间
  const allRooms = selectedSpaceId === "全部"
    ? spaces.flatMap(s => s.rooms.map(r => ({ ...r, spaceId: s.id, spaceName: s.name })))
    : (currentSpace?.rooms.map(r => ({ ...r, spaceId: currentSpace.id, spaceName: currentSpace.name })) || [])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(allRooms)

  const handleSaveSpace = async () => {
    if (!spaceName.trim()) return
    setSaving(true)
    setSpaceError("")
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
    } catch (e: any) {
      setSpaceError(e?.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const handleAddRoom = async () => {
    if (!roomName.trim() || !formSpaceId) return
    setSaving(true)
    setRoomError("")
    try {
      await spaceApi.addRoom(formSpaceId, { name: roomName.trim() })
      setDialogOpen(false)
      setRoomName("")
      loadSpaces()
    } catch (e: any) {
      setRoomError(e?.message || "添加失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSpace = async () => {
    if (!deletingSpace || deleting) return
    setDeleting(true)
    try {
      await spaceApi.delete(deletingSpace.id)
      if (selectedSpaceId === deletingSpace.id) setSelectedSpaceId("全部")
      setDeleteSpaceDialogOpen(false)
      setDeletingSpace(null)
      loadSpaces()
    } catch (e: any) {
      setDeleteSpaceDialogOpen(false)
      setSpaceBlockedMessage(e?.message || "删除失败")
      setSpaceBlockedOpen(true)
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteRoomClick = async (spaceId: string, roomId: string, roomName: string) => {
    setDeleteRoomInfo({ open: true, spaceId, roomId, roomName, isReferenced: false, checking: true })
    setDeleteRoomInput("")
    setDeleteRoomError("")
    try {
      const { referenced } = await spaceApi.checkRoomReferenced(spaceId, roomId)
      setDeleteRoomInfo(prev => ({ ...prev, isReferenced: referenced, checking: false }))
    } catch {
      setDeleteRoomInfo(prev => ({ ...prev, checking: false }))
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteRoomInfo.open || deletingRoom) return
    if (deleteRoomInfo.isReferenced) {
      if (deleteRoomInput.toLowerCase() !== deleteRoomInfo.roomName.toLowerCase()) {
        setDeleteRoomError("输入的名称不匹配")
        return
      }
      setDeletingRoom(true)
      try {
        await spaceApi.deleteRoom(deleteRoomInfo.spaceId, deleteRoomInfo.roomId, true)
        setDeleteRoomInfo({ open: false, spaceId: "", roomId: "", roomName: "", isReferenced: false, checking: false })
        setDeleteRoomInput("")
        loadSpaces()
      } catch (e: any) {
        setDeleteRoomError(e?.message || "删除失败")
      } finally {
        setDeletingRoom(false)
      }
    } else {
      setDeletingRoom(true)
      try {
        await spaceApi.deleteRoom(deleteRoomInfo.spaceId, deleteRoomInfo.roomId)
        setDeleteRoomInfo({ open: false, spaceId: "", roomId: "", roomName: "", isReferenced: false, checking: false })
        loadSpaces()
      } catch (e: any) {
        setDeleteRoomError(e?.message || "删除失败")
      } finally {
        setDeletingRoom(false)
      }
    }
  }

  const handleOpenEditRoom = (spaceId: string, roomId: string, roomName: string) => {
    setEditingRoom({ spaceId, roomId, name: roomName })
    setEditRoomName(roomName)
    setEditRoomError("")
    setEditRoomDialogOpen(true)
  }

  const handleSaveRoomName = async () => {
    if (!editingRoom || !editRoomName.trim()) return
    setSaving(true)
    setEditRoomError("")
    try {
      await spaceApi.updateRoom(editingRoom.spaceId, editingRoom.roomId, { name: editRoomName.trim() })
      setEditRoomDialogOpen(false)
      setEditingRoom(null)
      loadSpaces()
    } catch (e: any) {
      setEditRoomError(e?.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold text-left">空间配置</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            共 {spaces.length} 个空间，{spaces.reduce((sum, s) => sum + s.rooms.length, 0)} 个房间
          </p>
        </div>
      </div>

      {/* 主内容区 - 左右布局 */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧 - 空间列表 */}
        <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
            <span className="text-[13px] font-medium text-[#2b2f36]">空间列表</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-[#3370ff] hover:text-[#3370ff] hover:bg-[#f0f5ff]" onClick={() => { setEditingSpace(null); setSpaceName(""); setSpaceDialogOpen(true) }}>
              新增
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
                    selectedSpaceId === "全部"
                      ? "bg-[#f0f5ff] text-[#3370ff]"
                      : "text-[#646a73] hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => setSelectedSpaceId("全部")}
                >
                  <span className="text-[13px] font-light">全部</span>
                  <Badge variant="secondary" className="text-[11px] font-normal shrink-0 ml-2">
                    {spaces.reduce((sum, s) => sum + s.rooms.length, 0)}
                  </Badge>
                </div>
                {/* 分割线 */}
                <div className="mx-4 my-1 border-t border-[#f0f0f0]" />
                {/* 各空间 */}
                {spaces.map((space) => (
                  <div
                    key={space.id}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${
                      selectedSpaceId === space.id
                        ? "bg-[#f0f5ff] text-[#3370ff]"
                        : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                    }`}
                    onClick={() => setSelectedSpaceId(space.id)}
                  >
                    <span className="text-[13px] truncate">{space.name}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingSpace(space)
                          setSpaceName(space.name)
                          setSpaceError("")
                          setSpaceDialogOpen(true)
                        }}
                      >
                        <Edit className="h-3 w-3 text-[#8f959e]" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (space.rooms.length > 0) {
                            setSpaceBlockedMessage(`该空间存在 ${space.rooms.length} 个房间，无法删除`)
                            setSpaceBlockedOpen(true)
                          } else {
                            setDeletingSpace(space)
                            setDeleteSpaceDialogOpen(true)
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-[#8f959e]" />
                      </button>
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {space.rooms.length}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧 - 房间列表 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[#2b2f36]">房间列表</span>
              <Badge variant="secondary" className="text-[11px] font-normal">
                {allRooms.length} 个房间
              </Badge>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => { setFormSpaceId(selectedSpaceId !== "全部" ? selectedSpaceId : ""); setRoomName(""); setRoomError(""); setDialogOpen(true) }}>
              <Plus className="mr-1 h-3 w-3" /> 添加房间
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {allRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <DoorOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">暂无房间</p>
                <p className="text-xs text-muted-foreground mt-1">点击上方"添加房间"按钮添加</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">房间名称</TableHead>
                    <TableHead>所属空间</TableHead>
                    <TableHead className="text-right pr-4">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="pl-4">
                        <span className="text-[13px] text-[#2b2f36]">{room.name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-[#8f959e]">{(room as any).spaceName}</span>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleOpenEditRoom((room as any).spaceId, room.id, room.name)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleDeleteRoomClick((room as any).spaceId, room.id, room.name)}
                          >
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
        </div>
      </div>

      {/* 新增/编辑空间弹窗 */}
      <Dialog open={spaceDialogOpen} onOpenChange={setSpaceDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingSpace ? "编辑空间" : "新增空间"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">空间名称</span>
              <div>
                <Input value={spaceName} onChange={(e) => { setSpaceName(e.target.value); setSpaceError("") }} placeholder="请输入空间名称" />
                {spaceError && <p className="text-xs text-destructive mt-1">{spaceError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setSpaceDialogOpen(false); setEditingSpace(null); setSpaceError("") }}>取消</Button>
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
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">所属空间</span>
              <SelectDropdown
                value={formSpaceId}
                options={spaces.map(s => ({ value: s.id, label: s.name }))}
                placeholder="选择空间"
                onChange={(v) => setFormSpaceId(v)}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">房间名称</span>
              <div>
                <Input value={roomName} onChange={(e) => { setRoomName(e.target.value); setRoomError("") }} placeholder="请输入房间名称" />
                {roomError && <p className="text-xs text-destructive mt-1">{roomError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setRoomError("") }}>取消</Button>
              <Button size="sm" onClick={handleAddRoom} disabled={saving || !roomName.trim() || !formSpaceId}>
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
              确定要删除空间「{deletingSpace?.name}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={handleDeleteSpace} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除空间阻断提示 */}
      <AlertDialog open={spaceBlockedOpen} onOpenChange={setSpaceBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除</AlertDialogTitle>
            <AlertDialogDescription>
              {spaceBlockedMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>知道了</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除房间弹窗 */}
      <Dialog open={deleteRoomInfo.open} onOpenChange={(open) => { if (!open) { setDeleteRoomInfo({ open: false, spaceId: "", roomId: "", roomName: "", isReferenced: false, checking: false }); setDeleteRoomInput(""); setDeleteRoomError("") } }}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">删除房间</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {deleteRoomInfo.checking ? (
              <p className="text-sm text-muted-foreground">检查中...</p>
            ) : deleteRoomInfo.isReferenced ? (
              <>
                <p className="text-sm text-muted-foreground font-normal">当前房间已被使用，输入房间名称确认删除</p>
                <div>
                  <Input
                    value={deleteRoomInput}
                    onChange={(e) => { setDeleteRoomInput(e.target.value); setDeleteRoomError("") }}
                    placeholder={deleteRoomInfo.roomName}
                  />
                  {deleteRoomError && <p className="text-xs text-destructive mt-1">{deleteRoomError}</p>}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[#2b2f36]">确定要删除房间「{deleteRoomInfo.roomName}」吗？</p>
                {deleteRoomError && <p className="text-xs text-destructive">{deleteRoomError}</p>}
              </>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setDeleteRoomInfo({ open: false, spaceId: "", roomId: "", roomName: "", isReferenced: false, checking: false }); setDeleteRoomInput(""); setDeleteRoomError("") }}>取消</Button>
              <Button size="sm" variant="destructive" onClick={handleConfirmDelete} disabled={deleteRoomInfo.checking || deletingRoom || (deleteRoomInfo.isReferenced && !deleteRoomInput)}>
                {deletingRoom ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑房间弹窗 */}
      <Dialog open={editRoomDialogOpen} onOpenChange={setEditRoomDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">编辑房间</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">房间名称</span>
              <div>
                <Input value={editRoomName} onChange={(e) => { setEditRoomName(e.target.value); setEditRoomError("") }} placeholder="请输入房间名称" />
                {editRoomError && <p className="text-xs text-destructive mt-1">{editRoomError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setEditRoomDialogOpen(false); setEditingRoom(null); setEditRoomError("") }}>取消</Button>
              <Button size="sm" onClick={handleSaveRoomName} disabled={saving || !editRoomName.trim()}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
