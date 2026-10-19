const KEYS = ['visit_need_tags', 'visit_need_detail', 'customer_info', 'follow_up', 'customer_feedback']

function noteVisibility(access) {
  if (!access) {
    const permissions = wx.getStorageSync('userEditPermissions') || {}
    access = permissions.customer_access || { detail_tabs: {} }
  }
  const tabs = access.detail_tabs || {}
  const result = {}
  for (const key of KEYS) result[key] = tabs[key] === undefined ? tabs.follow_up === true : tabs[key] === true
  result.visit_need = result.visit_need_tags || result.visit_need_detail
  result.any = KEYS.some(key => result[key])
  return result
}

module.exports = { noteVisibility }
