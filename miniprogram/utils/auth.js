const { authApi } = require('./api')

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        authApi.login(res.code).then((data) => {
          if (data.bound === false) {
            resolve({ bound: false, token: data.token, openid: data.openid })
          } else {
            wx.setStorageSync('auth_token', data.token)
            wx.setStorageSync('currentUser', data.account)
            wx.setStorageSync('userPermissions', data.permissions)
            wx.setStorageSync('userEditPermissions', data.edit_permissions || { visits: 'own', activities: 'own' })
            const app = getApp()
            if (app) {
              app.globalData.token = data.token
              app.globalData.currentUser = data.account
              app.globalData.permissions = data.permissions || []
              app.globalData.editPermissions = data.edit_permissions || { visits: 'own', activities: 'own' }
              if (app.scheduleUsageTracking) app.scheduleUsageTracking()
              else if (app.startUsageTracking) app.startUsageTracking()
            }
            resolve(Object.assign({ bound: true }, data))
          }
        }).catch(reject)
      },
      fail: (err) => {
        reject(new Error('wx.login 失败: ' + (err.errMsg || '')))
      },
    })
  })
}

function bindAccount(token, username, password) {
  return authApi.bind(token, username, password).then((data) => {
    wx.setStorageSync('auth_token', data.token)
    wx.setStorageSync('currentUser', data.account)
    wx.setStorageSync('userPermissions', data.permissions)
    wx.setStorageSync('userEditPermissions', data.edit_permissions || { visits: 'own', activities: 'own' })
    const app = getApp()
    if (app) {
      app.globalData.token = data.token
      app.globalData.currentUser = data.account
      app.globalData.permissions = data.permissions || []
      app.globalData.editPermissions = data.edit_permissions || { visits: 'own', activities: 'own' }
      if (app.scheduleUsageTracking) app.scheduleUsageTracking()
      else if (app.startUsageTracking) app.startUsageTracking()
    }
    return data
  })
}

function logout() {
  wx.removeStorageSync('auth_token')
  wx.removeStorageSync('currentUser')
  wx.removeStorageSync('userPermissions')
  wx.removeStorageSync('userEditPermissions')
  const app = getApp()
  if (app) {
    if (app.stopUsageTracking) app.stopUsageTracking()
    app.globalData.token = ''
    app.globalData.currentUser = null
    app.globalData.permissions = []
    app.globalData.editPermissions = { visits: 'own', activities: 'own' }
  }
}

module.exports = { login, bindAccount, logout }
