// 三个业务入口共享日期；完课沿用课表数据，进入本场名单处理上课与记录。
function onWorkflowTap(e) {
  const action = e.currentTarget.dataset.action
  if (!['invite', 'schedule', 'completion'].includes(action)) return
  const app = getApp()
  const invitation = action === 'invite'
  if (!app.checkPagePermission(invitation ? 'class-records' : 'daily-activities')) return
  const url = invitation ? '/pages/visits/index' : '/pages/activities/index'
  if (!invitation) app.globalData._courseWorkflowMode = action
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (page && `/${page.route}` === url) {
    if (!invitation) applyCourseWorkflow.call(this)
    this.setData({ calendarExpanded: false })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    return
  }
  wx.switchTab({ url })
}

function applyCourseWorkflow() {
  const app = getApp()
  const requested = app.globalData._courseWorkflowMode
  if (requested === 'schedule' || requested === 'completion') {
    delete app.globalData._courseWorkflowMode
    this.setData({ courseMode: requested, calendarExpanded: false })
  }
  wx.setNavigationBarTitle({ title: this.data.courseMode === 'completion' ? '完课' : '课表' })
}

module.exports = { onWorkflowTap, applyCourseWorkflow }
