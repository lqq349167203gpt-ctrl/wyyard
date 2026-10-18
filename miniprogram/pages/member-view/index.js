const { authApi, saveLoginState } = require('../../utils/api')

function count(value) {
  return value === '不限' ? '不限次' : `${value == null ? 0 : value}次`
}

function cardDetail(item, index) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const status = item.voided ? '已退费' : item.expiry_date && item.expiry_date < today ? '已过期'
    : item.effective_date && item.effective_date > today ? '未生效' : item.remaining === 0 ? '无次数' : '生效中'
  return {
    key: index,
    name: item.name || (item.purchase_count != null ? `购买${item.purchase_count}次` : item.type),
    balance: item.voided ? '已退费' : item.type === '线下落地课程' ? `${item.validity_value || 1}个月`
      : item.type === '沙龙技能学习' || item.remaining === '不限' ? '不限次'
        : `${count(item.remaining)} / ${count(item.purchase_count == null ? item.total_purchased : item.purchase_count)}`,
    validity: `${item.effective_date || '—'} ~ ${item.expiry_date || '不限'}`,
    status,
  }
}

function cardGroups(items) {
  const members = items.filter(item => item.type === '会员卡')
  const groups = []
  const make = (item, details, key) => ({
    key, title: item.type,
    summary: item.type === '线下落地课程' ? `已上课${item.attended_count || 0}次`
      : `当前剩余${count(item.current_remaining == null ? item.effective_remaining == null ? item.remaining : item.effective_remaining : item.current_remaining)} / 总${count(item.current_total == null ? item.total_purchased : item.current_total)}`,
    debtCount: item.debt_count || 0,
    debts: (item.debt_activities || []).map((debt, index) => ({ ...debt, key: index })),
    details: details.map(cardDetail),
  })
  if (members.length) groups.push(make(members[0], members.filter(item => item.name || item.effective_date), 'member'))
  items.filter(item => item.type !== '会员卡').forEach((item, index) => {
    groups.push(make(item, item.purchases && item.purchases.length
      ? item.purchases.map(p => ({ ...p, type: item.type })) : [item], `project-${index}`))
  })
  return groups
}

function displayItems(items, page) {
  return items.map((item, index) => ({
    ...item, key: `${page}-${index}`,
    activityType: item.type === '沙龙类型' ? item.course_type || '沙龙活动' : item.type,
    statusText: item.checked ? '已核销' : item.withdrawn ? '已退课' : item.participated ? '已到场' : '未记录到店',
    statusClass: item.withdrawn ? 'withdrawn' : 'muted',
    timeText: item.start_time ? [item.start_time, item.end_time].filter(Boolean).join('–') : '时间未定',
    dateText: (item.deal_date || item.created_at || '—').slice(0, 10),
    amountText: item.amount == null ? '—' : `¥${item.amount}`,
  }))
}

