import { Fragment, useEffect, useState, useCallback, useRef } from "react"
import { Plus, Trash2, Edit, ArrowUp, ArrowDown, CircleAlert, ImagePlus, X } from "lucide-react"
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

/** 与客户资料页一致的空值占位：4×2 极淡圆角短横 */
const EmptyValue = () => (
  <span className="inline-block h-[2px] w-[4px] shrink-0 rounded-full bg-[#e5e8eb] align-middle" />
)

const MAX_PUBLIC_IMAGE_SIZE = 2 * 1024 * 1024

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
  const [deletingMember, setDeletingMember] = useState<{ id: string; nickname: string; organizationId: string } | null>(null)
  const [deleteMemberInput, setDeleteMemberInput] = useState("")
  const [deleteMemberError, setDeleteMemberError] = useState("")

  const [activeTab, setActiveTab] = useState<"members" | "activities">("members")
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [actDialogOpen, setActDialogOpen] = useState(false)
  const [actEditingType, setActEditingType] = useState<string | null>(null)
  const [actFormName, setActFormName] = useState("")
  const [actFormOrganizationId, setActFormOrganizationId] = useState("")
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
  const FIXED_ORG_ALIASES = new Set(["无忧茶苑", "无忧茶院"])
  const isFixedOrganization = (name: string) => FIXED_ORG_ALIASES.has(name.trim())

  const sortedOrganizations = [...organizations].sort((a, b) => {
    // 无忧茶苑始终置顶
    if (isFixedOrganization(a.name)) return -1
    if (isFixedOrganization(b.name)) return 1
    return (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
  })
  const firstMovableOrgIndex = sortedOrganizations[0] && isFixedOrganization(sortedOrganizations[0].name) ? 1 : 0

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

  const handleMoveMember = async (org: Organization, memberId: string, direction: "up" | "down") => {
    const ids = [...org.member_ids]
    const idx = ids.indexOf(memberId)
    if (idx < 0) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= ids.length) return
    const tmp = ids[idx]
    ids[idx] = ids[targetIdx]
    ids[targetIdx] = tmp
    try {
      await organizationApi.update(org.id, { member_ids: ids })
      loadData()
    } catch (error) {
      console.error("排序失败:", error)
    }
  }

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
    if (isFixedOrganization(org.name)) return
    setEditingOrg(org)
    setOrgName(org.name)
    setNameError("")
    setMemberNames(getMemberDisplayNames(org))
    setDialogOpen(true)
  }

  const handleSaveOrg = async () => {
    if (!orgName.trim()) return
    const trimmedName = orgName.trim()
    const comparableName = isFixedOrganization(trimmedName) ? FIXED_ORG_NAME : trimmedName
    const duplicate = organizations.find(
      o => (isFixedOrganization(o.name) ? FIXED_ORG_NAME : o.name) === comparableName
        && (!editingOrg || o.id !== editingOrg.id)
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
    if (!deletingOrg || isFixedOrganization(deletingOrg.name)) return
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

  const handleRemoveMember = (org: Organization, memberId: string) => {
    const member = customers.find(c => c.id === memberId)
    const nickname = member?.nickname || memberId
    setDeletingMember({ id: memberId, nickname, organizationId: org.id })
    setDeleteMemberInput("")
    setDeleteMemberError("")
    setDeleteMemberDialogOpen(true)
  }

  // 内置的其他活动与普通活动合并展示，但保留不可改名、不可删除的约束。
  const salonCourseTypes = courseTypes.filter(t => t.category !== "other")
  const otherCourseTypes = courseTypes.filter(t => t.category === "other")
  const activityTypes = [...salonCourseTypes, ...otherCourseTypes]
  const knownOrganizationIds = new Set(sortedOrganizations.map(org => org.id))
  const unassignedCourseTypes = salonCourseTypes.filter(
    type => !type.organization_id || !knownOrganizationIds.has(type.organization_id)
  )
  const hasFixedOrganization = sortedOrganizations.some(org => isFixedOrganization(org.name))
  const activityGroups = [
    ...sortedOrganizations.map(org => ({
      key: org.id,
      name: isFixedOrganization(org.name) ? FIXED_ORG_NAME : org.name,
      organizationId: org.id,
      types: [
        ...salonCourseTypes.filter(type => type.organization_id === org.id),
        ...(isFixedOrganization(org.name) ? otherCourseTypes : []),
      ],
    })),
    ...(unassignedCourseTypes.length > 0 ? [{
      key: "unassigned",
      name: "未归属",
      organizationId: "",
      types: unassignedCourseTypes,
    }] : []),
    ...(!hasFixedOrganization && otherCourseTypes.length > 0 ? [{
      key: "fixed-system",
      name: FIXED_ORG_NAME,
      organizationId: "",
      types: otherCourseTypes,
    }] : []),
  ]

  const handleOpenActCreate = (organizationId = "") => {
    setActEditingType(null)
    setActFormName("")
    setActFormOrganizationId(organizationId || sortedOrganizations[0]?.id || "")
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
    setActFormOrganizationId(type.organization_id || "")
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
    if (!actFormName.trim() || (!actEditingIsOther && !actFormOrganizationId)) return
    setActFormError("")
    try {
      if (actEditingType) {
        if (!actEditingIsOther && actFormName.trim() !== actEditingType) {
          await courseTypeApi.rename(actEditingType, actFormName.trim())
        }
        await courseTypeApi.update(actFormName.trim(), {
          ...(!actEditingIsOther ? { organization_id: actFormOrganizationId } : {}),
          list_image: actFormListImage,
          detail_images: actFormDetailImages,
        })
      } else {
        await courseTypeApi.create(actFormName.trim(), actFormOrganizationId, actFormListImage, actFormDetailImages)
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
    setActUploadError("")
    if (file.size > MAX_PUBLIC_IMAGE_SIZE) {
      setActListImageWarn("")
      setActUploadError("列表图片上传失败：图片不能超过 2MB，请压缩后重试")
      if (listImageRef.current) listImageRef.current.value = ""
      return
    }
    const warns: string[] = []
    try {
      const { w, h } = await probeImage(file)
      const r = w / h
      if (r < 0.76 || r > 0.84) warns.push("图片不是竖版 4:5，小程序列表会居中裁切")
    } catch {
      // 探针失败不阻塞
    }
    setActListImageWarn(warns.join("；"))
    setActUploading(true)
    try {
      const material = await uploadApi.uploadPublicImage(file)
      setActFormListImage(material.url)
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      setActUploadError(`列表图片上传失败：${message}`)
    } finally {
      setActUploading(false)
      if (listImageRef.current) listImageRef.current.value = ""
    }
  }

  const handleUploadDetailImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setActUploadError("")
    if (file.size > MAX_PUBLIC_IMAGE_SIZE) {
      setActDetailImageWarn("")
      setActUploadError("详情图片上传失败：图片不能超过 2MB，请压缩后重试")
      if (detailImagesRef.current) detailImagesRef.current.value = ""
      return
    }
    const warns: string[] = []
    try {
      const { w, h } = await probeImage(file)
      if (w < 1200) warns.push("宽度不足 1200px，手机详情页可能不够清晰")
      if (w / h < 0.68) warns.push("图片过高，详情页会裁切部分上下内容")
    } catch {
      // 探针失败不阻塞
    }
    setActDetailImageWarn(warns.join("；"))
    setActUploading(true)
    try {
      const material = await uploadApi.uploadPublicImage(file)
      setActFormDetailImages(prev => [...prev, material.url])
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      setActUploadError(`详情图片上传失败：${message}`)
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
    const currentType = salonCourseTypes.find(type => type.name === typeName)
    if (!currentType) return
    const currentGroupId = currentType.organization_id && knownOrganizationIds.has(currentType.organization_id)
      ? currentType.organization_id
      : ""
    const groupNames = salonCourseTypes
      .filter(type => {
        const groupId = type.organization_id && knownOrganizationIds.has(type.organization_id)
          ? type.organization_id
          : ""
        return groupId === currentGroupId
      })
      .map(type => type.name)
    const idx = groupNames.indexOf(typeName)
    if (idx < 0) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= groupNames.length) return
    const names = salonCourseTypes.map(type => type.name)
    const currentGlobalIdx = names.indexOf(typeName)
    const targetGlobalIdx = names.indexOf(groupNames[targetIdx])
    const reordered = [...names]
    const tmp = reordered[currentGlobalIdx]
    reordered[currentGlobalIdx] = reordered[targetGlobalIdx]
    reordered[targetGlobalIdx] = tmp
    try {
      await courseTypeApi.reorder([...reordered, ...otherCourseTypes.map(t => t.name)])
      const types = await courseTypeApi.list().catch(() => [] as CourseType[])
      setCourseTypes(types)
    } catch {}
  }

  const handleConfirmDeleteMember = async () => {
    if (!deletingMember) return
    const organization = organizations.find(org => org.id === deletingMember.organizationId)
    if (!organization) return
    if (deleteMemberInput !== deletingMember.nickname) {
      setDeleteMemberError("输入的昵称不匹配")
      return
    }
    const newMemberIds = organization.member_ids.filter(id => id !== deletingMember.id)
    try {
      await organizationApi.update(organization.id, { member_ids: newMemberIds })
      setDeleteMemberDialogOpen(false)
      setDeletingMember(null)
      loadData()
    } catch (error) {
      console.error("移除成员失败:", error)
    }
  }

  return (
    <div className="px-6 pb-6 pt-12">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-medium text-[#2b2f36]">组织信息</h1>
          <p className="mt-1.5 text-[12px] text-[#8f959e]">集中配置组织成员与客户端活动</p>
        </div>
        {activeTab === "members" ? (
          <Button size="sm" className="h-8 text-[12px]" onClick={handleOpenCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            新增组织
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => handleOpenActCreate()}
            disabled={organizations.length === 0}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新增活动
          </Button>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between border-b border-[#e8eaed]">
        <div className="flex h-10 items-end gap-6">
          <button
            className={`h-10 border-b-2 px-1 text-[13px] transition-colors ${
              activeTab === "members"
                ? "border-[#3370ff] font-medium text-[#3370ff]"
                : "border-transparent text-[#8f959e] hover:text-[#2b2f36]"
            }`}
            onClick={() => setActiveTab("members")}
          >
            成员配置
          </button>
          <button
            className={`h-10 border-b-2 px-1 text-[13px] transition-colors ${
              activeTab === "activities"
                ? "border-[#3370ff] font-medium text-[#3370ff]"
                : "border-transparent text-[#8f959e] hover:text-[#2b2f36]"
            }`}
            onClick={() => setActiveTab("activities")}
          >
            活动配置
          </button>
        </div>
        <span className="pb-2 text-[12px] text-[#8f959e]">
          {activeTab === "members"
            ? `${organizations.length} 个组织，${organizations.reduce((sum, org) => sum + getValidMembers(org).length, 0)} 位成员`
            : `${activityTypes.length} 个活动类型`}
        </span>
      </div>

      <div className="overflow-hidden rounded-[6px] border border-[#e8eaed] bg-white">
        {activeTab === "members" ? (
          loading ? (
            <div className="py-14 text-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : sortedOrganizations.length === 0 ? (
            <div className="py-14 text-center text-[12px] text-[#8f959e]">暂无组织，请先新增组织</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-10 bg-[#f7f8fa] hover:bg-[#f7f8fa]">
                  <TableHead className="w-[210px] pl-4 text-[12px] font-medium text-[#4e535a]">组织名称</TableHead>
                  <TableHead className="w-[68px] text-center text-[12px] font-medium text-[#4e535a]">成员排序</TableHead>
                  <TableHead className="text-[12px] font-medium text-[#4e535a]">昵称</TableHead>
                  <TableHead className="text-[12px] font-medium text-[#4e535a]">姓名</TableHead>
                  <TableHead className="text-[12px] font-medium text-[#4e535a]">会员类型</TableHead>
                  <TableHead className="w-[88px] text-center text-[12px] font-medium text-[#4e535a]">到场次数</TableHead>
                  <TableHead className="w-[88px] pr-4 text-right text-[12px] font-medium text-[#4e535a]">成员操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOrganizations.map((org, orgIndex) => {
                  const rows = org.member_ids.length > 0 ? org.member_ids : [""]
                  return (
                    <Fragment key={org.id}>
                      {rows.map((memberId, memberIndex) => {
                        const member = customers.find(customer => customer.id === memberId)
                        return (
                          <TableRow key={memberId || `${org.id}-empty`} className="group min-h-12 hover:bg-[#fafbfc]">
                            {memberIndex === 0 && (
                              <TableCell
                                rowSpan={rows.length}
                                className="border-r border-[#f0f1f2] py-3 pl-4 align-top"
                              >
                                <div className="flex items-start gap-2">
                                  <div className="mt-0.5 flex w-4 shrink-0 flex-col items-center">
                                    {!isFixedOrganization(org.name) && (
                                      <>
                                        <button
                                          className="text-[#c2c6cc] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                          disabled={orgIndex <= firstMovableOrgIndex}
                                          onClick={() => handleMoveOrg(org, "up")}
                                          title="上移组织"
                                        >
                                          <ArrowUp className="h-3 w-3" />
                                        </button>
                                        <button
                                          className="text-[#c2c6cc] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                          disabled={orgIndex === sortedOrganizations.length - 1}
                                          onClick={() => handleMoveOrg(org, "down")}
                                          title="下移组织"
                                        >
                                          <ArrowDown className="h-3 w-3" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-[13px] font-medium text-[#2b2f36]">
                                        {isFixedOrganization(org.name) ? FIXED_ORG_NAME : org.name}
                                      </span>
                                      <span className="shrink-0 text-[11px] text-[#8f959e]">{getValidMembers(org).length} 人</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-[12px]">
                                      <button
                                        className="text-[#3370ff] hover:text-[#245be8]"
                                        onClick={() => {
                                          setActiveOrgId(org.id)
                                          setMemberName("")
                                          setMemberAddOpen(true)
                                        }}
                                      >
                                        添加成员
                                      </button>
                                      {!isFixedOrganization(org.name) && (
                                        <>
                                          <button className="text-[#8f959e] hover:text-[#2b2f36]" onClick={() => handleOpenEdit(org)}>编辑</button>
                                          <button
                                            className="text-[#8f959e] hover:text-[#d14343]"
                                            onClick={() => {
                                              if (org.member_ids.length > 0) {
                                                setErrorMessage("删除失败，该组织中存在成员")
                                                setErrorDialogOpen(true)
                                                return
                                              }
                                              setDeletingOrg(org)
                                              setDeleteDialogOpen(true)
                                            }}
                                          >
                                            删除
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="px-0 text-center">
                              {memberId ? (
                                <div className="flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    className="p-1 text-[#8f959e] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                    disabled={memberIndex === 0}
                                    onClick={() => handleMoveMember(org, memberId, "up")}
                                    title="上移成员"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    className="p-1 text-[#8f959e] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                    disabled={memberIndex === rows.length - 1}
                                    onClick={() => handleMoveMember(org, memberId, "down")}
                                    title="下移成员"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <EmptyValue />
                              )}
                            </TableCell>
                            <TableCell className="text-[13px] text-[#2b2f36]">
                              {member
                                ? member.nickname || <EmptyValue />
                                : memberId
                                  ? `[已删除:${memberId.slice(0, 6)}]`
                                  : <EmptyValue />}
                            </TableCell>
                            <TableCell className="text-[12px] text-[#4e535a]">{member?.name || <EmptyValue />}</TableCell>
                            <TableCell className="text-[12px] text-[#4e535a]">{member?.member_type || <EmptyValue />}</TableCell>
                            <TableCell className="text-center text-[12px] text-[#4e535a]">{member?.visit_count ?? <EmptyValue />}</TableCell>
                            <TableCell className="pr-4 text-right">
                              {memberId && (
                                <button
                                  className="text-[12px] text-[#8f959e] opacity-0 transition-opacity hover:text-[#d14343] group-hover:opacity-100"
                                  onClick={() => handleRemoveMember(org, memberId)}
                                >
                                  移除
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )
        ) : loading ? (
          <div className="py-14 text-center text-[12px] text-[#8f959e]">加载中...</div>
        ) : activityGroups.length === 0 ? (
          <div className="py-14 text-center text-[12px] text-[#8f959e]">暂无活动配置</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="h-10 bg-[#f7f8fa] hover:bg-[#f7f8fa]">
                <TableHead className="w-[210px] pl-4 text-[12px] font-medium text-[#4e535a]">组织名称</TableHead>
                <TableHead className="w-[68px] text-center text-[12px] font-medium text-[#4e535a]">活动排序</TableHead>
                <TableHead className="text-[12px] font-medium text-[#4e535a]">活动名称</TableHead>
                <TableHead className="w-[100px] text-[12px] font-medium text-[#4e535a]">配置类型</TableHead>
                <TableHead className="w-[84px] text-[12px] font-medium text-[#4e535a]">列表图</TableHead>
                <TableHead className="w-[88px] pr-4 text-right text-[12px] font-medium text-[#4e535a]">活动操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityGroups.map((group, groupIndex) => {
                const rows = group.types.length > 0 ? group.types : [null]
                const organization = group.organizationId
                  ? sortedOrganizations.find(org => org.id === group.organizationId)
                  : null
                return (
                  <Fragment key={group.key}>
                    {rows.map((type, typeIndex) => {
                      const isSystemActivity = type?.category === "other"
                      const sortableTypes = group.types.filter(item => item.category !== "other")
                      const sortableIndex = type
                        ? sortableTypes.findIndex(item => item.name === type.name)
                        : -1
                      return (
                        <TableRow key={type?.name || `${group.key}-empty`} className="group min-h-12 hover:bg-[#fafbfc]">
                          {typeIndex === 0 && (
                            <TableCell
                              rowSpan={rows.length}
                              className="border-r border-[#f0f1f2] py-3 pl-4 align-top"
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 flex w-4 shrink-0 flex-col items-center">
                                  {organization && !isFixedOrganization(organization.name) && (
                                    <>
                                      <button
                                        className="text-[#c2c6cc] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                        disabled={groupIndex <= firstMovableOrgIndex}
                                        onClick={() => handleMoveOrg(organization, "up")}
                                        title="上移组织"
                                      >
                                        <ArrowUp className="h-3 w-3" />
                                      </button>
                                      <button
                                        className="text-[#c2c6cc] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                        disabled={groupIndex === sortedOrganizations.length - 1}
                                        onClick={() => handleMoveOrg(organization, "down")}
                                        title="下移组织"
                                      >
                                        <ArrowDown className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-[13px] font-medium text-[#2b2f36]">{group.name}</span>
                                    <span className="shrink-0 text-[11px] text-[#8f959e]">{group.types.length} 个</span>
                                  </div>
                                  {group.organizationId ? (
                                    <button
                                      className="mt-2 text-[12px] text-[#3370ff] hover:text-[#245be8]"
                                      onClick={() => handleOpenActCreate(group.organizationId)}
                                    >
                                      添加活动
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="px-0 text-center">
                            {type && !isSystemActivity ? (
                              <div className="flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  className="p-1 text-[#8f959e] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                  disabled={sortableIndex === 0}
                                  onClick={() => handleMoveActType(type.name, "up")}
                                  title="上移活动"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  className="p-1 text-[#8f959e] hover:text-[#3370ff] disabled:cursor-not-allowed disabled:opacity-30"
                                  disabled={sortableIndex === sortableTypes.length - 1}
                                  onClick={() => handleMoveActType(type.name, "down")}
                                  title="下移活动"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <EmptyValue />
                            )}
                          </TableCell>
                          <TableCell className="text-[13px] text-[#2b2f36]">{type?.name || <EmptyValue />}</TableCell>
                          <TableCell>
                            {type ? (
                              <span className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] ${
                                isSystemActivity ? "bg-[#f2f3f5] text-[#6b7078]" : "bg-[#eef3ff] text-[#4d6fa9]"
                              }`}>
                                {isSystemActivity ? "系统内置" : "普通活动"}
                              </span>
                            ) : (
                              <EmptyValue />
                            )}
                          </TableCell>
                          <TableCell>
                            {type?.list_image ? (
                              <img src={type.list_image} alt="" className="h-9 w-9 rounded-[4px] border border-[#e8eaed] object-cover" />
                            ) : (
                              <EmptyValue />
                            )}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            {type && (
                              <div className="flex items-center justify-end gap-3 text-[12px] opacity-0 transition-opacity group-hover:opacity-100">
                                <button className="text-[#3370ff] hover:text-[#245be8]" onClick={() => handleOpenActEdit(type)}>编辑</button>
                                {!isSystemActivity && (
                                  <button
                                    className="text-[#8f959e] hover:text-[#d14343]"
                                    onClick={() => {
                                      setActDeletingType(type.name)
                                      setActDeleteDialogOpen(true)
                                    }}
                                  >
                                    删除
                                  </button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
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
            <DialogTitle className="text-base">{actEditingType ? "编辑活动配置" : "新增活动"}</DialogTitle>
          </DialogHeader>
          {actUploadError && (
            <div className="flex items-start gap-2 border-b border-[#f0f0f0] px-6 py-3 text-[12px] text-destructive" role="alert">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="leading-5">{actUploadError}</span>
            </div>
          )}
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型名称</span>
              <div>
                <Input
                  value={actFormName}
                  disabled={actEditingIsOther}
                  onChange={(e) => { setActFormName(e.target.value); setActFormError("") }}
                  placeholder="如：冥想、瑜伽、疗愈"
                />
                {actEditingIsOther && <p className="mt-1.5 text-[11px] text-[#8f959e]">系统内置活动名称不可修改</p>}
                {actFormError && <p className="text-xs text-destructive mt-1">{actFormError}</p>}
              </div>
            </div>
            {!actEditingIsOther && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="pt-2.5 text-right text-[12px] font-normal tracking-widest text-[#4e535a]">所属组织</span>
                <SelectDropdown
                  value={actFormOrganizationId}
                  options={sortedOrganizations.map(org => ({
                    value: org.id,
                    label: isFixedOrganization(org.name) ? FIXED_ORG_NAME : org.name,
                  }))}
                  onChange={setActFormOrganizationId}
                  rounded="[2px]"
                  className="border-[#e8eaed]"
                />
              </div>
            )}
            {/* 列表图片 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="pt-2.5 text-right text-[12px] font-normal tracking-widest text-[#4e535a]">列表图片</span>
              <div>
                <input ref={listImageRef} type="file" accept="image/*" className="hidden" onChange={handleUploadListImage} />
                {actFormListImage ? (
                  <div className="relative inline-block">
                    <img src={actFormListImage} alt="" className="h-20 w-16 rounded object-cover border border-[#e8eaed]" />
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
                <p className="mt-1.5 text-[12px] text-[#8f959e]">小程序列表按 128×160rpx（竖版 4:5）居中裁切</p>
                <p className="mt-0.5 text-[12px] text-[#8f959e]">建议 1200×1500px、2MB 内；文字和人物避开四周 8% 边缘</p>
                {actListImageWarn && <p className="mt-1 text-[12px] text-amber-600">{actListImageWarn}</p>}
              </div>
            </div>
            {/* 详情图片 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="pt-2.5 text-right text-[12px] font-normal tracking-widest text-[#4e535a]">详情图片</span>
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
                <p className="mt-1.5 text-[12px] text-[#8f959e]">详情页会自适应图片比例，与列表统一建议使用竖版 4:5</p>
                <p className="mt-0.5 text-[12px] text-[#8f959e]">建议 1200×1500px、2MB 内；超长图会裁切部分上下内容</p>
                <p className="mt-0.5 text-[12px] text-[#8f959e]">多图请保持同一比例，轮播高度以第一张图片为准；不上传则沿用列表图片</p>
                {actDetailImageWarn && <p className="mt-1 text-[12px] text-amber-600">{actDetailImageWarn}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setActDialogOpen(false)}>取消</Button>
              <Button
                size="sm"
                onClick={handleSaveAct}
                disabled={!actFormName.trim() || (!actEditingIsOther && !actFormOrganizationId) || actUploading}
              >
                保存
              </Button>
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
