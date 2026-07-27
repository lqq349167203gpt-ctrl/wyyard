// API 请求封装 — 客户端小程序

// 后端地址由 utils/config.js 的 DEV 总开关决定（上线/提审前切为 false 即指向生产）
const { DEV, BASE_URL } = require('./config')

function resolveResourceUrl(url) {
  if (!url) return ''
  if (url.startsWith('/')) return BASE_URL + url
  if (DEV) {
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, BASE_URL)
  }
  return url
}

function _resourceCachePath(url) {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash * 31) + url.charCodeAt(i)) >>> 0
  }
  const cleanPath = url.split('?')[0]
  const extMatch = cleanPath.match(/\.(png|jpe?g|webp)$/i)
  const ext = extMatch ? extMatch[1].toLowerCase() : 'img'
  return `${wx.env.USER_DATA_PATH}/activity-image-${hash.toString(16)}.${ext}`
}

// 真机开发预览时，本地 HTTP 图片可能被 image 组件拦截；通过 request 落盘后展示本地文件
function cacheImage(url) {
  const absoluteUrl = resolveResourceUrl(url)
  if (!absoluteUrl || !DEV) return Promise.resolve(absoluteUrl)

  const filePath = _resourceCachePath(absoluteUrl)
  const fs = wx.getFileSystemManager()
  return new Promise(resolve => {
    fs.access({
      path: filePath,
      success: () => resolve(filePath),
      fail: () => {
        wx.request({
          url: absoluteUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          success(res) {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              resolve(absoluteUrl)
              return
            }
            fs.writeFile({
              filePath,
              data: res.data,
              success: () => resolve(filePath),
              fail: () => resolve(absoluteUrl),
            })
          },
          fail: () => resolve(absoluteUrl),
        })
      },
    })
  })
}

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

  // 每日主题
  getActivityThemes(startDate, endDate) {
    const params = []
    if (startDate) params.push(`start_date=${startDate}`)
    if (endDate) params.push(`end_date=${endDate}`)
    const qs = params.length ? '?' + params.join('&') : ''
    return get(`/api/activity-themes${qs}`)
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

  // 活动回访（同一场活动重复提交会更新原记录）
  saveActivityFollowup(activityType, sessionId, content) {
    return post('/api/client/activity-followups', {
      activity_type: activityType,
      session_id: sessionId,
      content,
    })
  },

  // 剩余次数
  getRemaining() {
    return get('/api/client/remaining')
  },

  // 销卡记录
  getDeductions() {
    return get(`/api/client/deductions?_t=${Date.now()}`)
  },
}

// 微信登录 API
const wechatApi = {
  // 手机号登录（客户）
  customerLogin(code) {
    return post('/api/wechat/customer-login', { code })
  },
}

module.exports = {
  request,
  get,
  post,
  BASE_URL,
  DEV,
  resolveResourceUrl,
  cacheImage,
  clientApi,
  wechatApi,
}
