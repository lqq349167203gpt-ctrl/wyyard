// 只控制异步结果归属，不缓存数据、不改变请求和业务权限。
function beginRead(owner, key, sameContext) {
  const versions = owner._readVersions || (owner._readVersions = {})
  const version = versions[key] = (versions[key] || 0) + 1
  return () => !owner._readsDisposed && versions[key] === version
    && (!sameContext || sameContext())
}

function invalidateRead(owner, key) {
  const versions = owner._readVersions || (owner._readVersions = {})
  versions[key] = (versions[key] || 0) + 1
}

function disposeReads(owner) {
  owner._readsDisposed = true
}

module.exports = { beginRead, invalidateRead, disposeReads }
