const { communicationRecordApi, customerApi, memberIdentityApi } = require('../../utils/api')

Page({
  data: {
    records: [],
    filtered: [],
    keyword: '',
    loading: false,
    // 身份筛选
    identityNames: [],
    selectedIdentity: '',
    showIdentityPicker: false,
    // 昵称→身份映射
    nicknameToIdentity: {},
  },

  onShow() {
    this.loadList()
    this.loadIdentities()
  },

  async loadIdentities() {
    try {
      const [customers, identities] = await Promise.all([
        customerApi.light(200).then(res => Array.isArray(res) ? res : []),
        memberIdentityApi.list().then(res => Array.isArray(res) ? res : []),
      ])
      const map = {}
      customers.forEach(c => {
        if (c.nickname) map[c.nickname] = c.member_type || ''
      })
      const names = identities.map(i => i.name).reverse()
      this.setData({ nicknameToIdentity: map, identityNames: names })
    } catch {
      // ignore
    }
  },

  async loadList() {
    this.setData({ loading: true })
    try {
      const res = await communicationRecordApi.list()
      const list = Array.isArray(res) ? res : []
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      list.forEach(item => {
        if (item.created_at) {
          const d = new Date(item.created_at)
          item._dateStr = `${d.getMonth() + 1}/${d.getDate()}`
        } else {
          item._dateStr = ''
        }
      })
      this.setData({ records: list })
      this.applyFilter()
    } catch (err) {
      console.error('[communication-records] 加载失败:', err)
      this.setData({ records: [], filtered: [] })
    }
    this.setData({ loading: false })
  },

  applyFilter() {
    const { records, keyword, selectedIdentity, nicknameToIdentity } = this.data
    const kw = (keyword || '').toLowerCase()
    const filtered = records.filter(r => {
      if (kw && !(r.customer_nickname || '').toLowerCase().includes(kw)) return false
      if (selectedIdentity) {
        const identity = nicknameToIdentity[r.customer_nickname] || ''
        if (identity !== selectedIdentity) return false
      }
      return true
    })
    this.setData({ filtered })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.applyFilter()
  },

  onToggleIdentityPicker() {
    this.setData({ showIdentityPicker: !this.data.showIdentityPicker })
  },

  onSelectIdentity(e) {
    const value = e.currentTarget.dataset.value || ''
    this.setData({ selectedIdentity: value, showIdentityPicker: false })
    this.applyFilter()
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/communication-records/form' })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/communication-records/form?id=${id}` })
  },

  onLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '确认删除',
            content: '删除后不可恢复，确定删除？',
            success: (modalRes) => {
              if (modalRes.confirm) {
                communicationRecordApi.delete(id).then(() => {
                  wx.showToast({ title: '已删除', icon: 'success' })
                  this.loadList()
                }).catch(err => {
                  wx.showToast({ title: err.message || '删除失败', icon: 'none' })
                })
              }
            },
          })
        }
      },
    })
  },
})
