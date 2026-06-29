const { visitApi } = require('../../utils/api')

Page({
  data: {
    visit: null,
    loading: true,
  },

  onLoad(options) {
    if (options.id) {
      this.loadVisit(options.id)
    }
  },

  onShow() {
    if (this.data.visit) {
      this.loadVisit(this.data.visit.id)
    }
  },

  async loadVisit(id) {
    try {
      const visit = await visitApi.get(id)
      this.setData({ visit, loading: false })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onArrivalToggle() {
    const arrived = !this.data.visit.arrived
    const arrivalTime = arrived ? (() => {
      const now = new Date()
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    })() : ''

    visitApi.update(this.data.visit.id, {
      arrived,
      arrival_time: arrivalTime || null,
    }).then(() => {
      if (arrived) {
        wx.navigateBack()
      } else {
        this.setData({
          'visit.arrived': arrived,
          'visit.arrival_time': arrivalTime,
        })
        wx.showToast({ title: '已取消到店' })
      }
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  onEditTap() {
    wx.navigateTo({ url: `/pages/visit-edit/index?id=${this.data.visit.id}` })
  },

  onProfileTap() {
    if (this.data.visit.customer_id) {
      wx.navigateTo({ url: `/pages/customer-profile/index?id=${this.data.visit.customer_id}` })
    }
  },
})
