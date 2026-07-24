import { useEffect, useState, useCallback, useRef } from "react"
import { Plus, Trash2, Edit, Users, Building2, ArrowUp, ArrowDown, ImagePlus, X } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { organizationApi, customerApi, courseTypeApi, uploadApi, type Organization, type Customer, type CourseType } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [saving, setSaving] = useState(false)
  const [orgName, setOrgName] = useState("")
  const [nameError, setNameError] = useState("")
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [memberIdMap, setMemberIdMap] = useState<Map<string, string>>(new Map())
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [memberAddOpen, setMemberAddOpen] = useState(false)
  const [memberName, setMemberName] = useState("")
  const [deleteMemberDialogOpen, setDeleteMemberDialogOpen] = useState(false)
  const [deletingMember, setDeletingMember] = useState<{ id: string; nickname: string } | null>(null)
  const [deleteMemberInput, setDeleteMemberInput] = useState("")
  const [deleteMemberError, setDeleteMemberError] = useState("")

  // 活动类型 tab: members=成员列表, salons=沙龙活动, others=其他活动
  const [activeTab, setActiveTab] = useState<"members" | "salons" | "others">("members")
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [actDialogOpen, setActDialogOpen] = useState(false)
  const [actEditingType, setActEditingType] = useState<string | null>(null)
  const [actFormName, setActFormName] = useState("")
  const [actFormShowInClient, setActFormShowInClient] = useState(true)
  const [actFormError, setActFormError] = useState("")
  const [actDeleteDialogOpen, setActDeleteDialogOpen] = useState(false)
  const [actDeletingType, setActDeletingType] = useState<string | null>(null)
  const [actBlockedOpen, setActBlockedOpen] = useState(false)
  const [actFormListImage, setActFormListImage] = useState("")
  const [actFormDetailImages, setActFormDetailImages] = useState<string[]>([])
  const [actUploading, setActUploading] = useState(false)
  const [actUploadError, setActUploadError] = useState("")
  const listImageRef = useRef<HTMLInputElement>(null)
  const detailImagesRef = useRef<HTMLInputElement>(null)
  const [actListImageWarn, setActListImageWarn] = useState("")
  const [actDetailImageWarn, setActDetailImageWarn] = useState("")
  const [actEditingIsOther, setActEditingIsOther] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const orgs = await organizationApi.list().catch((e) => { console.error("加载组织失败:", e); return [] as Organization[] })
      setOrganizations(orgs)
      setActiveOrgId(prev => prev || (orgs.length > 0 ? orgs[0].id : null))
    } catch {}
    try {
      const custs = await customerApi.list().catch((e) => { console.error("加载客户失败:", e); return [] as Customer[] })
      setCustomers(custs)
    } catch {}
    try {
      const types = await courseTypeApi.list().catch(() => [] as CourseType[])
      setCourseTypes(types)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const newMap = new Map<string, string>()
    for (const c of customers) {
      newMap.set(c.nickname, c.id)
    }
    setMemberIdMap(newMap)
  }, [customers])

  const activeOrg = organizations.find(o => o.id === activeOrgId) || null

  const FIXED_ORG_NAME = "无忧茶苑"

  const sortedOrganizations = [...organizations].sort((a, b) => {
    // 无忧茶苑始终置顶
    if (a.name === FIXED_ORG_NAME) return -1
    if (b.name === FIXED_ORG_NAME) return 1
    return (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
  })

  const handleMoveOrg = async (org: Organization, direction: "up" | "down") => {
    const idx = sortedOrganizations.findIndex(o => o.id === org.id)
    if (idx < 0) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sortedOrganizations.length) return

    const reordered = [...sortedOrganizations]
    const tmp = reordered[idx]
    reordered[idx] = reordered[targetIdx]
    reordered[targetIdx] = tmp

    try {
      const updates = reordered
        .map((o, i) => ({ o, newOrder: i }))
        .filter(({ o, newOrder }) => (o.sort_order ?? 9999) !== newOrder)
      await Promise.all(
        updates.map(({ o, newOrder }) =>
          organizationApi.update(o.id, { sort_order: newOrder })
        )
      )
      loadData()
    } catch (error) {
      console.error("排序失败:", error)
    }
  }

  const handleMoveMember = async (memberId: string, direction: "up" | "down") => {
    if (!activeOrg) return
    const ids = [...activeOrg.member_ids]
    const idx = ids.indexOf(memberId)
    if (idx < 0) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= ids.length) return
    const tmp = ids[idx]
    ids[idx] = ids[targetIdx]
    ids[targetIdx] = tmp
    try {
      await organizationApi.update(activeOrg.id, { member_ids: ids })
      loadData()
    } catch (error) {
      console.error("排序失败:", error)
    }
  }

  const getMemberNicknames = (org: Organization) =>
    org.member_ids
      .map(id => customers.find(c => c.id === id)?.nickname)
      .filter((n): n is string => !!n)

  const getMemberDisplayNames = (org: Organization) =>
    org.member_ids
      .map(id => customers.find(c => c.id === id)?.nickname || `[已删除:${id.slice(0, 6)}]`)

  const getValidMembers = (org: Organization) =>
    org.member_ids
      .map(id => customers.find(c => c.id === id))
      .filter((c): c is Customer => !!c)

  const handleAddMember = async (nickname: string) => {
    if (!activeOrg || !nickname) return
    const customerId = memberIdMap.get(nickname)
    if (!customerId) return
    if (activeOrg.member_ids.includes(customerId)) return
    const newMemberIds = [...activeOrg.member_ids, customerId]
    try {
      await organizationApi.update(activeOrg.id, { member_ids: newMemberIds })
      loadData()
    } catch (error) {
      console.error("添加成员失败:", error)
    }
  }

  const handleOpenCreate = () => {
    setEditingOrg(null)
    setOrgName("")
    setNameError("")
    setMemberNames([])
    setDialogOpen(true)
  }

  const handleOpenEdit = (org: Organization) => {
    if (org.name === FIXED_ORG_NAME) return
    setEditingOrg(org)
    setOrgName(org.name)
    setNameError("")
    setMemberNames(getMemberDisplayNames(org))
    setDialogOpen(true)
  }

  const handleSaveOrg = async () => {
    if (!orgName.trim()) return
    const trimmedName = orgName.trim()
    const duplicate = organizations.find(
      o => o.name === trimmedName && (!editingOrg || o.id !== editingOrg.id)
    )
    if (duplicate) {
      setNameError("组织名称已存在")
      return
    }
    setNameError("")
    setSaving(true)
    try {
      const memberIds = memberNames.map(n => {
        const mappedId = memberIdMap.get(n)
        if (mappedId) return mappedId
        if (n.startsWith("[已删除:")) {
          const prefix = n.slice(6, -1)
          const org = editingOrg
          if (org) {
            const found = org.member_ids.find(id => id.startsWith(prefix))
            if (found) return found
          }
        }
        return null
      }).filter((id): id is string => !!id)
      if (editingOrg) {
        await organizationApi.update(editingOrg.id, { name: trimmedName, member_ids: memberIds })
      } else {
        await organizationApi.create({ name: trimmedName, member_ids: memberIds, sort_order: organizations.length })
      }
      setDialogOpen(false)
      setEditingOrg(null)
      loadData()
    } catch (error) {
      console.error("保存组织失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteOrg = async () => {
    if (!deletingOrg || deletingOrg.name === FIXED_ORG_NAME) return
    try {
      await organizationApi.delete(deletingOrg.id)
      if (activeOrgId === deletingOrg.id) {
        setActiveOrgId(null)
      }
      setDeleteDialogOpen(false)
      setDeletingOrg(null)
      loadData()
    } catch (error) {
      console.error("删除组织失败:", error)
    }
  }

  const handleRemoveMember = (memberId: string) => {
    if (!activeOrg) return
    const member = customers.find(c => c.id === memberId)
    const nickname = member?.nickname || memberId
    setDeletingMember({ id: memberId, nickname })
    setDeleteMemberInput("")
    setDeleteMemberError("")
    setDeleteMemberDialogOpen(true)
  }

  // 活动类型 CRUD:沙龙活动=category为空或salon, 其他活动=category=other
  const orgCourseTypes = activeOrgId ? courseTypes.filter(t => t.organization_id === activeOrgId && t.category !== "other") : []
  const otherCourseTypes = courseTypes.filter(t => t.category === "other")

  const handleOpenActCreate = () => {
    setActEditingType(null)
    setActFormName("")
    setActFormShowInClient(true)
    setActFormError("")
    setActFormListImage("")
    setActFormDetailImages([])
    setActListImageWarn("")
    setActDetailImageWarn("")
    setActUploadError("")
    setActEditingIsOther(false)
    setActDialogOpen(true)
  }

  const handleOpenActEdit = (type: CourseType) => {
    setActEditingType(type.name)
    setActFormName(type.name)
    setActFormShowInClient(type.show_in_client || false)
    setActFormError("")
    setActFormListImage(type.list_image || "")
    setActFormDetailImages(type.detail_images || [])
    setActListImageWarn("")
    setActDetailImageWarn("")
    setActUploadError("")
    setActEditingIsOther(type.category === "other")
    setActDialogOpen(true)
  }

  const handleSaveAct = async () => {
    if (!actFormName.trim() || !activeOrgId) return
    setActFormError("")
    try {
      if (actEditingType) {
        if (actFormName.trim() !== actEditingType) {
          await courseTypeApi.rename(actEditingType, actFormName.trim())
        }
        await courseTypeApi.update(actFormName.trim(), {
          organization_id: activeOrgId,
          show_in_client: actFormShowInClient,
          list_image: actFormListImage,
          detail_images: actFormDetailImages,
        })
      } else {
        await courseTypeApi.create(actFormName.trim(), activeOrgId, actFormShowInClient, actFormListImage, actFormDetailImages)
      }
      setActDialogOpen(false)
      const types = await courseTypeApi.list().catch(() => [] as CourseType[])
      setCourseTypes(types)
    } catch (e: any) {
      setActFormError(e?.message || "保存失败")
    }
  }

  // 图片探针:读取本地图片的宽高,用于上传前的软性校验(失败不阻塞上传)
  const probeImage = (file: File): Promise<{ w: number; h: number }> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")) }
      img.src = url
    })

  const handleUploadListImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const warns: string[] = []
    if (file.size > 2 * 1024 * 1024) warns.push("体积超过 2MB，建议压缩至 500KB 内")
    try {
      const { w, h } = await probeImage(file)
      const r = w / h
      if (r < 0.66 || r > 0.8) warns.push("比例不是竖版 3:4，列表中会居中裁切")
    } catch {
      // 探针失败不阻塞
    }
    setActListImageWarn(warns.join("；"))
    setActUploadError("")
    setActUploading(true)
    try {
      const material = await uploadApi.uploadPublicImage(file)
      setActFormListImage(material.url)
    } catch (error) {
      setActUploadError(error instanceof Error ? error.message : "列表图片上传失败")
    } finally {
      setActUploading(false)
      if (listImageRef.current) listImageRef.current.value = ""
    }
  }

  const handleUploadDetailImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const warns: string[] = []
    if (file.size > 3 * 1024 * 1024) warns.push("单张超过 3MB，建议压缩至 1MB 内")
    try {
      const { w } = await probeImage(file)
      if (w < 1000) warns.push("宽度不足 1200px，详情页全宽显示会模糊")
    } catch {
      // 探针失败不阻塞
    }
    setActDetailImageWarn(warns.join("；"))
    setActUploadError("")
    setActUploading(true)
    try {
      const material = await uploadApi.uploadPublicImage(file)
      setActFormDetailImages(prev => [...prev, material.url])
    } catch (error) {
      setActUploadError(error instanceof Error ? error.message : "详情图片上传失败")
    } finally {
      setActUploading(false)
      if (detailImagesRef.current) detailImagesRef.current.value = ""
    }
  }

  const handleDeleteAct = async () => {
    if (!actDeletingType) return
    try {
      await courseTypeApi.delete(actDeletingType)
      setActDeleteDialogOpen(false)
      setActDeletingType(null)
      const types = await courseTypeApi.list().catch(() => [] as CourseType[])
      setCourseTypes(types)
    } catch {
      setActDeleteDialogOpen(false)
      setActBlockedOpen(true)
    }
  }

  const handleMoveActType = async (typeName: string, direction: "up" | "down") => {
    const names = courseTypes.map(t => t.name)
    const idx = names.indexOf(typeName)
    if (idx < 0) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= names.length) return
    const reordered = [...names]
    const tmp = reordered[idx]
    reordered[idx] = reordered[targetIdx]
    reordered[targetIdx] = tmp
    try {
      await courseTypeApi.reorder(reordered)
      const types = await courseTypeApi.list().catch(() => [] as CourseType[])
      setCourseTypes(types)
    } catch {}
  }

  const handleConfirmDeleteMember = async () => {
    if (!activeOrg || !deletingMember) return
    if (deleteMemberInput !== deletingMember.nickname) {
      setDeleteMemberError("输入的昵称不匹配")
      return
    }
    const newMemberIds = activeOrg.member_ids.filter(id => id !== deletingMember.id)
    try {
      await organizationApi.update(activeOrg.id, { member_ids: newMemberIds })
      setDeleteMemberDialogOpen(false)
      setDeletingMember(null)
      loadData()
    } catch (error) {
      console.error("移除成员失败:", error)
    }
  }

  const members = activeOrg ? getValidMembers(activeOrg) : []
  const memberDisplayNames = activeOrg ? getMemberDisplayNames(activeOrg) : []

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">组织管理</h1>
          <p className="text-xs text-muted-foreground mt-1.5">管理组织及其成员</p>
        </div>
      </div>

      {/* 左右布局 */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧：组织列表 */}
        <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 h-[45px] border-b border-[#f0f0f0] shrink-0">
            <span className="text-[13px] font-medium text-[#2b2f36]">组织列表</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleOpenCreate}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">加载中...</div>
            ) : organizations.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无组织</div>
            ) : (
              sortedOrganizations.map((org) => {
                const isActive = activeOrgId === org.id
                const count = getMemberNicknames(org).length
                return (
                  <div
                    key={org.id}
                    className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                      isActive
                        ? "bg-[#f0f5ff] text-[#3370ff]"
                        : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                    }`}
                    onClick={() => setActiveOrgId(org.id)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {org.name !== FIXED_ORG_NAME && (
                        <div className="flex flex-col items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button className="text-[#8f959e] hover:text-[#3370ff] leading-none" onClick={(e) => { e.stopPropagation(); handleMoveOrg(org, "up") }}>
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button className="text-[#8f959e] hover:text-[#3370ff] leading-none" onClick={(e) => { e.stopPropagation(); handleMoveOrg(org, "down") }}>
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <Building2 className={`h-4 w-4 shrink-0 ${isActive ? "text-[#3370ff]" : "text-[#8f959e]"}`} />
                      <span className="text-[13px] truncate">{org.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {org.name !== FIXED_ORG_NAME && (
                        <>
                          <button
                            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenEdit(org)
                            }}
                          >
                            <Edit className="h-3 w-3 text-[#8f959e]" />
                          </button>
                          <button
                            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (org.member_ids.length > 0) {
                                setErrorMessage("删除失败，该组织中存在成员")
                                setErrorDialogOpen(true)
                                return
                              }
                              setDeletingOrg(org)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-[#8f959e]" />
                          </button>
                        </>
                      )}
                      <span className={`text-[11px] ${isActive ? "text-[#3370ff]/70" : "text-[#8f959e]"}`}>
                        {count}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 右侧面板 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          {/* Tab 切换: 成员列表 / 沙龙活动 / 其他活动 */}
          <div className="flex items-center justify-between px-4 h-[45px] border-b border-[#f0f0f0] shrink-0">
            <div className="flex items-center gap-1">
              <button
                className={`px-3 py-1.5 text-[13px] rounded transition-colors ${activeTab === "members" ? "font-medium text-[#2b2f36] bg-[#f0f5ff] text-[#3370ff]" : "text-[#8f959e] hover:text-[#2b2f36]"}`}
                onClick={() => setActiveTab("members")}
              >
                成员列表
              </button>
              <button
                className={`px-3 py-1.5 text-[13px] rounded transition-colors ${activeTab === "salons" ? "font-medium text-[#2b2f36] bg-[#f0f5ff] text-[#3370ff]" : "text-[#8f959e] hover:text-[#2b2f36]"}`}
                onClick={() => setActiveTab("salons")}
              >
                沙龙活动
              </button>
              <button
                className={`px-3 py-1.5 text-[13px] rounded transition-colors ${activeTab === "others" ? "font-medium text-[#2b2f36] bg-[#f0f5ff] text-[#3370ff]" : "text-[#8f959e] hover:text-[#2b2f36]"}`}
                onClick={() => setActiveTab("others")}
              >
                其他活动
              </button>
              {activeOrg && activeTab === "members" && (
                <span className="text-[11px] text-[#8f959e] ml-1">{members.length} 人</span>
              )}
              {activeOrg && activeTab === "salons" && (
                <span className="text-[11px] text-[#8f959e] ml-1">{orgCourseTypes.length} 个</span>
              )}
              {activeOrg && activeTab === "others" && (
                <span className="text-[11px] text-[#8f959e] ml-1">{otherCourseTypes.length} 个</span>
              )}
            </div>
            {activeOrg && activeTab === "members" && (
              <Button size="sm" className="h-7 text-xs" onClick={() => { setMemberName(""); setMemberAddOpen(true) }}>
                <Plus className="mr-1 h-3 w-3" /> 新增
              </Button>
            )}
            {activeOrg && activeTab === "salons" && (
              <Button size="sm" className="h-7 text-xs" onClick={handleOpenActCreate}>
                <Plus className="mr-1 h-3 w-3" /> 新增
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!activeOrg ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">请从左侧选择组织</p>
                <p className="text-xs text-muted-foreground mt-1">或点击"+"按钮新增组织</p>
              </div>
            ) : activeTab === "members" ? (
              /* 成员列表 */
              members.length === 0 && memberDisplayNames.filter(n => n.startsWith("[已删除:")).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">暂无成员</p>
                  <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium w-[40px] text-center">排序</TableHead>
                      <TableHead className="text-xs font-medium pl-4">昵称</TableHead>
                      <TableHead className="text-xs font-medium">姓名</TableHead>
                      <TableHead className="text-xs font-medium">会员类型</TableHead>
                      <TableHead className="text-xs font-medium">到场次数</TableHead>
                      <TableHead className="text-xs text-right pr-4">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="px-0">
                          <div className="flex flex-col items-center gap-0.5">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); handleMoveMember(member.id, "up") }}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); handleMoveMember(member.id, "down") }}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs pl-4">{member.nickname}</TableCell>
                        <TableCell className="text-xs">{member.name || "-"}</TableCell>
                        <TableCell className="text-xs">{member.member_type || "-"}</TableCell>
                        <TableCell className="text-xs">{member.visit_count || 0}</TableCell>
                        <TableCell className="text-right pr-4">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRemoveMember(member.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {memberDisplayNames
                      .filter(n => n.startsWith("[已删除:"))
                      .map((name, idx) => (
                        <TableRow key={`deleted-${idx}`} className="opacity-50">
                          <TableCell />
                          <TableCell className="text-xs pl-4">{name}</TableCell>
                          <TableCell className="text-xs">-</TableCell>
                          <TableCell className="text-xs">-</TableCell>
                          <TableCell className="text-xs">-</TableCell>
                          <TableCell className="text-right pr-4">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                              const prefix = name.slice(6, -1)
                              if (activeOrg) {
                                const found = activeOrg.member_ids.find(id => id.startsWith(prefix))
                                if (found) handleRemoveMember(found)
                              }
                            }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    }
                  </TableBody>
                </Table>
              )
            ) : activeTab === "salons" ? (
              /* 沙龙活动 */
              orgCourseTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">暂无活动类型</p>
                  <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[40px] pl-4"></TableHead>
                      <TableHead className="text-xs font-medium">类型名称</TableHead>
                      <TableHead className="text-xs font-medium w-[60px]">列表图</TableHead>
                      <TableHead className="text-xs font-medium w-[80px]">前端显示</TableHead>
                      <TableHead className="text-xs text-right pr-4">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgCourseTypes.map((type) => (
                      <TableRow key={type.name} className="group">
                        <TableCell className="pl-4">
                          <div className="flex flex-col items-center gap-0">
                            <button className="text-[#8f959e] hover:text-[#3370ff] leading-none" onClick={() => handleMoveActType(type.name, "up")}>
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button className="text-[#8f959e] hover:text-[#3370ff] leading-none" onClick={() => handleMoveActType(type.name, "down")}>
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[13px] text-[#2b2f36]">{type.name}</span>
                        </TableCell>
                        <TableCell>
                          {type.list_image ? (
                            <img src={type.list_image} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <span className="text-[11px] text-[#c9cdd4]">未设置</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-[12px] text-[#2b2f36]">{type.show_in_client ? "是" : "否"}</span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenActEdit(type)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setActDeletingType(type.name); setActDeleteDialogOpen(true) }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              /* 其他活动 */
              otherCourseTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">暂无其他活动类型</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium">类型名称</TableHead>
                      <TableHead className="text-xs font-medium w-[60px]">列表图</TableHead>
                      <TableHead className="text-xs font-medium w-[80px]">前端显示</TableHead>
                      <TableHead className="text-xs text-right pr-4">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherCourseTypes.map((type) => (
                      <TableRow key={type.name} className="group">
                        <TableCell>
                          <span className="text-[13px] text-[#2b2f36]">{type.name}</span>
                        </TableCell>
                        <TableCell>
                          {type.list_image ? (
                            <img src={type.list_image} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <span className="text-[11px] text-[#c9cdd4]">未设置</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-[12px] text-[#2b2f36]">{type.show_in_client ? "是" : "否"}</span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenActEdit(type)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </div>
        </div>
      </div>

      {/* 新增/编辑组织弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0 max-h-none overflow-visible" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingOrg ? "编辑组织" : "新增组织"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">组织名称</span>
              <div className="w-full">
                <Input value={orgName} onChange={(e) => { setOrgName(e.target.value); setNameError("") }} placeholder="请输入组织名称" />
                {nameError && <p className="text-[12px] text-red-500 mt-1">{nameError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditingOrg(null) }}>取消</Button>
              <Button size="sm" onClick={handleSaveOrg} disabled={saving || !orgName.trim()}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增成员弹窗 */}
      <Dialog open={memberAddOpen} onOpenChange={setMemberAddOpen}>
        <DialogContent className="max-w-md p-0 gap-0 max-h-none overflow-visible" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增成员</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">搜索用户</span>
              <CustomerSearchInput
                customers={customers}
                value={memberName}
                onChange={(v) => setMemberName(typeof v === "string" ? v : "")}
                excludeIds={activeOrg?.member_ids || []}
                placeholder="输入昵称或姓名搜索..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setMemberAddOpen(false)}>取消</Button>
              <Button size="sm" onClick={() => { handleAddMember(memberName); setMemberAddOpen(false) }} disabled={!memberName}>
                添加
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除组织确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除组织</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除组织「{deletingOrg?.name}」吗？关联的课程数据不会受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrg}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 错误提示弹窗 */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialogOpen(false)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除成员确认弹窗 */}
      <Dialog open={deleteMemberDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteMemberDialogOpen(false); setDeletingMember(null); setDeleteMemberInput(""); setDeleteMemberError("") } }}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">移除成员</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <p className="text-[14px] text-[#8f959e]">输入成员昵称确认移除</p>
            <div>
              <Input
                value={deleteMemberInput}
                onChange={(e) => { setDeleteMemberInput(e.target.value); setDeleteMemberError("") }}
                placeholder={deletingMember?.nickname || ""}
              />
              {deleteMemberError && <p className="text-xs text-destructive mt-1">{deleteMemberError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setDeleteMemberDialogOpen(false); setDeletingMember(null); setDeleteMemberInput(""); setDeleteMemberError("") }}>取消</Button>
              <Button size="sm" variant="destructive" onClick={handleConfirmDeleteMember} disabled={!deleteMemberInput}>
                确认移除
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增/编辑活动类型弹窗 */}
      <Dialog open={actDialogOpen} onOpenChange={setActDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{actEditingType ? (actEditingIsOther ? "编辑其他活动" : "编辑活动类型") : "新增活动类型"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型名称</span>
              <div>
                <Input value={actFormName} onChange={(e) => { setActFormName(e.target.value); setActFormError("") }} placeholder="如：冥想、瑜伽、疗愈" />
                {actFormError && <p className="text-xs text-destructive mt-1">{actFormError}</p>}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">前端显示</span>
              <div>
                <SelectDropdown
                  value={actFormShowInClient ? "true" : "false"}
                  options={[{ value: "true", label: "是" }, { value: "false", label: "否" }]}
                  onChange={(v) => setActFormShowInClient(v === "true")}
                  rounded="[2px]"
                  className="border-[#e8eaed]"
                />
                <p className="text-[11px] text-[#c9cdd4] mt-1.5">勾选后，用户可在客户端查看到课程，自主报名</p>
              </div>
            </div>
            {/* 列表图片 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">列表图片</span>
              <div>
                <input ref={listImageRef} type="file" accept="image/*" className="hidden" onChange={handleUploadListImage} />
                {actFormListImage ? (
                  <div className="relative inline-block">
                    <img src={actFormListImage} alt="" className="w-[60px] h-20 rounded object-cover border border-[#e8eaed]" />
                    <button
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2b2f36] text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                      onClick={() => { setActFormListImage(""); setActListImageWarn("") }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#e8eaed] rounded cursor-pointer hover:border-[#3370ff] transition-colors"
                    onClick={() => listImageRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4 text-[#8f959e]" />
                    <span className="text-[12px] text-[#8f959e]">{actUploading ? "上传中..." : "点击上传"}</span>
                  </label>
                )}
                <p className="text-[11px] text-[#c9cdd4] mt-1.5">用于小程序活动列表的缩略图，按竖版 3:4 居中显示</p>
                <p className="text-[11px] text-[#c9cdd4] mt-0.5">要求：竖版 3:4 或 A4 竖版（如 1200×1600px）、JPG、500KB 内；关键文字避开上下 5% 边缘</p>
                {actListImageWarn && <p className="text-[11px] text-amber-600 mt-1">{actListImageWarn}</p>}
              </div>
            </div>
            {/* 详情图片 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">详情图片</span>
              <div>
                <input ref={detailImagesRef} type="file" accept="image/*" className="hidden" onChange={handleUploadDetailImage} />
                <div className="flex flex-wrap gap-2">
                  {actFormDetailImages.map((url, idx) => (
                    <div key={idx} className="relative">
                      <img src={url} alt="" className="w-16 h-16 rounded object-cover border border-[#e8eaed]" />
                      <button
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#2b2f36] text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                        onClick={() => setActFormDetailImages(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  <label
                    className="flex items-center justify-center w-16 h-16 border border-dashed border-[#e8eaed] rounded cursor-pointer hover:border-[#3370ff] transition-colors"
                    onClick={() => detailImagesRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4 text-[#8f959e]" />
                  </label>
                </div>
                <p className="text-[11px] text-[#c9cdd4] mt-1.5">用于活动详情页正文展示，可添加多张；不传时详情页沿用列表图片</p>
                <p className="text-[11px] text-[#c9cdd4] mt-0.5">要求：横竖不限（建议横版 3:2 或竖版 3:4）、宽 ≥1200px、单张 ≤1MB</p>
                {actDetailImageWarn && <p className="text-[11px] text-amber-600 mt-1">{actDetailImageWarn}</p>}
                {actUploadError && <p className="mt-1 text-[12px] text-destructive">{actUploadError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setActDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSaveAct} disabled={!actFormName.trim() || actUploading}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除活动类型确认弹窗 */}
      <AlertDialog open={actDeleteDialogOpen} onOpenChange={setActDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动类型</AlertDialogTitle>
            <AlertDialogDescription>确定要删除类型「{actDeletingType}」吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={handleDeleteAct}>删除</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={actBlockedOpen} onOpenChange={setActBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除</AlertDialogTitle>
            <AlertDialogDescription>该活动类型存在具体活动，无法删除</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>知道了</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
