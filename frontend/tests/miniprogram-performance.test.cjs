const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../..')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

function load(file, imports = {}, globals = {}) {
  const context = { module: { exports: {} }, console: { info() {}, log() {}, error() {} },
    setTimeout, clearTimeout, ...globals, require: name => {
      if (!(name in imports)) throw new Error(`未提供依赖：${name}`)
      return imports[name]
    } }
  vm.runInNewContext(readFileSync(path.join(root, file), 'utf8'), context, { filename: file })
  return context.module.exports
}
function page(file, api, globals = {}) {
  let instance
  const scheduleDate = load('miniprogram/utils/schedule-date.js', {}, { wx: globals.wx || {} })
  load(file, { '../../utils/api': api, '../../utils/util': { formatDate: () => '2026-10-01' },
    '../../utils/schedule-date': scheduleDate,
    '../../utils/record-ownership': { canEditRecord: () => true },
    '../../utils/customer-access': {}, '../../utils/customer-search': {},
    '../../utils/permissions': {} }, { Page: value => { instance = value }, wx: {}, ...globals })
  instance.data = structuredClone(instance.data)
  instance.setData = function(values, done) { Object.assign(this.data, values); if (done) done() }
  return instance
}

test('两端在途读取只合并同一会话，完成与写入后重新读取', async () => {
  for (const client of [false, true]) {
    const requests = [], storage = { auth_token: 'a', client_token: 'a', currentUser: { id: 'a' } }
    const app = { globalData: { token: 'a' }, updateToken() {}, clearLogin() {} }
    const api = load(client ? 'miniprogram-client/utils/api.js' : 'miniprogram/utils/api.js', {
      './config': { BASE_URL: 'http://test.invalid', DEV: false },
    }, { getApp: () => app, getCurrentPages: () => [{ route: 'pages/customers/index' }], wx: {
      getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value },
      request: options => requests.push(options), showToast() {},
    } })
    const read = () => client ? api.get('/api/client/activities') : api.request('/api/customers/light')
    const first = read(), duplicate = read()
    assert.equal(first, duplicate)
    assert.equal(requests.length, 1)
    storage.auth_token = storage.client_token = app.globalData.token = 'b'
    const other = read()
    assert.equal(requests.length, 2)
    requests[0].success({ statusCode: 200, data: ['a'] })
    requests[1].success({ statusCode: 200, data: ['b'] })
    await Promise.all([first, other])
    const pending = read()
    const write = client ? api.post('/api/client/test', {}) : api.request('/api/customers', { method: 'POST' })
    const fresh = read()
    assert.notEqual(pending, fresh)
    assert.equal(requests.length, 5)
    for (const request of requests.slice(2)) request.success({ statusCode: 200, data: [] })
    await Promise.all([pending, write, fresh])
    const after = read()
    assert.equal(requests.length, 6)
    requests[5].fail({ errMsg: '失败' })
    await assert.rejects(after)
    const retry = read()
    assert.equal(requests.length, 7)
    requests[6].success({ statusCode: 200, data: [] })
    await retry
  }
})

test('沟通分页保留全量筛选选项，失败重试原页，旧查询不覆盖新查询', async () => {
  const requests = []
  const { communicationList } = load('miniprogram/utils/communication-list.js', { './api': {
    communicationRecordApi: { listPage: params => { const d = deferred(); requests.push({ ...d, params }); return d.promise } },
  } })
  const p = { ...communicationList(), data: { page: 1, records: [], selectedCreators: [], keyword: '', hasMore: false },
    setData(values) { Object.assign(this.data, values) }, updateCreatorList() {} }
  const result = ids => ({ items: ids.map(id => ({ id })), total: 21, creators: ['乙', '甲'], creator_counts: { 甲: 30, 乙: 10 } })
  const first = p.loadList(); requests[0].resolve(result(Array.from({ length: 20 }, (_, i) => i))); await first
  assert.equal(p.data.records.length, 20)
  assert.equal(p.data.creatorNames[0], '甲')
  const more = p.loadList(false); requests[1].reject(new Error('暂时失败')); await more
  assert.equal(p.data.page, 1); assert.equal(p.data.records.length, 20)
  const retry = p.retryList(); assert.equal(requests[2].params.page, 2)
  requests[2].resolve(result([20])); await retry
  assert.equal(p.data.records.length, 21); assert.equal(p.data.hasMore, false)
  const old = p.loadList(); p.data.keyword = '新'; p.data.selectedCreators = ['甲', '乙']
  const current = p.applySearch()
  assert.equal(requests[4].params.creator_names.join(','), '甲,乙')
  requests[4].resolve(result(['new'])); await current
  requests[3].resolve(result(['old'])); await old
  assert.equal(p.data.records[0].id, 'new')
})

