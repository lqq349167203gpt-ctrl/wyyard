const { authApi } = require('../../utils/api')

Page({
  data: { info: null, loading: false, error: '', done: false },
  async onShow() {
    const app = getApp()
    if (!app.checkLogin()) return
    try { await app.refreshPermissions() } catch (error) {}
    if (!app.checkPagePermission('activity-checkin')) {
      this._allowed = false
      this.setData({ error: '无活动核销权限，请联系管理员', info: null })
      return
    }
    this._allowed = true
    app.trackUsagePage('/pages/activity-checkin/index')
  },
  onScan() {
    if (!this._allowed || this.data.loading) return
    wx.scanCode({
      scanType: ['qrCode'],
      success: result => this.preview(result.result || ''),
      fail: error => {
        if (!(error.errMsg || '').includes('cancel')) this.setData({ error: '扫码失败，请重试' })
      },
    })
  },
  async preview(code) {
    if (this.data.loading) return
    this.setData({ loading: true, info: null, error: '', done: false })
    try {
      const info = await authApi.previewCheckin(code)
      this._code = code
      this.setData({ info, done: info.checked && info.arrived })
    } catch (error) {
      this.setData({ error: error.message || '核销码无效，请重试' })
    } finally { this.setData({ loading: false }) }
  },
  async onConfirm() {
    if (!this._allowed || !this.data.info || this.data.loading || this.data.done) return
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '确认活动核销',
      content: `${this.data.info.nickname} · ${this.data.info.date}\n${this.data.info.name}\n核销将确认当天邀约已到店，并按现有规则执行扣卡。`,
      confirmText: '确认核销', success: result => resolve(result.confirm), fail: () => resolve(false),
    }))
    if (!confirmed || this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const result = await authApi.confirmCheckin(this._code)
      this.setData({ info: result, done: true })
      wx.showToast({ title: result.message, icon: 'success' })
    } catch (error) { this.setData({ error: error.message || '核销失败，请重试' }) }
    finally { this.setData({ loading: false }) }
  },
})
