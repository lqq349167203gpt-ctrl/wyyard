const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// 定向执行公共 Hook，模拟状态提交/副作用清理，不依赖浏览器或业务数据。
function paginationHarness(initialKey, initialEnabled = true) {
  const slots = [], effects = [], requests = []
  let cursor = 0, dirty = false, key = initialKey, enabled = initialEnabled, result
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) {
      const i = cursor++
      if (!slots[i]) slots[i] = { value: initial }
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true }
      }]
    },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }) },
    useCallback(fn, deps) {
      const i = cursor++
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }
      return slots[i].fn
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i]
        slots[i] = { deps }
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn() })
      }
    },
  }
  const exports = {}
  const source = readFileSync(path.join(__dirname, '../src/hooks/use-server-pagination.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(`(function(require, exports) { ${code}\n })`, {})(() => react, exports)
  function flush() {
    let count = 0
    do {
      if (++count > 20) throw new Error('发生重复渲染')
      dirty = false; cursor = 0
      const requestKey = key
      result = exports.useServerPagination((page, size, isCurrent) => new Promise((resolve, reject) => {
        requests.push({ page, key: requestKey, isCurrent, reject, reply: (value = requestKey) => resolve({ items: [value], total: 100, page, page_size: size, total_pages: 10 }) })
      }), { queryKey: key, enabled })
      while (effects.length) effects.shift()()
    } while (dirty)
  }
  flush()
  return {
    requests, flush, get result() { return result },
    query(next) { key = next; flush() },
    enable(value) { enabled = value; flush() },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
    async settle() { await new Promise(resolve => setImmediate(resolve)); flush() },
  }
}

test('纯表单禁用列表查询，停用及切换后元数据也不可由旧请求写入', async () => {
  const h = paginationHarness('a', false)
  assert.equal(h.requests.length, 0)
  h.result.refresh(); h.flush()
  assert.equal(h.requests.length, 0)
  h.enable(true)
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].isCurrent(), true)
  h.query('b')
  assert.equal(h.requests[0].isCurrent(), false)
  assert.equal(h.requests[1].isCurrent(), true)
  h.enable(false)
  assert.equal(h.requests[1].isCurrent(), false)
  h.requests[1].reply(); await h.settle()
  assert.equal(h.result.paginatedItems.length, 0)
})

test('筛选变更只请求第一页一次，旧翻页结果不得覆盖', async () => {
  const h = paginationHarness('a')
  h.requests[0].reply(); await h.settle()
  h.result.goToPage(3); h.flush()
  h.query('b')
  assert.deepEqual(h.requests.map(r => [r.key, r.page]), [['a', 1], ['a', 3], ['b', 1]])
  h.requests[2].reply(); await h.settle()
  h.requests[1].reply(); await h.settle()
  assert.equal(h.result.paginatedItems[0], 'b')
  assert.equal(h.result.currentPage, 1)
  assert.equal(h.requests.length, 3)
  h.query('a')
  assert.equal(h.requests.length, 4)
  assert.equal(h.requests[3].page, 1)
  h.requests[3].reply(); await h.settle()
  assert.equal(h.result.currentPage, 1)
})

test('相同查询标识不重复请求，失败后能重试', async () => {
  const h = paginationHarness('a')
  h.query('a')
  assert.equal(h.requests.length, 1)
  h.requests[0].reject('失败'); await h.settle()
  assert.equal(h.result.loading, false)
  assert.ok(h.result.error)
  h.result.refresh(); h.flush()
  h.requests[1].reply(); await h.settle()
  assert.equal(h.result.error, '')
})

test('旧调用方手动重置分页仍可用', async () => {
  const h = paginationHarness(undefined)
  h.requests[0].reply(); await h.settle()
  h.result.goToPage(2); h.flush()
  h.requests[1].reply(); await h.settle()
  h.result.resetPage(); h.flush()
  assert.equal(h.requests[2].page, 1)
  h.requests[2].reply(); await h.settle()
  h.result.resetPage(); h.flush()
  assert.equal(h.requests.length, 4)
})

test('刷新失败保留已加载记录，重试成功才替换结果', async () => {
  const h = paginationHarness('records')
  h.requests[0].reply('原有记录'); await h.settle()
  h.result.refresh(); h.flush()
  h.requests[1].reject(new Error('网络失败')); await h.settle()
  assert.equal(h.result.paginatedItems[0], '原有记录')
  assert.ok(h.result.error)
  h.result.refresh(); h.flush()
  h.requests[2].reply('新记录'); await h.settle()
  assert.equal(h.result.paginatedItems[0], '新记录')
  assert.equal(h.result.error, '')
})

test('卸载后未完成请求不再写状态', async () => {
  const h = paginationHarness('a')
  h.unmount()
  h.requests[0].reply('不应显示'); await h.settle()
  assert.equal(h.result.paginatedItems.length, 0)
})