function activityGroups(items) {
  const groups = []
  items.forEach(item => {
    const date = item.date || '日期未记录'
    let group = groups.find(group => group.date === date)
    if (!group) {
      const day = new Date(`${date}T00:00:00`)
      const dateText = Number.isNaN(day.getTime()) ? date
        : `${day.getMonth() + 1}月${day.getDate()}日 · ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.getDay()]}`
      group = { date, dateText, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  })
  return groups
}

Page({
  data: {
    tab: 'home', sectionTitle: '', greeting: '', stats: {}, remainNum: '0',
    activityGroups: [], previewGroups: [], homeTotal: 0,
    showCode: false, codeImage: '', codeLoading: false, codeError: '',
    customer: null, canManage: false, memberOnly: false, bound: true, loading: false, error: '', items: [], groups: [], page: 0, total: 0, hasMore: false,
  },
  onShow() {
    if (!getApp().checkLogin(true)) return
    const user = getApp().globalData.currentUser || {}
    const accountId = `${user.role}:${user.id}`
    this.setData({ memberOnly: user.role === 'customer' })
    if (accountId !== this._accountId) {
      this._accountId = accountId
      this.setData({ customer: null, items: [], groups: [], previewGroups: [], activityGroups: [],
        stats: {}, remainNum: '0', homeTotal: 0, page: 0, hasMore: false, total: 0, bound: true, canManage: false })
    }
    getApp().trackUsagePage('/pages/member-view/index')
    const hour = new Date().getHours()
    this.setData({ greeting: hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好' })
    this.load(true)
  },
  onHide() { this._sequence = (this._sequence || 0) + 1; this.closeCode(); this.setData({ loading: false }) },
  onUnload() { this._sequence = (this._sequence || 0) + 1; this.closeCode() },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.tab !== 'home' && this.data.hasMore) this.load(false) },
  onRetry() { this.load(this.data.page === 0) },
  onTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    const titles = { cards: '剩余卡次', transactions: '交易记录', activities: '活动记录', checkins: '活动核销' }
    this.setData({ tab, sectionTitle: titles[tab] || '', items: [], groups: [], activityGroups: [], page: 0, total: 0, hasMore: false, error: '' })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    this.load(true)
  },
  async onReturn() {
    if (!this.data.canManage || this._switching) return
    this._switching = true
    try {
      if (this.data.memberOnly) {
        const result = await authApi.switchToManagement()
        if (!saveLoginState(result)) throw new Error('未关联可用的管理端账号')
      } else {
        await getApp().refreshPermissions()
      }
      wx.switchTab({ url: '/pages/me/index' })
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法返回，请重试', icon: 'none' })
    } finally {
      this._switching = false
    }
  },
  onLogout() { getApp().logout() },
  noop() {},
  async onShowCode(event) {
    if (this.data.codeLoading) return
    const activityKey = event.currentTarget.dataset.key || this._codeActivityKey
    if (!activityKey) return
    this._codeActivityKey = activityKey
    const sequence = this._codeSequence = (this._codeSequence || 0) + 1
    this.setData({ showCode: true, codeLoading: true, codeError: '', codeImage: '' })
    try {
      const result = await authApi.checkinCode(activityKey)
      if (sequence !== this._codeSequence) return
      const filePath = `${wx.env.USER_DATA_PATH}/activity-checkin-${Date.now()}.png`
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({
        filePath, data: result.image.split(',')[1], encoding: 'base64', success: resolve, fail: reject,
      }))
      if (sequence !== this._codeSequence) {
        wx.getFileSystemManager().unlink({ filePath, fail() {} })
        return
      }
      if (this._codeFile) wx.getFileSystemManager().unlink({ filePath: this._codeFile, fail() {} })
      this._codeFile = filePath
      this.setData({ codeImage: filePath })
    } catch (error) {
      if (sequence === this._codeSequence) this.setData({ codeError: error.message || '二维码生成失败，请重试' })
    } finally {
      if (sequence === this._codeSequence) this.setData({ codeLoading: false })
    }
  },
  closeCode() {
    this._codeSequence = (this._codeSequence || 0) + 1
    this.setData({ showCode: false, codeLoading: false, codeImage: '' })
    if (this._codeFile) wx.getFileSystemManager().unlink({ filePath: this._codeFile, fail() {} })
    this._codeFile = ''
  },
  async load(reset) {
    if (!reset && this.data.loading) return
    const sequence = this._sequence = (this._sequence || 0) + 1
    const tab = this.data.tab
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true, error: '' })
    try {
      const result = await authApi.memberData(tab, page)
      if (sequence !== this._sequence) return
      this.setData({ canManage: result.can_manage === true })
      if (!result.bound) {
        this.setData({ bound: false, customer: null, items: [], groups: [], previewGroups: [], activityGroups: [], stats: {}, remainNum: '0', homeTotal: 0, hasMore: false, page: 0 })
        return
      }
      let items = displayItems(result.items || [], page)
      if (tab === 'home') {
        const stats = result.stats || {}
        this.setData({ bound: true, customer: result.customer, stats,
          remainNum: stats.remaining === '不限' ? '∞' : String(stats.remaining == null ? 0 : stats.remaining),
          previewGroups: activityGroups(items), homeTotal: result.total || 0,
          groups: cardGroups(result.purchase_summary || []), page: 1, hasMore: false })
        return
      }
      if (!reset && tab !== 'cards') items = this.data.items.concat(items)
      this.setData({ bound: true, customer: result.customer, items: tab === 'cards' ? [] : items,
        groups: tab === 'cards' ? cardGroups(result.items || []) : [],
        activityGroups: ['activities', 'checkins'].includes(tab) ? activityGroups(items) : [], page, total: result.total || 0,
        hasMore: tab !== 'cards' && items.length < (result.total || 0) })
    } catch (error) {
      if (sequence === this._sequence) this.setData({ error: error.message || '暂时无法加载，请重试' })
    } finally {
      if (sequence === this._sequence) this.setData({ loading: false })
    }
  },
})
