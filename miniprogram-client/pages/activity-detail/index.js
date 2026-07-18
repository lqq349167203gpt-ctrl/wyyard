const { clientApi } = require('../../utils/api')

Page({
  data: {
    loading: true,
    activity: null,
    signingUp: false,
    signedUp: false,
    activityId: '',
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ activityId: options.id })
      this.loadActivity(options.id)
    }
  },

  loadActivity(id) {
    this.setData({ loading: true })
    clientApi.getActivity(id)
      .then(res => {
        this.setData({
          activity: this._decorate(res),
          loading: false,
          signedUp: !!res.signed_up,
        })
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '活动不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
      })
  },

  // 预处理：老师头像、地址(仅空间)、参与者一行、日期/时间格式化
  _decorate(a) {
    const names = a.teacher_names || []
    const teachers = names.map(n => ({ name: n, initial: (n || '').slice(0, 1) }))
    const parts = (a.date || '').split('-')
    const dateLabel = parts.length === 3
      ? `${Number(parts[1])}月${Number(parts[2])}日`
      : (a.date || '日期待定')
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const d = new Date((a.date || '').replace(/-/g, '/'))
    const weekday = isNaN(d.getTime()) ? '' : days[d.getDay()]
    const roster = this._buildRoster(a.participants || [])
    // 判断活动状态
    let expiredStatus = ''
    if (a.date && a.start_time) {
      const now = new Date()
      const actStart = new Date(`${a.date}T${a.start_time}:00`)
      if (!isNaN(actStart.getTime())) {
        if (a.end_time) {
          const actEnd = new Date(`${a.date}T${a.end_time}:00`)
          if (!isNaN(actEnd.getTime()) && now >= actEnd) {
            expiredStatus = 'ended'
          }
        }
        if (!expiredStatus && now >= actStart) {
          expiredStatus = 'ongoing'
        }
      }
    }
    return {
      ...a,
      isOnline: a.activity_mode === '线上',
      isExpired: !!expiredStatus,
      expiredStatus,
      teachers,
      teacherText: names.join('、'),
      addressText: a.space_name || '',
      dateLabel,
      weekday,
      timeStart: a.start_time || '',
      timeEnd: a.end_time || '',
      rosterList: roster,
    }
  },

  // 参与者名单:自己排最前,全部列出
  _buildRoster(participants) {
    if (!participants.length) return []
    return participants
      .map(p => ({ name: p.nickname || '匿名', is_me: !!p.is_me }))
      .sort((a, b) => (b.is_me ? 1 : 0) - (a.is_me ? 1 : 0))
  },

  onSignup() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      const url = `/pages/activity-detail/index?id=${this.data.activityId}`
      wx.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(url)}` })
      return
    }

    if (this.data.signingUp || this.data.signedUp) return

    this.setData({ signingUp: true })
    clientApi.signup(this.data.activity.id)
      .then(() => {
        this.setData({ signedUp: true, signingUp: false })
        wx.showToast({ title: '报名成功', icon: 'success' })
        this.loadActivity(this.data.activity.id)
      })
      .catch(err => {
        this.setData({ signingUp: false })
        if (err.message === '已报名该活动') {
          this.setData({ signedUp: true })
        }
      })
  },

  onCancelSignup() {
    wx.showModal({
      title: '提示',
      content: '确定要取消报名吗？',
      success: (res) => {
        if (res.confirm) {
          clientApi.cancelSignup(this.data.activity.id)
            .then(() => {
              this.setData({ signedUp: false })
              wx.showToast({ title: '已取消报名', icon: 'success' })
              this.loadActivity(this.data.activity.id)
            })
            .catch(err => {
              wx.showToast({ title: err.message || '取消失败', icon: 'none' })
            })
        }
      },
    })
  },
})
