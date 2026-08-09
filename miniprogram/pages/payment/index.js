const { paymentApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')

const TABS = PAYMENT_PROJECT_TYPES

function formatDate(d) {
  if (!d) return ''
  return d.slice(0, 10)
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

function calcStatus(item, type, expiry) {
  var today = new Date()
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  var eff = item.effective_date ? item.effective_date.slice(0, 10) : ''
  var exp = expiry || (item.expiry_date ? item.expiry_date.slice(0, 10) : '')
  if (eff && eff > todayStr) return { text: '未开始', color: '#8f959e' }
  if (exp && exp < todayStr) return { text: '已过期', color: '#c4506a' }
  if (eff || exp) return { text: '生效中', color: '#3370ff' }
  if (type === 'tea_seat_fee' || type === 'oh_card_reading') return { text: '已完结', color: '#8f959e' }
  return { text: '', color: '' }
}

function formatDuration(halfHours) {
  if (!halfHours) return ''
  const totalHours = halfHours * 0.5
  return totalHours + '小时'
}

function buildDetail(item, type) {
  if (type === 'membership_card') {
    return item.card_type || ''
  }
  if (type === 'internal_course') {
    return item.course_type || ''
  }
  if (type === 'other') {
    return item.project_name || item.category || ''
  }
  if (type === 'oh_card_reading') {
    return formatDuration(item.diagnosis_duration)
  }
  if (type === 'tea_seat_fee') {
    const qty = item.quantity || 1
    return `${qty}位`
  }
  if (type === 'offline_course') {
    return `${item.validity_value || 1} 个月`
  }
  // group_case, emotional_release, energy_knot
  const count = item.purchase_count
  return count != null ? `${count}次` : ''
}

function buildPrice(item, type) {
  if (type === 'membership_card' || type === 'internal_course') return item.price
  if (type === 'other') return item.fee
  if (type === 'tea_seat_fee' || type === 'offline_course') return item.amount
  return item.amount
}

Page({
  data: {
    hasPagePermission: true,
    tabs: TABS,
    activeTab: 0,
    items: [],
    loading: false,
    exporting: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('payment')) {
      this.setData({ hasPagePermission: false })
      return
    }
    this.loadItems()
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadItems()
    }
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh())
  },

  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ activeTab: index, items: [] })
    this.loadItems()
  },

  async loadItems() {
    if (this._loading) return
    this._loading = true
    this.setData({ loading: true })

    try {
      const type = TABS[this.data.activeTab].key
      const api = paymentApi.getByType(type)
      const res = await api.listPaginated(1, 100)
      const raw = res.items || res.data || res || []
      const isHealing = ['group_case', 'emotional_release', 'energy_knot'].includes(type)
      const isOhCard = type === 'oh_card_reading'
      const isTeaSeat = type === 'tea_seat_fee'
      const isOffline = type === 'offline_course'
      const items = (Array.isArray(raw) ? raw : []).map(function(item) {
        var expiry = isOffline ? calcOfflineExpiry(item) : (item.expiry_date ? item.expiry_date.slice(0, 10) : '')
        var status = calcStatus(item, type, expiry)
        return Object.assign({}, item, {
          _detail: buildDetail(item, type),
          _price: buildPrice(item, type),
          _effective: (isOhCard || isTeaSeat) ? '' : formatDate(item.effective_date),
          _expiry: (isOhCard || isTeaSeat) ? '' : expiry,
          _diagnosisTeacher: isOhCard ? (item.diagnosis_teacher || '') : '',
          _purchaseCount: (isOhCard || isTeaSeat || isOffline) ? '' : (isHealing ? (item.purchase_count != null ? item.purchase_count : '') : ''),
          _remaining: (isOhCard || isTeaSeat || isOffline) ? '' : (isHealing
            ? (item.effective_remaining != null ? item.effective_remaining : '')
            : (item.remaining_count === null ? '不限' : (item.remaining_count != null ? item.remaining_count : ''))),
          _status: status.text,
          _statusColor: status.color,
          _validity: isOffline ? '有效期：' + (item.validity_value || 1) + '个月' : '',
          _quantity: isTeaSeat ? '数量：' + (item.quantity || 1) + '位' : '',
          _duration: isOhCard ? '时长：' + formatDuration(item.diagnosis_duration) : '',
        })
      })
      this.setData({ items, loading: false })
    } catch (e) {
      console.error('加载付费项目失败:', e)
      this.setData({ loading: false })
    } finally {
      this._loading = false
    }
  },

  onAddTap() {
    const tab = TABS[this.data.activeTab]
    if (!tab) {
      wx.showToast({ title: '未找到项目类型', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/payment-create/index?type=${tab.key}`,
      fail: (err) => {
        wx.showToast({ title: err.errMsg || '跳转失败', icon: 'none' })
      },
    })
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item
    const type = TABS[this.data.activeTab].key
    wx.navigateTo({ url: `/pages/payment-detail/index?type=${type}&id=${item.id}` })
  },

  onExportTap() {
    if (this.data.exporting) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在导出...' })
    wx.downloadFile({
      url: paymentApi.export(),
      header: { Authorization: 'Bearer ' + (wx.getStorageSync('auth_token') || '') },
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.hideLoading()
          this.setData({ exporting: false })
          wx.showToast({ title: '导出失败', icon: 'none' })
          return
        }
        const today = new Date()
        const dateText = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0'),
        ].join('-')
        const filePath = `${wx.env.USER_DATA_PATH}/付费项目_${dateText}.xlsx`
        const fileSystem = wx.getFileSystemManager()
        const openFile = (path) => {
          wx.hideLoading()
          this.setData({ exporting: false })
          wx.openDocument({
            filePath: path,
            fileType: 'xlsx',
            showMenu: true,
            fail: () => wx.showToast({ title: '无法打开文件', icon: 'none' }),
          })
        }
        fileSystem.readFile({
          filePath: res.tempFilePath,
          success: (file) => {
            fileSystem.writeFile({
              filePath,
              data: file.data,
              encoding: 'binary',
              success: () => openFile(filePath),
              fail: () => openFile(res.tempFilePath),
            })
          },
          fail: () => openFile(res.tempFilePath),
        })
      },
      fail: () => {
        wx.hideLoading()
        this.setData({ exporting: false })
        wx.showToast({ title: '下载失败', icon: 'none' })
      },
    })
  },

})
