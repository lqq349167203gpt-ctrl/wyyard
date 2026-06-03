import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Building2, DoorOpen, X } from "lucide-react"
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [roomDialogOpen, setRoomDialogOpen] = useState(false)
  const [deleteSpaceDialogOpen, setDeleteSpaceDialogOpen] = useState(false)
  const [deleteRoomDialogOpen, setDeleteRoomDialogOpen] = useState(false)
  const [deletingSpace, setDeletingSpace] = useState<Space | null>(null)
  const [deletingRoom, setDeletingRoom] = useState<{ spaceId: string; roomId: string; roomName: string } | null>(null)
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("")
  const [spaceName, setSpaceName] = useState("")
  const [roomName, setRoomName] = useState("")
  const [saving, setSaving] = useState(false)

  const loadSpaces = () => {
    spaceApi.list()
      .then(setSpaces)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSpaces()
  }, [])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(spaces)

  const handleCreateSpace = async () => {
    if (!spaceName.trim()) return
    setSaving(true)
    try {
      await spaceApi.create({ name: spaceName.trim() })
      setDialogOpen(false)
      setSpaceName("")
      loadSpaces()
    } finally {
      setSaving(false)
    }
  }

  const handleAddRoom = async () => {
    if (!roomName.trim() || !selectedSpaceId) return
    setSaving(true)
    try {
      await spaceApi.addRoom(selectedSpaceId, { name: roomName.trim() })
      setRoomDialogOpen(false)
      setRoomName("")
      loadSpaces()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSpace = async () => {
    if (!deletingSpace) return
    await spaceApi.delete(deletingSpace.id)
    setDeleteSpaceDialogOpen(false)
    setDeletingSpace(null)
    loadSpaces()
  }

  const handleDeleteRoom = async () => {
    if (!deletingRoom) return
    await spaceApi.deleteRoom(deletingRoom.spaceId, deletingRoom.roomId)
    setDeleteRoomDialogOpen(false)
    setDeletingRoom(null)
    loadSpaces()
  }

  const openAddRoom = (spaceId: string) => {
    setSelectedSpaceId(spaceId)
    setRoomName("")
    setRoomDialogOpen(true)
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">疗愈空间</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            共 {spaces.length} 个疗愈空间
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => { setSpaceName(""); setDialogOpen(true) }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增空间
        </Button>
      </div>

      {/* 新增空间弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增疗愈空间</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">空间名称</span>
              <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder="请输入空间名称" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleCreateSpace} disabled={saving || !spaceName.trim()}>
                {saving ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增房间弹窗 */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增房间</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">房间名称</span>
              <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="请输入房间名称" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setRoomDialogOpen(false)}>取消</Button>
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
      <AlertDialog open={deleteRoomDialogOpen} onOpenChange={setDeleteRoomDialogOpen}>
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

      {/* 空间列表 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : spaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无疗愈空间</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增空间"按钮添加</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f0]">
            {paginatedItems.map((space) => (
              <div key={space.id}>
                {/* 空间行 */}
                <div className="flex items-center justify-between px-4 py-3 hover:bg-[#f7f8fa] transition-colors">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#8f959e]" />
                    <span className="text-[13px] text-[#2b2f36] font-medium">{space.name}</span>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {space.rooms.length} 个房间
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openAddRoom(space.id)}>
                      <Plus className="mr-1 h-3 w-3" /> 添加房间
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingSpace(space); setDeleteSpaceDialogOpen(true) }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* 房间列表 */}
                {space.rooms.length > 0 && (
                  <div className="bg-[#fafbfc]">
                    {space.rooms.map((room) => (
                      <div key={room.id} className="flex items-center justify-between pl-12 pr-4 py-2.5 hover:bg-[#f0f1f2] transition-colors">
                        <div className="flex items-center gap-2">
                          <DoorOpen className="h-3.5 w-3.5 text-[#8f959e]" />
                          <span className="text-[13px] text-[#2b2f36]">{room.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => { setDeletingRoom({ spaceId: space.id, roomId: room.id, roomName: room.name }); setDeleteRoomDialogOpen(true) }}
                        >
                          <X className="h-3 w-3 text-[#8f959e] hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 空房间提示 */}
                {space.rooms.length === 0 && (
                  <div className="bg-[#fafbfc] pl-12 pr-4 py-4 text-[12px] text-[#8f959e]">
                    暂无房间，点击上方"添加房间"按钮添加
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
  )
}
