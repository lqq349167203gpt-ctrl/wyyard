// API 请求封装 — 客户端小程序

// 按小程序环境自动切换后端地址：开发版连本地，体验版/正式版连生产
const { miniProgram: { envVersion } } = wx.getAccountInfoSync()
const BASE_URL = envVersion === 'develop'
  ? 'http://localhost:8000'
  : 'https://www.wyteahouse.cn'

function request(options) {
  return new Promise((resolve, reject) => {
    const app = getApp()
    const token = app.globalData.token || wx.getStorageSync('client_token') || ''

    wx.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'miniprogram-client',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.header,
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('client_token')
          app.globalData.token = ''
          wx.showToast({ title: '请先登录', icon: 'none' })
          reject(new Error('请先登录'))
        } else {
          const msg = res.data?.detail || '请求失败'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
        }
      },
      fail(err) {
        wx.showToast({ title: '网络错误', icon: 'none' })
        reject(err)
      },
    })
  })
}

function get(url) {
  return request({ url, method: 'GET' })
}

function post(url, data) {
  return request({ url, method: 'POST', data })
}

// 客户端活动 API
const clientApi = {
  // 活动列表
  listActivities(page, pageSize) {
    const params = []
    if (page) params.push(`page=${page}`)
    if (pageSize) params.push(`page_size=${pageSize}`)
    const qs = params.length ? '?' + params.join('&') : ''
    return get(`/api/client/activities${qs}`)
  },

  // 按日期范围查询活动(含过去日期),用于日历定位
  listActivitiesByRange(startDate, endDate) {
    const params = ['page_size=100']
    if (startDate) params.push(`start_date=${startDate}`)
    if (endDate) params.push(`end_date=${endDate}`)
    return get(`/api/client/activities?${params.join('&')}`)
  },

  // 活动详情
  getActivity(id) {
    return get(`/api/client/activities/${id}`)
  },

  // 报名
  signup(activityId) {
    return post(`/api/client/activities/${activityId}/signup`)
  },

  // 取消报名
  cancelSignup(activityId) {
    return post(`/api/client/activities/${activityId}/cancel-signup`)
  },

  // 消息通知
  getNotifications() {
    return request({
      url: `/api/client/notifications?_t=${Date.now()}`,
      method: 'GET',
      header: { 'Cache-Control': 'no-cache' },
    })
  },

  markNotificationRead(id) {
    return request({ url: `/api/client/notifications/${id}/read`, method: 'PATCH' })
  },

  // 交易记录
  getTransactions() {
    return get('/api/client/transactions')
  },

  // 活动记录
  getActivityRecords() {
    return get('/api/client/activity-records')
  },

  // 销卡记录
  getDeductions() {
    return get('/api/client/deductions')
  },
}

// 微信登录 API
const wechatApi = {
  // 手机号登录（客户）
  customerLogin(code) {
    return post('/api/wechat/customer-login', { code })
  },
}

module.exports = { request, get, post, BASE_URL, clientApi, wechatApi }
