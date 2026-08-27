import { useState, useEffect, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Plus, Tags, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import ListView from "./components/list-view"
import DetailView from "./components/detail-view"
import { customerApi, customerTagApi, memberIdentityApi, spaceApi, statisticsApi, visitApi, type Customer, type CustomerLight, type CustomerTag, type DashboardSummary, type Space } from "@/lib/api"
import { hasPagePermission } from "@/lib/page-permissions"
import { usePagePermissions } from "@/hooks/use-page-permissions"

export default function HealingRecordsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const permissions = usePagePermissions()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nickname: string } | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [identityNames, setIdentityNames] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<CustomerTag[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [inviteTarget, setInviteTarget] = useState<Customer | null>(null)
  const [inviteDate, setInviteDate] = useState("")
  const [inviteSpaceId, setInviteSpaceId] = useState("")
  const [inviteTime, setInviteTime] = useState("09:00")
  const [inviteNeeds, setInviteNeeds] = useState("")
  const [inviter, setInviter] = useState("")
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState("")

  // 搜索状态
  const [searchNickname, setSearchNickname] = useState("")
  const [searchIdentity, setSearchIdentity] = useState("")
  const [searchReferrer, setSearchReferrer] = useState("")
  const [searchReferrerHandler, setSearchReferrerHandler] = useState("")
  const [searchTagIds, setSearchTagIds] = useState<string[]>([])
  const [tagMatch, setTagMatch] = useState<"any" | "all">("any")

  const currentRole = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}").role || "" }
    catch { return "" }
  })()
  const canManageTags = currentRole === "超级管理员" || hasPagePermission(permissions, "customer-tags")

  // 统计摘要
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const loadSummary = useCallback(() => {
    statisticsApi.dashboard().then(setSummary).catch(() => setSummary(null))
  }, [])

  useEffect(() => {
    customerApi.clearLightCache()
    customerApi.light().then(setCustomers).catch(() => {})
    memberIdentityApi.list().then(list => setIdentityNames(list.map(i => i.name).reverse())).catch(() => {})
    customerTagApi.list().then(setAvailableTags).catch(() => setAvailableTags([]))
    spaceApi.list().then(setSpaces).catch(() => setSpaces([]))
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (inviteTarget && !inviteSpaceId && spaces.length > 0) {
      setInviteSpaceId(spaces[0].id)
    }
  }, [inviteTarget, inviteSpaceId, spaces])

  // 从编辑页返回时自动刷新列表
  useEffect(() => {
    if (location.pathname === "/healing-records") {
      setRefreshKey(k => k + 1)
      customerApi.clearLightCache()
      customerApi.light().then(setCustomers).catch(() => {})
      loadSummary()
    }
  }, [location.key, loadSummary])

  const handleClear = () => {
    setSearchNickname("")
    setSearchIdentity("")
    setSearchReferrer("")
    setSearchReferrerHandler("")
    setSearchTagIds([])
    setTagMatch("any")
  }

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId)
    setDetailOpen(true)
  }

  const handleAddNew = () => navigate("/healing-records/new")
  const handleEditCustomer = (id: string) => navigate(`/healing-records/${id}/edit`)

  const handleInviteCustomer = (customer: Customer) => {
    let currentOwner = ""
    try {
      const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
      currentOwner = currentUser.owner || currentUser.username || ""
    } catch { /* 使用空值兜底 */ }
    setInviteTarget(customer)
    setInviteDate(new Date().toLocaleDateString("sv-SE"))
    setInviteSpaceId(spaces[0]?.id || "")
    setInviteTime("09:00")
    setInviteNeeds("")
    setInviter(currentOwner)
    setInviteError("")
  }

  const closeInviteDialog = () => {
    setInviteTarget(null)
    setInviteError("")
  }

  const handleConfirmInvite = async () => {
    if (!inviteTarget || inviteSaving) return
    if (!inviteDate || !inviteTime || !inviteSpaceId) {
      setInviteError(spaces.length === 0 ? "请先在空间配置中新增空间" : "请完整填写邀约日期、空间和时间")
      return
    }
    setInviteSaving(true)
    setInviteError("")
    try {
      await visitApi.create({
        visit_date: inviteDate,
        visit_time: inviteTime,
        customer_id: inviteTarget.id,
        member_type: inviteTarget.member_type || "",
        needs: inviteNeeds.trim(),
        referrer_handler: inviter.trim(),
        space_id: inviteSpaceId,
      })
      closeInviteDialog()
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "邀约失败，请重试")
    } finally {
      setInviteSaving(false)
    }
  }

  const handleDeleteCustomer = (id: string, nickname: string) => {
    setDeleteTarget({ id, nickname })
    setDeleteConfirmName("")
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteError("")
    try {
      await customerApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      setDeleteConfirmName("")
      setRefreshKey(k => k + 1)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "停用失败")
    }
  }

  return (
    <div className="min-h-full w-full min-w-0 max-w-full space-y-3 overflow-x-hidden bg-[#f4f5f6] p-4">
      {/* V2 页眉横条：标题 + 统计 */}
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-medium text-[#212631] whitespace-nowrap">客户资料</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">管理与查看全部客户关系档案</span>
        <span className="ml-auto flex items-center flex-wrap gap-y-1">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]"><span className="inline-block w-[7px] h-[7px] rounded-full bg-[#3370ff] mr-1 align-[1px]" />客户总数</span>
            <span className="text-[14px] font-medium text-[#212631] tabular-nums">{summary ? summary.total_customers.toLocaleString() : "-"}</span>
          </span>
          <span className="w-px h-3.5 bg-[#f0f0f0] mx-5" />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]">本月到店</span>
            <span className="text-[14px] font-medium text-[#212631] tabular-nums">{summary ? `${summary.arrived_customers_this_month.toLocaleString()} 人` : "-"}</span>
          </span>
          <span className="w-px h-3.5 bg-[#f0f0f0] mx-5" />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]">本月消费额</span>
            <span className="text-[14px] font-medium text-[#212631] tabular-nums">{summary ? `¥${summary.revenue_this_month.toLocaleString()}` : "-"}</span>
          </span>
          <span className="w-px h-3.5 bg-[#f0f0f0] mx-5" />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-[#79838f]">待跟进</span>
            <span className="text-[14px] font-medium text-[#212631] tabular-nums">{summary ? `${summary.not_arrived_customers.toLocaleString()} 人` : "-"}</span>
          </span>
        </span>
      </div>

      {/* 表格卡：筛选条 + 数据表 */}
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => { setSearchNickname(typeof v === "string" ? v : "") }}
              placeholder="搜索用户昵称或姓名"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <SelectDropdown
            className="w-[138px]"
            buttonClassName="border-[#e1e4e7] bg-white px-2.5"
            rounded="7px"
            value={searchIdentity}
            options={[{value: "", label: "全部身份"}, ...identityNames.map(id => ({value: id, label: id}))]}
            placeholder="全部身份"
            textColor={searchIdentity ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
            onChange={(v) => { setSearchIdentity(v) }}
          />
          <div className="w-[138px]">
            <CustomerSearchInput
              customers={customers}
              value={searchReferrer}
              onChange={(v) => { setSearchReferrer(typeof v === "string" ? v : "") }}
              placeholder="引流人"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <SelectDropdown
            multi
            className="w-[148px]"
            buttonClassName="border-[#e1e4e7] bg-white px-2.5"
            rounded="7px"
            value={searchTagIds}
            options={availableTags.map(tag => ({ value: tag.id, label: tag.scope === "private" ? `${tag.name} · 我的` : tag.name }))}
            placeholder="客户标签"
            textColor={searchTagIds.length ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
            onChange={setSearchTagIds}
          />
          {searchTagIds.length > 1 && (
            <SelectDropdown
              className="w-[104px]"
              buttonClassName="border-[#e1e4e7] bg-white px-2.5"
              rounded="7px"
              value={tagMatch}
              options={[{ value: "any", label: "任一标签" }, { value: "all", label: "全部满足" }]}
              onChange={value => setTagMatch(value as "any" | "all")}
            />
          )}
          <div className="w-[138px]">
            <CustomerSearchInput
              customers={customers}
              value={searchReferrerHandler}
              onChange={(v) => { setSearchReferrerHandler(typeof v === "string" ? v : "") }}
              placeholder="承接人"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <button
            onClick={handleClear}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </button>
          <div className="flex-1" />
          {canManageTags && (
            <Button variant="outline" size="sm" className="h-8 text-[12px] text-[#4e535a]" onClick={() => navigate("/config/customer-tags")}>
              <Tags className="mr-1 h-3.5 w-3.5" /> 标签管理
            </Button>
          )}
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={handleAddNew}>
            <Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" /> 新建客户
          </Button>
        </div>

        <ListView
          refreshKey={refreshKey}
          onSelectCustomer={handleSelectCustomer}
          onInviteCustomer={handleInviteCustomer}
          onDeleteCustomer={handleDeleteCustomer}
          onEditCustomer={handleEditCustomer}
          filterNickname={searchNickname}
          filterIdentity={searchIdentity}
          filterReferrer={searchReferrer}
          filterReferrerHandler={searchReferrerHandler}
          filterTagIds={searchTagIds}
          filterTagMatch={tagMatch}
          summary={summary}
        />
      </div>

      {/* 客户详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setDetailOpen(false)}
            hideSearch
          />
        </DialogContent>
      </Dialog>

      {/* 快速邀约弹窗 */}
      <Dialog open={!!inviteTarget} onOpenChange={(open) => { if (!open && !inviteSaving) closeInviteDialog() }}>
        <DialogContent className="w-[500px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <div className="border-b border-[#f0f0f0] px-5 py-3">
            <h3 className="text-[14px] font-normal text-[#1f2329]">新增邀约</h3>
            <p className="mt-1 text-[12px] text-[#8f959e]">{inviteTarget?.nickname || inviteTarget?.name || "客户"}</p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-[64px_1fr] items-center gap-3">
              <label className="text-right text-[12px] text-[#4e535a]">日期</label>
              <Input type="date" value={inviteDate} onChange={(event) => setInviteDate(event.target.value)} className="h-8 text-[12px]" />
            </div>
            <div className="grid grid-cols-[64px_1fr] items-center gap-3">
              <label className="text-right text-[12px] text-[#4e535a]">空间</label>
              <SelectDropdown
                value={inviteSpaceId}
                options={spaces.map(space => ({ value: space.id, label: space.name }))}
                onChange={setInviteSpaceId}
                placeholder={spaces.length ? "请选择空间" : "暂无可用空间"}
                disabled={spaces.length === 0}
              />
            </div>
            <div className="grid grid-cols-[64px_1fr] items-center gap-3">
              <label className="text-right text-[12px] text-[#4e535a]">时间</label>
              <Input type="time" value={inviteTime} onChange={(event) => setInviteTime(event.target.value)} className="h-8 text-[12px]" />
            </div>
            <div className="grid grid-cols-[64px_1fr] items-start gap-3">
              <label className="pt-2 text-right text-[12px] text-[#4e535a]">来访需求</label>
              <Textarea value={inviteNeeds} onChange={(event) => setInviteNeeds(event.target.value)} rows={4} maxLength={5000} placeholder="请输入来访需求" className="min-h-[88px] resize-none rounded-[4px] text-[12px]" />
            </div>
            <div className="grid grid-cols-[64px_1fr] items-center gap-3">
              <label className="text-right text-[12px] text-[#4e535a]">邀约人</label>
              <CustomerSearchInput
                customers={customers}
                value={inviter}
                onChange={(value) => setInviter(typeof value === "string" ? value : value[0] || "")}
                placeholder="请选择邀约人"
                filterSelected={false}
              />
            </div>
            {inviteError && <p className="pl-[76px] text-[11px] text-[#f54a45]">{inviteError}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeInviteDialog} disabled={inviteSaving}>取消</Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleConfirmInvite} disabled={inviteSaving || !inviteTarget || !inviteDate || !inviteTime || !inviteSpaceId || !inviter.trim()}>
              {inviteSaving ? "邀约中..." : "确定"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmName(""); setDeleteError("") } }}>
        <DialogContent className="w-[360px] max-w-[90vw] p-0 gap-0">
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-[14px] font-normal">停用客户</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[12px] text-[#2b2f36]">
              确定要停用「<span className="font-medium">{deleteTarget?.nickname || deleteTarget?.id}</span>」吗？停用后客户资料将隐藏，历史关联数据保留，可随时恢复。
            </p>
            <div>
              <label className="text-[11px] text-[#8f959e] mb-1 block">请输入客户昵称确认停用</label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => { setDeleteConfirmName(e.target.value); setDeleteError("") }}
                placeholder={deleteTarget?.nickname || "请输入昵称"}
                className="h-8"
              />
            </div>
            {deleteError && <p className="text-[11px] text-[#f54a45]">{deleteError}</p>}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteConfirmName(""); setDeleteError("") }}>取消</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={!deleteTarget?.nickname || deleteConfirmName !== deleteTarget?.nickname}
            >
              确定停用
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
