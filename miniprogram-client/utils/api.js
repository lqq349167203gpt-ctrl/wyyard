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

  // 活动详情
  getActivity(id) {
    return get(`/api/client/activities/${id}`)
  },

  // 报名
  signup(activityId) {
    return post(`/api/client/activities/${activityId}/signup`)
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
