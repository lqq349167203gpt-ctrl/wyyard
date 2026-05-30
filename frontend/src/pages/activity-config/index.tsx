import { Fragment, useCallback, useEffect, useState } from "react"
import { Loader2, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { memberIdentityApi, activityPermissionApi, type MemberIdentity, type ActivityPermissions } from "@/lib/api"

const ACTIVITY_TYPES = ["沙龙活动", "觉醒游戏", "情绪释放", "能量结", "内部课程"] as const

export function ActivityConfigContent({ embedded }: { embedded?: boolean } = {}) {
  const [identities, setIdentities] = useState<MemberIdentity[]>([])
  const [savedPermissions, setSavedPermissions] = useState<ActivityPermissions>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editingIdentity, setEditingIdentity] = useState<string>("")
  const [editPerms, setEditPerms] = useState<Record<string, { view: boolean; participate: boolean }>>({})

  const loadData = useCallback(async () => {
    const [identitiesList, perms] = await Promise.all([
      memberIdentityApi.list(),
      activityPermissionApi.getAll(),
    ])
    setIdentities(identitiesList)
    setSavedPermissions(perms)
  }, [])

  useEffect(() => {
    loadData().catch(() => {}).finally(() => setLoading(false))
  }, [loadData])

  const openDialog = (identityName: string) => {
    const saved = savedPermissions[identityName] || {}
    const init: Record<string, { view: boolean; participate: boolean }> = {}
    for (const at of ACTIVITY_TYPES) {
      init[at] = saved[at] ?? { view: true, participate: true }
    }
    setEditingIdentity(identityName)
    setEditPerms(init)
    setShowDialog(true)
  }

  const togglePerm = (activityType: string, field: "view" | "participate") => {
    setEditPerms(prev => ({
      ...prev,
      [activityType]: { ...prev[activityType], [field]: !prev[activityType][field] },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = savedPermissions[editingIdentity]
      if (!saved && ACTIVITY_TYPES.every(at => editPerms[at]?.view !== false && editPerms[at]?.participate !== false)) {
        setShowDialog(false)
        return
      }
      if (saved && JSON.stringify(saved) === JSON.stringify(editPerms)) {
        setShowDialog(false)
        return
      }
      await activityPermissionApi.saveAll({ [editingIdentity]: editPerms })
      setSavedPermissions(prev => ({ ...prev, [editingIdentity]: editPerms }))
      setShowDialog(false)
    } catch (e) {
      console.error("保存失败:", e)
    } finally {
      setSaving(false)
    }
  }

  const permIcon = (allowed: boolean) => (
    allowed
      ? <Check className="h-3.5 w-3.5 text-[#3370ff] inline-block" />
      : <X className="h-3.5 w-3.5 text-[#d0d3d8] inline-block" />
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#8f959e]" />
      </div>
    )
  }

  return (
    <div className={embedded ? "space-y-3" : "px-6 pt-12 pb-6 space-y-3"}>
      {!embedded && (
        <div>
          <h1 className="text-lg font-semibold text-[#2b2f36]">活动配置</h1>
          <p className="text-xs text-[#8f959e] mt-0.5">按会员身份配置每种活动的浏览与参与权限</p>
        </div>
      )}

      {embedded && (
        <div className="flex items-center justify-between h-8">
          <span className="text-xs text-muted-foreground">按会员身份配置每种活动的浏览与参与权限</span>
        </div>
      )}

      <div className="bg-white rounded-lg">
        {identities.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8f959e]">暂无会员身份，请先在"会员身份"页面创建</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 w-28 !h-auto" rowSpan={2}>会员身份</TableHead>
                {ACTIVITY_TYPES.map(at => (
                  <TableHead key={at} colSpan={2} className="text-center h-7 text-[12px]">{at}</TableHead>
                ))}
                <TableHead className="text-center w-16 !h-auto" rowSpan={2}>权限</TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                {ACTIVITY_TYPES.map(at => (
                  <Fragment key={at}>
                    <TableHead className="text-center text-[12px] font-normal text-[#b0b5bb] px-0 h-7 w-8">浏览</TableHead>
                    <TableHead className="text-center text-[12px] font-normal text-[#b0b5bb] px-0 h-7 w-8">参与</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {identities.map(id => (
                <TableRow key={id.id}>
                  <TableCell className="pl-4 w-28">
                    <span className="text-[13px] text-[#2b2f36] font-medium">{id.name}</span>
                  </TableCell>
                  {ACTIVITY_TYPES.map(at => {
                    const perms = savedPermissions[id.name]?.[at]
                    const viewOk = perms?.view !== false
                    const partOk = perms?.participate !== false
                    return (
                      <Fragment key={at}>
                        <TableCell className="text-center px-0 w-8">{permIcon(viewOk)}</TableCell>
                        <TableCell className="text-center px-0 w-8">{permIcon(partOk)}</TableCell>
                      </Fragment>
                    )
                  })}
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-[#3370ff]" onClick={() => openDialog(id.name)}>
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 编辑弹窗 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="bg-white rounded-lg w-[400px] shadow-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <span className="text-sm font-medium">编辑{editingIdentity}权限</span>
              <button onClick={() => setShowDialog(false)}>
                <X className="h-4 w-4 text-[#8f959e]" />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-3">
              {ACTIVITY_TYPES.map(at => {
                const perms = editPerms[at] ?? { view: true, participate: true }
                return (
                  <div key={at} className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-[#2b2f36]">{at}</span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perms.view !== false}
                          onChange={() => togglePerm(at, "view")}
                          className="rounded"
                        />
                        <span className="text-[12px] text-[#646a73]">浏览</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perms.participate !== false}
                          onChange={() => togglePerm(at, "participate")}
                          className="rounded"
                        />
                        <span className="text-[12px] text-[#646a73]">参与</span>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
