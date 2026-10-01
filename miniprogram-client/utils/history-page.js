const { beginRead } = require('./read-scope')

// 个人历史共用分页状态：筛选变化使旧读取失效，失败保留原页，汇总只使用服务端结果。
async function loadHistory(owner, reset, fetch, apply) {
  if (typeof reset !== 'boolean') reset = owner._historyRetryReset === undefined
    ? !owner.data.hasMore
    : owner._historyRetryReset
  if (!reset && (owner.data.loading || owner.data.loadingMore)) return
  const page = reset ? 1 : (owner.data.page || 1) + 1
  const isCurrent = beginRead(owner, 'history')
  owner.setData({ loading: reset, loadingMore: !reset, loadError: '', ...(reset ? { hasMore: false } : {}) })
  try {
    const result = await fetch({ page, page_size: 20 })
    if (!isCurrent()) return
    const items = reset ? result.items || [] : Array.from(new Map((owner._historyItems || []).concat(result.items || [])
      .map(item => [item.id || item.activity_key || `${item.source || item.type}:${item.source_id || item.activity_name}:${item.deduction_date || item.created_at}`, item])).values())
    apply(items, result)
    owner._historyItems = items
    owner._historyRetryReset = undefined
    owner.setData({ page: result.page || page, total: result.total, hasMore: (result.page || page) < (result.total_pages || 1) })
  } catch (error) {
    if (isCurrent()) {
      owner._historyRetryReset = reset
      owner.setData({ loadError: error.message || '加载失败，点击重试' })
    }
  } finally {
    if (isCurrent()) owner.setData({ loading: false, loadingMore: false })
  }
}

module.exports = { loadHistory }
