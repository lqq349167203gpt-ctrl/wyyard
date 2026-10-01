const { organizationApi, customerApi, courseTypeApi, uploadPublicImage, visitApi } = require('../../utils/api')

const FIXED_ALIASES = ['无忧茶院', '无忧茶苑']
const MAX_IMAGE_SIZE = 2 * 1024 * 1024

Page({
  data: {
    permissionReady: false,
    hasPermission: false,
    loading: true,
    activeTab: 'members',
    organizations: [],
    orgNames: [],
    customers: [],
    courseTypes: [],
    dataViewerIds: [],
    dataViewerNames: [],
    memberCount: 0,
    // 成员新增
    memberAddOpen: false,
    memberKeyword: '',
    memberSearchResults: [],
    memberSearching: false,
    // 数据查阅人
    viewerAddOpen: false,
    viewerKeyword: '',
    viewerSearchResults: [],
    viewerSearching: false,
    // 组织表单
    orgDialogOpen: false,
    editingOrgId: '',
    orgFormName: '',
    orgNameDisabled: false,
    orgReferrerMode: 'member',
    orgReferrerIds: [],
    orgReferrerLabels: [],
    orgIncludeUnassigned: true,
    orgNameError: '',
    savingOrg: false,
    // 引流人搜索
    refAddOpen: false,
    refKeyword: '',
    refSearchResults: [],
    refSearching: false,
    // 成员删除
    deleteMemberOpen: false,
    deleteMemberId: '',
    deleteMemberName: '',
    deleteMemberInput: '',
    deleteMemberError: '',
    // 组织删除
    deleteOrgOpen: false,
    deleteOrgId: '',
    deleteOrgName: '',
    // 活动表单
    actDialogOpen: false,
    actEditingName: '',
    actFormName: '',
    actFormOrgId: '',
    actFormListImage: '',
    actFormDetailImages: [],
    actFormError: '',
    actSaving: false,
    actUploading: false,
    actIsOther: false,
    actDeleteOpen: false,
    actDeleteName: '',
  },

  async onLoad() {
    if (!getApp().checkLogin()) return
    this._initializing = true
    const app = getApp()
    try {
      try { await app.refreshPermissions() } catch (e) {}
      if (!app.checkPagePermission('organizations')) {
        this.setData({ permissionReady: true, hasPermission: false, loading: false })
        wx.showToast({ title: '无组织信息配置权限', icon: 'none' })
        return
      }
      this.setData({ permissionReady: true, hasPermission: true })
      await this.loadData()
    } finally {
      this._initializing = false
    }
  },

  async onShow() {
    if (!getApp().checkLogin()) return
    if (this._initializing) return
    const app = getApp()
    try { await app.refreshPermissions() } catch (e) {}
    const hasPermission = app.checkPagePermission('organizations')
    if (!this.data.permissionReady || hasPermission !== this.data.hasPermission) {
      this.setData({ permissionReady: true, hasPermission, loading: false })
      if (hasPermission) this.loadData()
    }
  },

  onPullDownRefresh() {
    if (!this.data.hasPermission) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  isFixed(name) {
    return FIXED_ALIASES.indexOf(String(name || '').trim()) >= 0
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [orgs, customers, types, viewers] = await Promise.all([
        organizationApi.list().catch(() => []),
        customerApi.list().catch(() => []),
        courseTypeApi.list().catch(() => []),
        organizationApi.listDataViewers().catch(() => ({ data_viewer_ids: [] })),
      ])
      const list = (orgs || []).slice()
      list.sort((a, b) => {
        if (this.isFixed(a.name)) return -1
        if (this.isFixed(b.name)) return 1
        return (a.sort_order || 9999) - (b.sort_order || 9999)
      })
      const displayOrgs = list.map(org => ({
        ...org,
        isFixed: this.isFixed(org.name),
        members: (org.members || []).map(m => ({
          ...m,
          // 与 PC 一致：昵称单独一列，没有则空，不回退到姓名
          nickname: m.nickname || '',
          name: m.name || '',
          member_type: m.member_type || '',
          visit_count: m.visit_count != null ? m.visit_count : null,
        })),
        referrer_labels: (org.referrer_ids || []).map(rid => {
          const c = (customers || []).find(x => x.id === rid)
          return c ? (c.nickname || c.name || rid) : rid
        }),
      }))
      const orgNameById = {}
      displayOrgs.forEach(o => { orgNameById[o.id] = o.name })
      const displayTypes = (types || []).map(t => ({
        ...t,
        org_name: t.organization_id ? (orgNameById[t.organization_id] || '') : '',
        is_other: t.category === 'other',
      }))
      const viewerIds = (viewers && viewers.data_viewer_ids) || []
      const byId = {}
      ;(customers || []).forEach(c => { byId[c.id] = c })
      const dataViewerNames = viewerIds.map(id => {
        const c = byId[id]
        return c ? (c.nickname || c.name || id) : id
      })
      const memberCount = displayOrgs.reduce((sum, org) => sum + (org.member_ids || []).length, 0)
      this.setData({
        organizations: displayOrgs,
        orgNames: displayOrgs.map(o => o.name),
        customers: customers || [],
        courseTypes: displayTypes,
        dataViewerIds: viewerIds,
        dataViewerNames,
        memberCount,
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  customerById(id) {
    return (this.data.customers || []).find(c => c.id === id) || null
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab) this.setData({ activeTab: tab })
  },

  // ---------- 组织 CRUD ----------
  openCreateOrg() {
    this.setData({
      orgDialogOpen: true,
      editingOrgId: '',
      orgFormName: '',
      orgNameDisabled: false,
      orgReferrerMode: 'member',
      orgReferrerIds: [],
      orgReferrerLabels: [],
      orgIncludeUnassigned: true,
      orgNameError: '',
    })
  },

  openEditOrg(e) {
    const id = e.currentTarget.dataset.id
    const org = (this.data.organizations || []).find(o => o.id === id)
    if (!org) return
    const fixed = this.isFixed(org.name)
    const labels = (org.referrer_ids || []).map(rid => {
      const c = this.customerById(rid)
      return c ? (c.nickname || c.name || rid) : rid
    })
    this.setData({
      orgDialogOpen: true,
      editingOrgId: org.id,
      orgFormName: fixed ? '无忧茶院' : org.name,
      orgNameDisabled: fixed,
      orgReferrerMode: org.referrer_mode || 'member',
      orgReferrerIds: org.referrer_ids || [],
      orgReferrerLabels: labels,
      orgIncludeUnassigned: org.include_unassigned_referrers !== false,
      orgNameError: '',
    })
  },

  onOrgNameInput(e) {
    this.setData({ orgFormName: e.detail.value, orgNameError: '' })
  },

  onOrgRefModeChange(e) {
    this.setData({ orgReferrerMode: e.currentTarget.dataset.mode })
  },

  onOrgUnassignedChange(e) {
    this.setData({ orgIncludeUnassigned: !!e.detail.value })
  },

  openRefPicker() {
    this.setData({ refAddOpen: true, refKeyword: '', refSearchResults: [], refSearching: false })
  },

  closeRefPicker() {
    this.setData({ refAddOpen: false, refKeyword: '', refSearchResults: [] })
  },

  onRefKeyword(e) {
    const kw = e.detail.value
    this.setData({ refKeyword: kw })
    this._searchRef(kw)
  },

  async _searchRef(kw) {
    const keyword = (kw || '').trim()
    if (!keyword) {
      this.setData({ refSearchResults: [], refSearching: false })
      return
    }
    this.setData({ refSearching: true })
    try {
      const results = await visitApi.searchCustomers(keyword)
      const picked = this.data.orgReferrerIds || []
      this.setData({
        refSearchResults: (results || []).filter(item => picked.indexOf(item.id) < 0),
        refSearching: false,
      })
    } catch (e) {
      this.setData({ refSearchResults: [], refSearching: false })
    }
  },

  pickReferrer(e) {
    const c = e.currentTarget.dataset.customer
    if (!c) return
    const ids = (this.data.orgReferrerIds || []).concat([c.id])
    const labels = (this.data.orgReferrerLabels || []).concat([c.nickname || c.name || c.id])
    this.setData({ orgReferrerIds: ids, orgReferrerLabels: labels, refAddOpen: false, refKeyword: '', refSearchResults: [] })
  },

  removeReferrer(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ids = (this.data.orgReferrerIds || []).filter((_, i) => i !== index)
    const labels = (this.data.orgReferrerLabels || []).filter((_, i) => i !== index)
    this.setData({ orgReferrerIds: ids, orgReferrerLabels: labels })
  },

  closeOrgDialog() {
    this.setData({ orgDialogOpen: false, editingOrgId: '' })
  },

  async saveOrg() {
    const name = (this.data.orgFormName || '').trim()
    if (!this.data.orgNameDisabled && !name) {
      this.setData({ orgNameError: '请填写组织名称' })
      return
    }
    const orgs = this.data.organizations || []
    if (!this.data.orgNameDisabled) {
      const dup = orgs.find(o => {
        if (this.data.editingOrgId && o.id === this.data.editingOrgId) return false
        const on = this.isFixed(o.name) ? '无忧茶院' : o.name
        const nn = this.isFixed(name) ? '无忧茶院' : name
        return on === nn
      })
      if (dup) {
        this.setData({ orgNameError: '组织名称已存在' })
        return
      }
    }
    this.setData({ savingOrg: true })
    try {
      const payload = {
        referrer_mode: this.data.orgReferrerMode,
        referrer_ids: this.data.orgReferrerMode === 'selected' ? this.data.orgReferrerIds : [],
        include_unassigned_referrers: this.data.orgIncludeUnassigned,
      }
      if (this.data.editingOrgId) {
        if (!this.data.orgNameDisabled) payload.name = name
        await organizationApi.update(this.data.editingOrgId, payload)
      } else {
        await organizationApi.create({
          name,
          member_ids: [],
          ...payload,
          sort_order: orgs.length,
        })
      }
      this.setData({ orgDialogOpen: false, editingOrgId: '', savingOrg: false })
      wx.showToast({ title: '已保存', icon: 'success' })
      await this.loadData()
    } catch (e) {
      this.setData({ savingOrg: false })
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    }
  },

  confirmDeleteOrg(e) {
    const id = e.currentTarget.dataset.id
    const org = (this.data.organizations || []).find(o => o.id === id)
    if (!org) return
    if (this.isFixed(org.name)) {
      wx.showToast({ title: '系统组织不可删除', icon: 'none' })
      return
    }
    this.setData({ deleteOrgOpen: true, deleteOrgId: org.id, deleteOrgName: org.name })
  },

  closeDeleteOrg() {
    this.setData({ deleteOrgOpen: false, deleteOrgId: '', deleteOrgName: '' })
  },

  async doDeleteOrg() {
    try {
      await organizationApi.delete(this.data.deleteOrgId)
      this.setData({ deleteOrgOpen: false, deleteOrgId: '', deleteOrgName: '' })
      wx.showToast({ title: '已删除', icon: 'success' })
      await this.loadData()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
    }
  },

  async moveOrg(e) {
    const { id, dir } = e.currentTarget.dataset
    const orgs = (this.data.organizations || []).slice()
    const idx = orgs.findIndex(o => o.id === id)
    if (idx < 0) return
    const firstMovable = orgs[0] && this.isFixed(orgs[0].name) ? 1 : 0
    if (dir === 'up' && idx <= firstMovable) return
    if (dir === 'down' && idx >= orgs.length - 1) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    const tmp = orgs[idx]
    orgs[idx] = orgs[swap]
    orgs[swap] = tmp
    this.setData({ organizations: orgs })
    try {
      for (let i = 0; i < orgs.length; i++) {
        if (this.isFixed(orgs[i].name)) continue
        await organizationApi.update(orgs[i].id, { sort_order: i })
      }
    } catch (e) {
      wx.showToast({ title: '排序保存失败', icon: 'none' })
      this.loadData()
    }
  },

  // ---------- 成员 ----------
  openMemberAdd(e) {
    this._memberOrgId = e.currentTarget.dataset.id
    this.setData({ memberAddOpen: true, memberKeyword: '', memberSearchResults: [], memberSearching: false })
  },

  closeMemberAdd() {
    this.setData({ memberAddOpen: false, memberKeyword: '', memberSearchResults: [] })
  },

  onMemberKeyword(e) {
    const kw = e.detail.value
    this.setData({ memberKeyword: kw })
    this._searchMember(kw)
  },

  async _searchMember(kw) {
    const keyword = (kw || '').trim()
    if (!keyword) {
      this.setData({ memberSearchResults: [], memberSearching: false })
      return
    }
    this.setData({ memberSearching: true })
    try {
      const org = (this.data.organizations || []).find(o => o.id === this._memberOrgId)
      const exclude = (org && org.member_ids) || []
      const results = await visitApi.searchCustomers(keyword)
      this.setData({
        memberSearchResults: (results || []).filter(item => exclude.indexOf(item.id) < 0),
        memberSearching: false,
      })
    } catch (e) {
      this.setData({ memberSearchResults: [], memberSearching: false })
    }
  },

  async pickMember(e) {
    const c = e.currentTarget.dataset.customer
    if (!c || !this._memberOrgId) return
    const org = (this.data.organizations || []).find(o => o.id === this._memberOrgId)
    if (!org) return
    const ids = (org.member_ids || []).concat([c.id])
    try {
      await organizationApi.update(org.id, { member_ids: ids })
      this.setData({ memberAddOpen: false, memberKeyword: '', memberSearchResults: [] })
      wx.showToast({ title: '已添加', icon: 'success' })
      await this.loadData()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' })
    }
  },

  async moveMember(e) {
    const { orgId, memberId, dir } = e.currentTarget.dataset
    const org = (this.data.organizations || []).find(o => o.id === orgId)
    if (!org) return
    const ids = (org.member_ids || []).slice()
    const idx = ids.indexOf(memberId)
    if (idx < 0) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= ids.length) return
    const tmp = ids[idx]
    ids[idx] = ids[swap]
    ids[swap] = tmp
    try {
      await organizationApi.update(orgId, { member_ids: ids })
      await this.loadData()
    } catch (e) {
      wx.showToast({ title: '排序失败', icon: 'none' })
    }
  },

  confirmRemoveMember(e) {
    const { orgId, memberId } = e.currentTarget.dataset
    const c = this.customerById(memberId)
    const name = (c && (c.nickname || c.name)) || memberId
    this.setData({
      deleteMemberOpen: true,
      deleteMemberId: memberId,
      deleteMemberName: name,
      deleteMemberInput: '',
      deleteMemberError: '',
    })
    this._deleteMemberOrgId = orgId
  },

  closeDeleteMember() {
    this.setData({ deleteMemberOpen: false, deleteMemberId: '', deleteMemberName: '', deleteMemberInput: '', deleteMemberError: '' })
  },

  onDeleteMemberInput(e) {
    this.setData({ deleteMemberInput: e.detail.value, deleteMemberError: '' })
  },

  async doDeleteMember() {
    const input = (this.data.deleteMemberInput || '').trim()
    if (input !== this.data.deleteMemberName) {
      this.setData({ deleteMemberError: '请输入完整昵称确认' })
      return
    }
    const org = (this.data.organizations || []).find(o => o.id === this._deleteMemberOrgId)
    if (!org) return
    const ids = (org.member_ids || []).filter(id => id !== this.data.deleteMemberId)
    try {
      await organizationApi.update(org.id, { member_ids: ids })
      this.setData({ deleteMemberOpen: false })
      wx.showToast({ title: '已移除', icon: 'success' })
      await this.loadData()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '移除失败', icon: 'none' })
    }
  },

  // ---------- 整体数据查阅人 ----------
  openViewerAdd() {
    this.setData({ viewerAddOpen: true, viewerKeyword: '', viewerSearchResults: [], viewerSearching: false })
  },

  closeViewerAdd() {
    this.setData({ viewerAddOpen: false, viewerKeyword: '', viewerSearchResults: [] })
  },

  onViewerKeyword(e) {
    const kw = e.detail.value
    this.setData({ viewerKeyword: kw })
    this._searchViewer(kw)
  },

  async _searchViewer(kw) {
    const keyword = (kw || '').trim()
    if (!keyword) {
      this.setData({ viewerSearchResults: [], viewerSearching: false })
      return
    }
    this.setData({ viewerSearching: true })
    try {
      const exclude = this.data.dataViewerIds || []
      const results = await visitApi.searchCustomers(keyword)
      this.setData({
        viewerSearchResults: (results || []).filter(item => exclude.indexOf(item.id) < 0),
        viewerSearching: false,
      })
    } catch (e) {
      this.setData({ viewerSearchResults: [], viewerSearching: false })
    }
  },

  async pickViewer(e) {
    const c = e.currentTarget.dataset.customer
    if (!c) return
    try {
      const result = await organizationApi.setDataViewers((this.data.dataViewerIds || []).concat([c.id]))
      this.setData({ viewerAddOpen: false, viewerKeyword: '', viewerSearchResults: [] })
      wx.showToast({ title: '已添加', icon: 'success' })
      await this.loadData()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' })
    }
  },

  removeViewer(e) {
    const id = e.currentTarget.dataset.id
    const ids = (this.data.dataViewerIds || []).filter(x => x !== id)
    organizationApi.setDataViewers(ids)
      .then(() => {
        wx.showToast({ title: '已移除', icon: 'success' })
        this.loadData()
      })
      .catch(err => wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' }))
  },

  // ---------- 活动配置 ----------
  openActCreate() {
    if (!this.data.organizations.length) {
      wx.showToast({ title: '请先新增组织', icon: 'none' })
      return
    }
    this.setData({
      actDialogOpen: true,
      actEditingName: '',
      actFormName: '',
      actFormOrgId: this.data.organizations[0].id,
      actFormListImage: '',
      actFormDetailImages: [],
      actFormError: '',
      actIsOther: false,
    })
  },

  openActEdit(e) {
    const name = e.currentTarget.dataset.name
    const type = (this.data.courseTypes || []).find(t => t.name === name)
    if (!type) return
    this.setData({
      actDialogOpen: true,
      actEditingName: type.name,
      actFormName: type.name,
      actFormOrgId: type.organization_id || '',
      actFormListImage: type.list_image || '',
      actFormDetailImages: type.detail_images || [],
      actFormError: '',
      actIsOther: type.category === 'other',
    })
  },

  closeActDialog() {
    this.setData({ actDialogOpen: false, actEditingName: '' })
  },

  onActNameInput(e) {
    this.setData({ actFormName: e.detail.value, actFormError: '' })
  },

  onActOrgChange(e) {
    const idx = Number(e.detail.value)
    const org = this.data.organizations[idx]
    if (org) this.setData({ actFormOrgId: org.id })
  },

  async chooseActListImage() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'] })
      const file = res.tempFiles && res.tempFiles[0]
      if (!file) return
      if (file.size > MAX_IMAGE_SIZE) {
        wx.showToast({ title: '图片不能超过 2MB', icon: 'none' })
        return
      }
      this.setData({ actUploading: true })
      const material = await uploadPublicImage(file.tempFilePath, 'file')
      this.setData({ actFormListImage: material.url, actUploading: false })
    } catch (e) {
      this.setData({ actUploading: false })
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    }
  },

  async chooseActDetailImage() {
    try {
      const remain = 6 - (this.data.actFormDetailImages || []).length
      if (remain <= 0) {
        wx.showToast({ title: '最多 6 张详情图', icon: 'none' })
        return
      }
      const res = await wx.chooseMedia({ count: remain, mediaType: ['image'], sizeType: ['compressed'] })
      const files = res.tempFiles || []
      if (!files.length) return
      for (const file of files) {
        if (file.size > MAX_IMAGE_SIZE) {
          wx.showToast({ title: '图片不能超过 2MB', icon: 'none' })
          return
        }
      }
      this.setData({ actUploading: true })
      const urls = []
      for (const file of files) {
        const material = await uploadPublicImage(file.tempFilePath, 'file')
        urls.push(material.url)
      }
      this.setData({
        actFormDetailImages: (this.data.actFormDetailImages || []).concat(urls),
        actUploading: false,
      })
    } catch (e) {
      this.setData({ actUploading: false })
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    }
  },

  removeActListImage() {
    this.setData({ actFormListImage: '' })
  },

  removeActDetailImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = (this.data.actFormDetailImages || []).filter((_, i) => i !== index)
    this.setData({ actFormDetailImages: images })
  },

  async saveAct() {
    const name = (this.data.actFormName || '').trim()
    if (!name || (!this.data.actIsOther && !this.data.actFormOrgId)) {
      this.setData({ actFormError: '请填写活动名称并选择所属组织' })
      return
    }
    this.setData({ actSaving: true, actFormError: '' })
    try {
      if (this.data.actEditingName) {
        if (!this.data.actIsOther && name !== this.data.actEditingName) {
          await courseTypeApi.rename(this.data.actEditingName, name)
        }
        await courseTypeApi.update(name, {
          ...(!this.data.actIsOther ? { organization_id: this.data.actFormOrgId } : {}),
          list_image: this.data.actFormListImage,
          detail_images: this.data.actFormDetailImages,
        })
      } else {
        await courseTypeApi.create(name, this.data.actFormOrgId, this.data.actFormListImage, this.data.actFormDetailImages)
      }
      this.setData({ actDialogOpen: false, actEditingName: '', actSaving: false })
      wx.showToast({ title: '已保存', icon: 'success' })
      await this.loadData()
    } catch (e) {
      this.setData({ actSaving: false, actFormError: (e && e.message) || '保存失败' })
    }
  },

  confirmDeleteAct(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ actDeleteOpen: true, actDeleteName: name })
  },

  closeDeleteAct() {
    this.setData({ actDeleteOpen: false, actDeleteName: '' })
  },

  async doDeleteAct() {
    try {
      await courseTypeApi.delete(this.data.actDeleteName)
      this.setData({ actDeleteOpen: false, actDeleteName: '' })
      wx.showToast({ title: '已删除', icon: 'success' })
      await this.loadData()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
    }
  },

  async moveAct(e) {
    const { name, dir } = e.currentTarget.dataset
    const types = (this.data.courseTypes || []).slice()
    const idx = types.findIndex(t => t.name === name)
    if (idx < 0) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= types.length) return
    const tmp = types[idx]
    types[idx] = types[swap]
    types[swap] = tmp
    this.setData({ courseTypes: types })
    try {
      await courseTypeApi.reorder(types.map(t => t.name))
    } catch (e) {
      wx.showToast({ title: '排序失败', icon: 'none' })
      this.loadData()
    }
  },

  orgNameById(id) {
    const org = (this.data.organizations || []).find(o => o.id === id)
    return org ? org.name : ''
  },

  stopPrevent() {},
})
