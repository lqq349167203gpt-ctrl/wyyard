const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')

function fixture(response) {
  const store = new Map(), calls = []
  const app = { globalData: {}, enterDefaultView: () => calls.push('entered') }
  const wx = { getStorageSync: key => store.get(key), setStorageSync: (key, value) => store.set(key, value),
    removeStorageSync: key => store.delete(key), showToast() {}, login() {},
    request: options => { calls.push(options); queueMicrotask(() => response ? options.success(response) : options.fail({ errMsg: 'request:fail timeout' })) } }
  const context = { module: { exports: {} }, wx, getApp: () => app, getCurrentPages: () => [], setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} }, require: name => {
      assert.equal(name, './config'); return { DEV: true, BASE_URL: 'http://local-preview.invalid' }
    } }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/api.js'), 'utf8'), context)
  const api = context.module.exports
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/login/index.js'), 'utf8'), {
    Page: page => { definition = page }, wx, getApp: () => app,
    require: name => name.endsWith('/api') ? api : { DEV: true },
  })
  const page = { ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values) } }
  return { api, page, calls, store, app }
}

test('本地登录连接失败在12秒超时后解除登录中，显示网络原因，不误报密码错误', async () => {
  const { page, calls } = fixture()
  Object.assign(page.data, { username: 'test-user', password: 'test-only' })
  await page.onPasswordLogin()
  const request = calls.find(x => typeof x === 'object')
  assert.equal(request.timeout, 12000)
  assert.equal(request.header.Authorization, undefined)
  assert.equal(page.data.loading, false)
  assert.match(page.data.error, /本地服务.*同一 Wi-Fi/)
})

test('旧登录态探测使用轻量接口，失败也会退出正在进入状态且保留登录表单', async () => {
  const { page, store, calls } = fixture()
  store.set('auth_token', 'old-session')
  store.set('currentUser', { role: '课程老师' })
  page.data.username = 'saved-user'
  await page._trySkipLogin()
  assert.equal(calls[0].url, 'http://local-preview.invalid/api/accounts/me/permissions')
  assert.equal(calls[0].timeout, 12000)
  assert.equal(page.data.checkingLogin, false)
  assert.equal(page.data.username, 'saved-user')
  assert.equal(store.get('auth_token'), 'old-session')
})

test('网关返回502时说明本地服务连接问题，保留已有登录态', async () => {
  const { api, store } = fixture({ statusCode: 502, data: 'Bad Gateway', header: {} })
  store.set('auth_token', 'old-session')
  store.set('currentUser', { role: '课程老师' })
  await assert.rejects(api.authApi.sessionStatus(), /本地服务连接失败/)
  assert.equal(store.get('auth_token'), 'old-session')
})

test('登录接口的业务错误保持原有提示', async () => {
  const { api } = fixture({ statusCode: 403, data: { detail: '账号已停用' }, header: {} })
  await assert.rejects(api.authApi.passwordLogin('test-user', 'test-only'), /账号已停用/)
})
