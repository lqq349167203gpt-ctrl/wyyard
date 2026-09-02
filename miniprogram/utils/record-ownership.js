function getCurrentUser() {
  const appUser = getApp().globalData.currentUser || {}
  return Object.keys(appUser).length ? appUser : (wx.getStorageSync('currentUser') || {})
}

function canEditRecord(record, area) {
  const user = getCurrentUser()
  const editPermissions = wx.getStorageSync('userEditPermissions') || {}
  if (user.role !== '超级管理员' && editPermissions[area] === 'view') return false
  if (!record || !record.id) return true
  if (user.role === '超级管理员' || editPermissions[area] === 'all') return true
  const actorId = String(user.id || '')
  const actorName = String(user.owner || user.username || '')
  const creatorId = String(record.created_by_id || '')
  const creatorName = String(record.created_by || '')
  if (creatorId) return Boolean(actorId && actorId === creatorId)
  return Boolean(creatorName && actorName && creatorName === actorName)
}

function isAssignedActivityTeacher(record) {
  if (!record) return false
  const user = getCurrentUser()
  const actorName = String(user.owner || user.username || '').trim().toLowerCase()
  if (!actorName) return false
  const names = []
    .concat(record.teacher_names || [])
    .concat([record.host_name || '', record.achiever_name || ''])
    .map(name => String(name || '').trim().toLowerCase())
    .filter(Boolean)
  return names.includes(actorName)
}

function canEditActivityContent(record) {
  const user = getCurrentUser()
  const editPermissions = wx.getStorageSync('userEditPermissions') || {}
  if (!record || !record.id) return user.role === '超级管理员' || editPermissions.activities !== 'view'
  if (user.role === '超级管理员' || editPermissions.activities === 'all') return true
  if (editPermissions.activities !== 'view' && canEditRecord(record, 'activities')) return true
  return editPermissions.activity_teachers !== 'view' && isAssignedActivityTeacher(record)
}

function isAreaViewOnly(area) {
  const user = getCurrentUser()
  const editPermissions = wx.getStorageSync('userEditPermissions') || {}
  return user.role !== '超级管理员' && editPermissions[area] === 'view'
}

module.exports = { canEditRecord, canEditActivityContent, isAssignedActivityTeacher, isAreaViewOnly }
