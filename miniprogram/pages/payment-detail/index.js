const { paymentApi, organizationApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')

const TYPE_NAMES = {}
PAYMENT_PROJECT_TYPES.forEach(t => { TYPE_NAMES[t.key] = t.label })

function formatDate(d) {
  if (!d) return ''
  return d.slice(0, 10)
}

function formatDuration(type, value) {
  if (!value) return ''
  const unit = type === 'day' ? '天' : '月'
  return `${value}${unit}`
}

function formatDurationDisplay(halfHours) {
  if (!halfHours) return ''
  return (halfHours * 0.5) + '小时'
}

function calcOfflineExpiry(item) {
  if (!item.effective_date || !item.validity_value) return ''
  var eff = new Date(item.effective_date.slice(0, 10))
  eff.setMonth(eff.getMonth() + item.validity_value)
  eff.setDate(eff.getDate() - 1)
  var y = eff.getFullYear()
  var m = String(eff.getMonth() + 1).padStart(2, '0')
  var d = String(eff.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

Page({
  data: {
    type: '',
    typeName: '',
    item: null,
    loading: true,
    organizations: [],
    canEdit: false,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    const type = options.type || 'membership_card'
    this.setData({ type, typeName: TYPE_NAMES[type] || '付费项目' })
    this.loadOrganizations()
    if (options.id) {
      this.loadItem(options.id, type)
    }
  },

  onShow() {
    if (this._needRefresh && this.data.item) {
      this._needRefresh = false
      this.loadItem(this.data.item.id, this.data.type)
    }
  },

  async loadOrganizations() {
    try {
      const orgs = await organizationApi.list()
      this.setData({ organizations: orgs || [] })
    } catch (e) {}
  },

  async loadItem(id, type) {
    try {
      const api = paymentApi.getByType(type)
      const item = await api.get(id)
      if (!item) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      // 格式化显示字段
      item._dealDate = formatDate(item.deal_date)
      item._effectiveDate = formatDate(item.effective_date)
      item._expiryDate = formatDate(item.expiry_date)
      item._duration = formatDuration(item.duration_type, item.duration_value)
      const isHealing = ['group_case', 'emotional_release', 'energy_knot'].includes(type)
      const isOhCard = type === 'oh_card_reading'
      if (isOhCard) {
        item._durationDisplay = formatDurationDisplay(item.diagnosis_duration)
        item._remaining = ''
      } else if (type === 'tea_seat_fee') {
        item._quantity = item.quantity || 1
        item._remaining = ''
      } else if (type === 'offline_course') {
        item._validity = `${item.validity_value || 1} 个月`
        item._expiryDate = calcOfflineExpiry(item)
        item._remaining = ''
      } else if (isHealing) {
        item._remaining = item.effective_remaining != null ? `${item.effective_remaining}次` : ''
      } else {
        item._remaining = item.remaining_count === null ? '不限次' : (item.remaining_count != null ? `${item.remaining_count}次` : '')
      }
      item._totalCount = item.total_count === null ? '不限次' : (item.total_count != null ? `${item.total_count}次` : '')
      // 成交人
      if (item.closers && item.closers.length > 0) {
        item._closers = item.closers.map(c => `${c.name}${c.amount ? ' (' + c.amount + '元)' : ''}`).join('、')
      } else if (item.closer_name) {
        item._closers = item.closer_name
      } else {
        item._closers = ''
      }
      // 组织名
      const orgs = this.data.organizations
      if (item.organization_id && orgs.length > 0) {
        const org = orgs.find(o => o.id === item.organization_id)
        item._orgName = org ? org.name : ''
      }
      const app = getApp()
      const user = app.globalData.currentUser || wx.getStorageSync('currentUser') || {}
      const permissions = app.globalData.editPermissions || wx.getStorageSync('userEditPermissions') || {}
      const actorName = user.owner || user.username || ''
      const actorId = user.id || ''
      const canEdit = user.role === '超级管理员'
        || permissions.payments === 'all'
        || (item.created_by_id
          ? Boolean(actorId && item.created_by_id === actorId)
          : Boolean(item.created_by && actorName && item.created_by === actorName))
      this.setData({ item, canEdit, loading: false })
    } catch (e) {
      console.error('加载详情失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onEditTap() {
    const { item, type } = this.data
    if (!this.data.canEdit) {
      wx.showToast({ title: '只能修改自己创建的付费记录', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/payment-edit/index?type=${type}&id=${item.id}` })
  },


  onBack() {
    // 通知列表页刷新
    const pages = getCurrentPages()
    if (pages.length >= 2) {
      const prev = pages[pages.length - 2]
      if (prev) prev._needRefresh = true
    }
    wx.navigateBack()
  },
})
