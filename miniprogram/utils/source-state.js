const { beginRead } = require('./read-scope')

// 表单来源失败不能伪装成空选项；只重试失败来源，不重新覆盖使用者已填写的内容。
async function readSource(owner, key, fetch, apply, sameContext) {
  const current = beginRead(owner, 'source:' + key, sameContext)
  const update = state => {
    owner.setData({ [`sourceStates.${key}`]: state })
    const states = Object.values(owner.data.sourceStates || {})
    owner.setData({ sourceError: (states.find(item => item.error) || {}).error || '', sourcesLoading: states.some(item => item.loading) })
  }
  update({ loading: true, error: '' })
  try {
    const result = await fetch()
    if (!current()) return false
    apply(result)
    update({ loading: false, error: '' })
    return true
  } catch (error) {
    if (current()) update({ loading: false, error: error.message || '选项加载失败，点击重试' })
    return false
  }
}

function retrySources(owner, loaders) {
  return Promise.all(Object.entries(loaders).filter(([key]) => (owner.data.sourceStates || {})[key]?.error)
    .map(([, load]) => load()))
}

module.exports = { readSource, retrySources }
