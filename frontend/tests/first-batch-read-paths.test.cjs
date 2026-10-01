const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// 执行真实请求/权限模块，仅替换浏览器和网络，不连接业务服务。
function harness() {
  const storage = new Map([
    ['currentUser', JSON.stringify({ id: 'a', role: '主角色', roles: ['主角色', '附加角色'] })],
    ['isLoggedIn', 'true'], ['authToken', 'token-a'],
  ])
  const requests = []
  const modules = {}
  const context = vm.createContext({
    console, URLSearchParams, Date, Promise,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { location: { pathname: '/healing-records' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail } },
    Event: class {},
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, reply: data => resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => data }) })),
  })
  function load(relative) {
    if (modules[relative]) return modules[relative]
    const source = readFileSync(path.join(__dirname, '../src', relative), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const exports = {}
    const requireModule = name => {
      if (name === 'react') return { useState: initial => [typeof initial === 'function' ? initial() : initial], useEffect: callback => callback() }
      if (name === '@/components/confirm-dialog') return { confirmDialog: async () => false }
      if (name === '@/lib/api') return load('lib/api.ts')
      if (name === '@/lib/read-requests') return load('lib/read-requests.ts')
      if (name === '@/hooks/use-page-permissions') return load('hooks/use-page-permissions.ts')
      throw new Error(`未配置的测试依赖 ${name}`)
    }
    vm.runInContext(`(function(require, exports) { ${code}\n })`, context)(requireModule, exports)
    modules[relative] = exports
    return exports
  }
  return { storage, requests, api: load('lib/api.ts'), permissions: load('hooks/use-edit-permissions.ts') }
}

test('权限订阅不自行请求单角色，合并并发账号权限刷新', async () => {
  const h = harness()
  h.permissions.useEditPermissions()
  h.permissions.useEditPermissions()
  assert.equal(h.requests.length, 0)
  const first = h.permissions.refreshAccountPermissions()
  const second = h.permissions.refreshAccountPermissions()
  assert.equal(first, second)
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].url, '/api/accounts/me/permissions')
  h.requests[0].reply({ pages: ['payment', 'class-records'], edit_permissions: { visits: 'all', activity_teachers: 'all' } })
  await first
  assert.equal(JSON.parse(h.storage.get('userEditPermissions')).visits, 'all')
  assert.equal(JSON.parse(h.storage.get('userEditPermissions')).activity_teachers, 'all')
})

test('保存权限后的强制刷新不被先前请求覆盖', async () => {
  const h = harness()
  const old = h.permissions.refreshAccountPermissions()
  const fresh = h.permissions.refreshAccountPermissions(true)
  h.requests[1].reply({ pages: ['payment'], edit_permissions: { visits: 'all' } })
  await fresh
  h.requests[0].reply({ pages: [], edit_permissions: { visits: 'view' } })
  await old
  assert.equal(JSON.parse(h.storage.get('userEditPermissions')).visits, 'all')
})

test('切账号后旧权限响应不得写入新账号', async () => {
  const h = harness()
  const pending = h.permissions.refreshAccountPermissions()
  h.storage.set('currentUser', JSON.stringify({ id: 'b' }))
  h.requests[0].reply({ pages: ['payment'], edit_permissions: { visits: 'all' } })
  await pending
  assert.equal(h.storage.has('userEditPermissions'), false)
})

test('客户候选名单复用并发请求，失效后不被旧响应填回', async () => {
  const h = harness()
  const old = h.api.customerApi.light()
  assert.equal(h.api.customerApi.light(), old)
  h.api.customerApi.clearLightCache()
  const fresh = h.api.customerApi.light()
  h.requests[1].reply([{ id: 'new' }])
  await fresh
  h.requests[0].reply([{ id: 'old' }])
  await old
  assert.equal((await h.api.customerApi.light())[0].id, 'new')
  assert.equal(h.requests.length, 2)
})

test('客户候选名单按登录和权限隔离；业务写入使缓存失效', async () => {
  const h = harness()
  const first = h.api.customerApi.light()
  h.requests[0].reply([{ id: 'a' }])
  await first
  h.storage.set('userPermissions', JSON.stringify(['changed']))
  const second = h.api.customerApi.light()
  h.requests[1].reply([{ id: 'b' }])
  await second
  const update = h.api.customerApi.update('b', { nickname: '修改后' })
  h.requests[2].reply({ id: 'b' })
  await update
  const third = h.api.customerApi.light()
  assert.equal(h.requests.length, 4)
  h.requests[3].reply([{ id: 'b', nickname: '修改后' }])
  await third
  h.api.clearAuthState()
  h.storage.set('authToken', 'token-c')
  const nextAccount = h.api.customerApi.light()
  assert.equal(h.requests.length, 5)
  h.requests[4].reply([])
  await nextAccount
})

test('只读批量查询不清客户缓存，会员卡写入会清除', async () => {
  const h = harness()
  const initial = h.api.customerApi.light()
  h.requests[0].reply([{ id: 'a' }])
  await initial
  const batch = h.api.customerApi.batch(['a'])
  h.requests[1].reply([{ id: 'a' }])
  await batch
  await h.api.customerApi.light()
  assert.equal(h.requests.length, 2)
  const card = h.api.membershipCardApi.create({ customer_id: 'a' })
  h.requests[2].reply({ id: 'card-a' })
  await card
  const refreshed = h.api.customerApi.light()
  assert.equal(h.requests.length, 4)
  h.requests[3].reply([{ id: 'a', member_type: '次卡会员' }])
  await refreshed
})

test('权限配置读取合并在途请求，使用心跳不使配置失效', async () => {
  const h = harness()
  const pending = h.api.positionApi.list()
  const heartbeat = h.api.loginRecordApi.heartbeat({ client_session_id: 'test', page_path: '/healing-records', active: true })
  h.requests[1].reply({ success: true }); await heartbeat
  assert.equal(h.api.positionApi.list(), pending)
  assert.equal(h.requests.length, 2)
  h.requests[0].reply([]); await pending
  const fresh = h.api.positionApi.list()
  assert.equal(h.requests.length, 3)
  h.requests[2].reply([]); await fresh
})
