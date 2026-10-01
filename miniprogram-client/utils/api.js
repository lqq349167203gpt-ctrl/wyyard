// API 请求封装 — 客户端小程序

// 后端地址由 utils/config.js 的 DEV 总开关决定（上线/提审前切为 false 即指向生产）
const { DEV, BASE_URL } = require('./config')
const imageCacheTasks = {}
const pendingReads = new Map()

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

function _validateCachedImage(filePath) {
  return new Promise(resolve => {
    wx.getImageInfo({
      src: filePath,
      success: info => resolve(!!(info && info.width && info.height)),
      fail: () => resolve(false),
    })
  })
}

function _removeCachedFile(fs, filePath) {
  return new Promise(resolve => {
    fs.unlink({
      filePath,
      success: resolve,
      fail: resolve,
    })
  })
}

function _downloadImageToCache(fs, absoluteUrl, filePath) {
  return new Promise(resolve => {
    wx.request({
      url: absoluteUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      success(res) {
        const headers = res.header || {}
        const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type')
        const contentType = contentTypeKey ? String(headers[contentTypeKey]) : ''
        const hasImageContentType = !contentType || /^image\//i.test(contentType)
        const hasData = !!(res.data && res.data.byteLength)
        if (res.statusCode < 200 || res.statusCode >= 300 || !hasImageContentType || !hasData) {
          resolve(absoluteUrl)
          return
        }
        fs.writeFile({
          filePath,
          data: res.data,
          success: () => {
            _validateCachedImage(filePath).then(valid => {
              if (valid) {
                resolve(filePath)
                return
              }
              _removeCachedFile(fs, filePath).then(() => resolve(absoluteUrl))
            })
          },
          fail: () => resolve(absoluteUrl),
        })
      },
      fail: () => resolve(absoluteUrl),
    })
  })
}

// 真机开发预览时，本地 HTTP 图片可能被 image 组件拦截；通过 request 落盘后展示本地文件
function cacheImage(url) {
  const absoluteUrl = resolveResourceUrl(url)
  if (!absoluteUrl || !DEV) return Promise.resolve(absoluteUrl)
  if (absoluteUrl.startsWith(wx.env.USER_DATA_PATH)) return Promise.resolve(absoluteUrl)
  if (imageCacheTasks[absoluteUrl]) return imageCacheTasks[absoluteUrl]

  const filePath = _resourceCachePath(absoluteUrl)
  const fs = wx.getFileSystemManager()
  const task = new Promise(resolve => {
    fs.access({
      path: filePath,
      success: () => {
        _validateCachedImage(filePath).then(valid => {
          if (valid) {
            resolve(filePath)
            return
          }
          _removeCachedFile(fs, filePath).then(() => {
            _downloadImageToCache(fs, absoluteUrl, filePath).then(resolve)
          })
        })
      },
      fail: () => _downloadImageToCache(fs, absoluteUrl, filePath).then(resolve),
    })
  })
  imageCacheTasks[absoluteUrl] = task
  task.then(() => {
    if (imageCacheTasks[absoluteUrl] === task) {
      delete imageCacheTasks[absoluteUrl]
    }
  })
  return task
}

function request(options) {
  const method = (options.method || 'GET').toUpperCase()
  // 只合并同一会话的在途业务读取，返回后即释放；登录和其他写入绝不合并。
  if (method !== 'GET') {
    pendingReads.clear()
    return performRequest(options).then(result => { pendingReads.clear(); return result })
  }
  if (!options.url.startsWith('/api/client/')) return performRequest(options)
  const token = getApp().globalData.token || wx.getStorageSync('client_token') || ''
  const key = JSON.stringify([BASE_URL, token, options.url, options.data, options.header, !!options.silentAuth])
  if (pendingReads.has(key)) return pendingReads.get(key)
  const promise = performRequest(options).finally(() => {
    if (pendingReads.get(key) === promise) pendingReads.delete(key)
  })
  pendingReads.set(key, promise)
  return promise
}

function performRequest(options) {
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
        const headers = res.header || {}
        const newTokenKey = Object.keys(headers).find(key => key.toLowerCase() === 'x-new-token')
        const currentToken = app.globalData.token || wx.getStorageSync('client_token') || ''
        if (newTokenKey && headers[newTokenKey] && token && currentToken === token) {
          app.updateToken(headers[newTokenKey])
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // 旧请求的 401 不得清掉重新登录后的会话。
          if (currentToken !== token) {
            reject(new Error('登录状态已更新，请重试'))
            return
          }
          app.clearLogin()
          if (!options.silentAuth) {
            wx.showToast({ title: '请先登录', icon: 'none' })
          }
          reject(new Error('请先登录'))
        } else {
          const msg = res.data?.detail || res.data?.message || res.data?.error || '请求失败'
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

function get(url, options = {}) {
  return request({ ...options, url, method: 'GET' })
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
  async listActivitiesByRange(startDate, endDate) {
    const params = ['page_size=100']
    if (startDate) params.push(`start_date=${startDate}`)
    if (endDate) params.push(`end_date=${endDate}`)
    let page = 1
    let first
    const items = []
    do {
      const result = await get(`/api/client/activities?${params.join('&')}&page=${page}`)
      if (!first) first = result
      items.push(...(result.items || []))
      if (page >= Number(result.total_pages || 1)) break
      page += 1
    } while (true)
    return { ...first, items: Array.from(new Map(items.map(item => [item.id, item])).values()) }
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
  getNotifications(options) {
    return request({
      url: '/api/client/notifications',
      method: 'GET',
      header: { 'Cache-Control': 'no-cache' },
      ...options,
    })
  },

  markNotificationRead(id) {
    return request({ url: `/api/client/notifications/${id}/read`, method: 'PATCH' })
  },

  // 交易记录
  getTransactions(options = {}) {
    return get(`/api/client/transactions${historyQuery(options)}`, options)
  },

  // 活动记录
  getActivityRecords(options = {}) {
    return get(`/api/client/activity-records${historyQuery(options)}`, options)
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
  getRemaining(options) {
    return get('/api/client/remaining', options)
  },

  // 销卡记录
  getDeductions(options = {}) {
    return get(`/api/client/deductions${historyQuery(options)}`, options)
  },
}

function historyQuery(options) {
  const fields = ['page', 'page_size', 'status', 'timeline']
  const params = fields.filter(key => options[key] !== undefined).map(key => `${key}=${encodeURIComponent(options[key])}`)
  return params.length ? '?' + params.join('&') : ''
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
