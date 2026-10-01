// 发布包独立：仅管理本页面异步读取归属，不跨两端共享状态。
function beginRead(owner, key, sameContext) {
  const versions = owner._readVersions || (owner._readVersions = {})
  const version = versions[key] = (versions[key] || 0) + 1
  return () => !owner._readsDisposed && versions[key] === version
    && (!sameContext || sameContext())
}
function disposeReads(owner) { owner._readsDisposed = true }
module.exports = { beginRead, disposeReads }
