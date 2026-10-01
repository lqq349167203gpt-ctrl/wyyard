const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function moduleExports(file) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(`(function(exports) { ${code} })`, {})(exports)
  return exports
}

test('在途读取只复用相同键，完成后重新读取，失败可重试', async () => {
  const { reusePendingRead } = moduleExports('lib/read-requests.ts')
  let calls = 0, complete
  const load = () => { calls++; return new Promise(resolve => { complete = resolve }) }
  const first = reusePendingRead('same', load)
  assert.equal(reusePendingRead('same', load), first)
  const other = reusePendingRead('other', async () => { calls++; return 'other' })
  await other
  complete('first'); assert.equal(await first, 'first')
  await reusePendingRead('same', async () => { calls++; return 'second' })
  assert.equal(calls, 3)
  await assert.rejects(reusePendingRead('fail', async () => { throw new Error('失败') }))
  assert.equal(await reusePendingRead('fail', async () => '重试成功'), '重试成功')
})

test('失效后的新读取不会被旧读取完成时移除', async () => {
  const { reusePendingRead, clearPendingReads } = moduleExports('lib/read-requests.ts')
  let oldDone, newDone
  const old = reusePendingRead('a', () => new Promise(resolve => { oldDone = resolve }))
  clearPendingReads()
  const current = reusePendingRead('a', () => new Promise(resolve => { newDone = resolve }))
  oldDone('old'); await old
  assert.equal(reusePendingRead('a', () => { throw new Error('不应重发') }), current)
  newDone('current'); assert.equal(await current, 'current')
})

test('菜单、页面加载器、路由和角色页面权限完整对应', () => {
  const registry = moduleExports('lib/page-registry.ts')
  const app = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const routes = new Set()
  function walk(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(app) === 'path' && node.initializer && ts.isStringLiteral(node.initializer)) routes.add(node.initializer.text)
    ts.forEachChild(node, walk)
  }
  walk(app)
  const permissions = new Set(registry.PAGE_PERMISSIONS.map(p => p.key))
  const paths = registry.PAGES.map(p => p.path)
  assert.equal(new Set(paths).size, paths.length)
  assert.equal(permissions.size, registry.PAGE_PERMISSIONS.length)
  for (const page of registry.PAGES) {
    assert.ok(routes.has(page.path), `缺少路由 ${page.path}`)
    assert.equal(typeof registry.PAGE_LOADERS[page.path], 'function', `缺少加载器 ${page.path}`)
    assert.equal(registry.PATH_PERMISSIONS[page.path], page.permission)
    for (const permission of page.permissions || [{ key: page.permission }]) assert.ok(permissions.has(permission.key))
  }
  assert.equal(registry.PATH_PERMISSIONS['/config/upsell'], 'upsell-config')
  assert.deepEqual(new Set(registry.PERMISSION_GROUPS.flatMap(g => g.keys)), permissions)
})
