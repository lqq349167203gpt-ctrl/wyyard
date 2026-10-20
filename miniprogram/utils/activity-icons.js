const { activityIconApi } = require('./api')
const { BASE_URL } = require('./config')
const TYPES = { class: 'class', class_record: 'class', gcs: 'gcs', group_case: 'gcs', ers: 'ers', emotional_release: 'ers', eks: 'eks', energy_knot: 'eks', ics: 'ics', internal_course: 'ics' }
let cached = null
let loadedAt = 0
let pending = null

function defaultIcon(source) { return `/images/activity-types/${TYPES[source] || 'class'}.png` }
function loadIcons() {
  // 同页各图标共享一次读取；再次进入页面刷新配置。短暂缓存仅用于合并组件挂载。
  if (cached && Date.now() - loadedAt < 1000) return Promise.resolve(cached)
  if (pending) return pending
  pending = activityIconApi.list().then(data => {
    cached = {}
    for (const item of data.items || []) {
      if (item.custom && item.url && item.url.startsWith('/api/uploads/public-images/')) cached[item.key] = BASE_URL + item.url
    }
    loadedAt = Date.now()
    return cached
  }).finally(() => { pending = null })
  return pending
}
module.exports = { TYPES, defaultIcon, loadIcons }