test('沟通搜索无条件时只取创建人元数据，不下载历史库', async () => {
  let params
  const { communicationList } = load('miniprogram/utils/communication-list.js', { './api': {
    communicationRecordApi: { listPage: async value => { params = value; return { items: [{ id: 'hidden' }], total: 999, creators: [] } } },
  } })
  const p = { ...communicationList(true), data: { page: 1, records: [], selectedCreators: [] },
    setData(values) { Object.assign(this.data, values) }, updateCreatorList() {} }
  await p.loadList()
  assert.equal(params.page_size, 1); assert.equal(p.data.total, 0); assert.equal(p.data.records.length, 0)
})

test('日报普通内容不等待财务，财务失败可重试且不显示假零值', async () => {
  const financial = deferred()
  const api = { visitApi: { counts: async () => ({}) }, organizationApi: { list: async () => [] },
    dailyReportApi: { read: async () => ({ visits: [{ id: 'v' }], customers: [], identities: [], dashboard: {}, transaction_access: 'detail' }),
      finance: () => financial.promise } }
  const p = page('miniprogram/pages/daily-report/index.js', api)
  Object.assign(p.data, { currentDate: '2026-10-01', calYear: 2026, calMonth: 9 })
  const loading = p.loadData(); await settle()
  assert.equal(p.data.loading, false); assert.equal(p.data.financeLoading, true)
  assert.equal(p.data.visits[0].amountText, '—'); assert.equal(p.data.visits[0].remainingText, '—')
  financial.reject(new Error('财务读取失败')); await loading
  assert.equal(p.data.error, ''); assert.equal(p.data.financeError, '财务读取失败')
  api.dailyReportApi.finance = async () => ({ sources: {}, deductions: [] })
  await p.retryFinance(); assert.equal(p.data.financeReady, true)
  assert.equal(p.data.visits[0].amountText, '0笔')
})

test('日报旧日期和无交易权限不请求、不覆盖财务来源', async () => {
  const requests = []
  let financeReads = 0
  const p = page('miniprogram/pages/daily-report/index.js', {
    visitApi: { counts: async () => ({}) }, dailyReportApi: {
      read: date => { const d = deferred(); requests.push({ ...d, date }); return d.promise },
      finance: () => { financeReads++; return Promise.resolve({}) },
    },
  })
  Object.assign(p.data, { currentDate: '2026-10-01', calYear: 2026, calMonth: 9 })
  const old = p.loadData(); p.data.currentDate = '2026-10-02'; const current = p.loadData()
  const result = id => ({ visits: [{ id }], customers: [], identities: [], dashboard: {}, transaction_access: 'none' })
  requests[1].resolve(result('new')); await current
  requests[0].resolve(result('old')); await old
  assert.equal(p.data.visits[0].id, 'new'); assert.equal(financeReads, 0)
})

test('返回日报同步课表/邀约日期，日报选日期也同步其他入口', async () => {
  const storage = { schedule_selected_date: '2026-10-02', visit_selected_date: '2026-10-01' }
  const p = page('miniprogram/pages/daily-report/index.js', {}, {
    getApp: () => ({ checkLogin: () => true }), wx: {
      getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value },
    },
  })
  p._ready = true
  p.data.currentDate = '2026-10-01'
  const dates = []
  p.loadData = () => { dates.push(p.data.currentDate) }
  p.onShow()
  assert.equal(dates[0], '2026-10-02')
  assert.equal(p.data.currentDateShort, '10月2日')
  assert.equal(p.data.currentWeekday, '周五')
  p.onCalendarDayTap({ currentTarget: { dataset: { date: '2026-10-03' } } })
  assert.equal(dates[1], '2026-10-03')
  assert.equal(storage.schedule_selected_date, '2026-10-03')
  assert.equal(storage.visit_selected_date, storage.activity_selected_date)
})

test('日报展示五类统一课程来源，重读失败不暴露旧列表', async () => {
  let fail = false
  const p = page('miniprogram/pages/daily-report/index.js', {
    visitApi: { counts: async () => ({}) }, dailyReportApi: {
      read: async () => {
        if (fail) throw new Error('读取失败')
        return { visits: [{ id: 'v', nickname: '甲', customer_id: 'a' }],
          customers: [{ id: 'a', nickname: '甲', member_type: '新人' }], identities: [{ name: '新人', type: '新人' }],
          transaction_access: 'none', dashboard: {},
          activities: ['class_record', 'group_case', 'emotional_release', 'energy_knot', 'internal_course'].map(source => ({
            id: source + '_same', source, course_name: source, course_type: source,
            participant_ids: ['a'], teacher_names: ['乙'],
          })) }
      },
    },
  })
  Object.assign(p.data, { currentDate: '2026-10-01', calYear: 2026, calMonth: 9 })
  await p.loadData()
  assert.equal(p.data.activities.length, 5)
  assert.equal(p.data.visits[0].todayActCount, 5)
  assert.equal(p.data.activities[1].teacherText, '乙')
  assert.equal(p.data.activities[1].newCount, 1)
  fail = true
  p.data.currentDate = '2026-10-02'
  await p.loadData()
  assert.equal(p.data.error, '读取失败')
  assert.equal(p.data.loading, false)
  // 视图的 !loading && !error 条件保持旧列表不可见。
})

test('客户重筛不等待旧请求，完整目录保留未加载页的引流人选项', async () => {
  const requests = []
  const p = page('miniprogram/pages/customers/index.js', { customerApi: {
    list: params => { const d = deferred(); requests.push({ ...d, params }); return d.promise },
    light: async () => [{ id: 'a', nickname: '引流甲', referrer: '' }, { id: 'b', nickname: '引流乙', referrer: '' },
      { id: 'unloaded', nickname: '其他客户', referrer: '引流乙' }],
  } })
  p.restoreScrollAnchor = () => {}
  await p.loadActiveCustomerNames()
  assert.equal(p.data.referrerList[0].name, '引流乙')
  const old = p.loadData(true); p.data.keyword = '新'; const current = p.loadData(true)
  assert.equal(requests.length, 2); assert.equal(requests[1].params.page_size, 20)
  requests[1].resolve({ items: [{ id: 'new' }], total: 1 }); await current
  requests[0].resolve({ items: [{ id: 'old' }], total: 1 }); await old
  assert.equal(p.data.customers[0].id, 'new')
  assert.equal(p.data.referrerList[0].name, '引流乙')
})

test('邀约快速切日期并行读取，不等待旧日期也不应用旧排序', async () => {
  const requests = []
  let migrations = 0
  const p = page('miniprogram/pages/visits/index.js', {
    visitApi: { listLight: date => { const d = deferred(); requests.push({ ...d, date }); return d.promise }, counts: async () => ({}) },
    visitVerificationApi: { list: async () => [] },
  })
  p._migrateLocalOrder = async () => { migrations++ }
  p.buildLeaderMap = () => ({})
  Object.assign(p.data, { currentDate: '2026-10-01', calYear: 2026, calMonth: 9 })
  const old = p.loadData(); p.data.currentDate = '2026-10-02'; const current = p.loadData()
  assert.equal(requests.length, 2)
  requests[1].resolve([{ id: 'new' }]); await current
  requests[0].resolve([{ id: 'old' }]); await old
  assert.equal(p.data.visits[0].id, 'new'); assert.equal(migrations, 1)
})
