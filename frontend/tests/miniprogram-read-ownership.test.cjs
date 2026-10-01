const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../..')
const settle = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
// 加载实际页面、组件与归属工具；不发网络请求、不进入小程序正式环境。
function fixture(file, api = {}, options = {}) {
  let definition
  const app = options.app || { globalData: { currentUser: { id: 'a' } } }
  const wx = { showToast() {}, getStorageSync() {}, setStorageSync() {}, ...options.wx }
  function load(filename) {
    const module = { exports: {} }
    const globals = { module, console: { ...console, error() {}, info() {} }, setTimeout, clearTimeout, wx,
      getApp: () => app, getCurrentPages: () => [],
      Page: value => { definition = value }, Component: value => { definition = value },
      require: name => {
        if (/\/api$/.test(name)) return api
        if (/\/config$/.test(name)) return { DEV: false, BASE_URL: 'http://test.invalid' }
        return load(path.resolve(path.dirname(filename), name + '.js'))
      },
    }
    vm.runInNewContext(readFileSync(filename, 'utf8'), globals, { filename })
    return module.exports
  }
  const exports = load(path.join(root, file))
  if (typeof exports === 'function') definition = exports(options.mode || 'courses')
  if (!definition) return exports
  const result = { ...definition, ...(definition.methods || {}), data: structuredClone(definition.data),
    properties: {}, triggerEvent() {} }
  result.setData = function(values, done) {
    for (const [key, value] of Object.entries(values)) {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let object = this.data
      keys.slice(0, -1).forEach(key => { object = object[key] || (object[key] = {}) })
      object[keys.at(-1)] = value
    }
    if (done) done()
  }
  return result
}

test('新增/编辑课表切日期，旧成功和旧失败不影响新邀约名单', async () => {
  for (const file of ['activity-create', 'activity-detail']) {
    const calls = []
    const p = fixture(`miniprogram/pages/${file}/index.js`, { visitApi: { listLight: date => {
      const d = deferred(); calls.push({ ...d, date }); return d.promise
    } } })
    p.data.date = '2026-10-01'
    const old = p.loadDayVisitors(p.data.date)
    p.data.date = '2026-10-02'
    const current = p.loadDayVisitors(p.data.date)
    calls[1].resolve([{ customer_id: 'b', customer_nickname: '乙' }]); await current
    calls[0].resolve([{ customer_id: 'a', customer_nickname: '甲' }]); await old
    assert.equal(p.data.dayVisitors[0].id, 'b')
    const closing = p.loadDayVisitors(p.data.date)
    p.onUnload(); calls[2].reject(new Error('旧错误')); await closing
    assert.equal(p.data.dayVisitors[0].id, 'b')
  }
})

test('粗门表单切客户、清空和关闭，旧可抵扣课程不会回填', async () => {
  const calls = []
  const p = fixture('miniprogram/components/payment-form/index.js', { paymentApi: { deductions: {
    coarseDoorOptions: id => { const d = deferred(); calls.push({ ...d, id }); return d.promise },
  } } })
  const old = p._loadCoarseDoorOptions('a'), current = p._loadCoarseDoorOptions('b')
  calls[1].resolve({ course_organizations: [{ id: 'org' }], courses: [{ name: '乙课程', organization_ids: ['org'] }] }); await current
  calls[0].reject(new Error('甲失败')); await old
  assert.equal(p.data.coarseCourses[0].name, '乙课程')
  assert.equal(p._coarseOptionsCustomerId, 'b')
  const clearing = p._loadCoarseDoorOptions('c')
  p.onPickerClear({ currentTarget: { dataset: { field: 'customer' } } })
  calls[2].resolve({ courses: [{ name: '旧课程' }] }); await clearing
  assert.equal(p.data.coarseCourses.length, 0)
  assert.equal(p.data.coarseOptionsLoading, false)
})

test('人员搜索输入和清空都会使旧结果失效，失败可重试', async () => {
  const calls = []
  const p = fixture('miniprogram/components/customer-picker/index.js', { visitApi: {
    searchCustomers: word => { const d = deferred(); calls.push({ ...d, word }); return d.promise },
  } })
  p.data.keyword = '甲'; const old = p.doSearch('甲')
  p.data.keyword = '乙'; const current = p.doSearch('乙')
  calls[1].resolve([{ id: 'b' }]); await current
  calls[0].resolve([{ id: 'a' }]); await old
  assert.equal(p.data.results[0].id, 'b')
  const clearing = p.doSearch('乙'); p.onClear()
  calls[2].resolve([{ id: 'b' }]); await clearing
  assert.equal(p.data.results.length, 0)
  p.data.keyword = '丙'; const failed = p.doSearch('丙')
  calls[3].reject(new Error('失败')); await failed
  assert.equal(p.data.searchError, '失败')
  const retry = p.retrySearch(); calls[4].resolve([{ id: 'c' }]); await retry
  assert.equal(p.data.results[0].id, 'c'); assert.equal(p.data.searchError, '')
})

test('付费分页在后端筛姓名和多选项，完整选项来自元数据，失败重试原页', async () => {
  let reads = 0
  const calls = []
  const p = fixture('miniprogram/pages/payment/index.js', {
    PAYMENT_PROJECT_TYPES: [{ key: 'membership_card', label: '会员卡' }],
    organizationApi: { list: async () => [] },
    paymentApi: { getByType: () => ({ listPaginated: async (page, size, params) => {
      calls.push({ page, size, params }); reads++
      if (reads === 2) throw new Error('失败')
      return { items: Array.from({ length: page === 1 ? 20 : 1 }, (_, i) => ({ id: String((page - 1) * 20 + i) })), page, total: 21,
        creator_options: [{ name: '甲' }, { name: '乙' }], subtype_options: [{ name: '60次卡' }, { name: '体验会员' }] }
    } }) },
  })
  Object.assign(p.data, { keyword: '姓名', selectedCreators: ['甲'], selectedSubtypes: ['60次卡'] })
  await p.loadItems()
  assert.equal(calls[0].params.keyword, '姓名')
  assert.equal(calls[0].params.creator_names, '["甲"]')
  assert.equal(calls[0].params.subtypes, '["60次卡"]')
  assert.equal(calls[0].size, 20); assert.equal(p.data.creatorList.length, 2)
  assert.equal(p.data.items.length, 20); assert.equal(p.data.total, 21)
  await p.loadItems(false)
  assert.equal(p.data.loadError, '失败'); assert.equal(p.data.page, 1)
  await p.retryLoad()
  assert.equal(calls[2].page, 2); assert.equal(p.data.items.length, 21); assert.equal(p.data.hasMore, false)
})

test('老师跟进旧请求不会覆盖新老师，最新失败有可重试状态', async () => {
  const calls = []
  const p = fixture('miniprogram/utils/service-teacher-records.js', { serviceTeacherApi: {
    list: params => { const d = deferred(); calls.push({ ...d, params }); return d.promise },
  } })
  p.data.teacherName = '甲'; const old = p.loadFollowUps(true)
  p.data.teacherName = '乙'; const current = p.loadFollowUps(true)
  calls[1].resolve({ items: [{ nickname: '乙客户' }], total: 1, summary: { total: 1 } }); await current
  calls[0].reject(new Error('旧失败')); await old
  assert.equal(p.data.followUpRecords[0].displayName, '乙客户'); assert.equal(p.data.loadError, '')
  const failure = p.loadFollowUps(true); calls[2].reject(new Error('新失败')); await failure
  assert.equal(p.data.loadError, '新失败'); assert.equal(p.data.followUpRecords[0].displayName, '乙客户')
})

test('邀约客户切换释放附加信息 loading，不带入旧客户需求', async () => {
  const old = deferred()
  const p = fixture('miniprogram/pages/visit-create/index.js', { visitNoteApi: { previousVisitNeed: () => old.promise } })
  Object.assign(p.data, { customerId: 'a', date: '2026-10-01', pickerField: 'customer' })
  const waiting = p.loadPreviousNeed()
  p.onPickerSelect({ currentTarget: { dataset: { id: 'b', nickname: '乙' } } })
  assert.equal(p.data.previousNeedLoading, false)
  old.resolve({ content: '甲需求' }); await waiting
  assert.equal(p.data.previousNeed, null)
})

test('协作信息组件换来源不能让旧记录与旧 finally 覆盖新状态', async () => {
  const calls = []
  const p = fixture('miniprogram/components/visit-note-section/index.js', { visitNoteApi: {
    list: id => { const d = deferred(); calls.push({ ...d, id }); return d.promise },
  } })
  p.properties = { visitId: 'a', category: 'customer_info' }
  const old = p.loadNotes()
  p.properties.visitId = 'b'; p.observers['visitId, category'].call(p, 'b', 'customer_info')
  calls[0].reject(new Error('旧失败')); await old
  assert.equal(p.data.loading, true); assert.equal(p.data.loadError, '')
  calls[1].resolve([{ category: 'customer_info', created_by: '乙', content: '乙内容', can_edit: true }]); await settle()
  assert.equal(p.data.myNote.content, '乙内容'); assert.equal(p.data.loading, false)
})

test('自定义筛选查询后重置，旧结果不能恢复旧表单', async () => {
  const old = deferred()
  const p = fixture('miniprogram/pages/custom-analysis/index.js', { customAnalysisApi: { execute: () => old.promise } })
  p.data.metadata = { fields: [{ value: 'nickname', label: '昵称' }], metrics: [], dimensions: [], period_fields: [], operators: [], selectable_fields: [] }
  // 使用页面实际默认计划和标准表单归一化逻辑。
  p.onReset()
  const waiting = p.execute(1)
  p.onReset()
  old.resolve({ plan: { ...p.data.plan, columns: ['nickname'] }, items: [{ id: 'old' }] }); await waiting
  assert.equal(p.data.result, null); assert.equal(p.data.querying, false)
})

test('客户端首页切日期，旧周不覆盖新周；缓存日也取消旧加载状态', async () => {
  const calls = []
  const p = fixture('miniprogram-client/pages/home/index.js', { clientApi: {
    listActivitiesByRange: () => { const d = deferred(); calls.push(d); return d.promise },
  } })
  p._decorate = item => item; p._cacheActivityImages = () => {}
  p.data.selectedStr = '2026-10-01'; const old = p._fetchWeekFor(p.data.selectedStr)
  p.data.selectedStr = '2026-10-08'; const current = p._fetchWeekFor(p.data.selectedStr)
  calls[1].resolve({ items: [{ id: 'b', date: '2026-10-08', type: 'class' }] }); await current
  calls[0].resolve({ items: [{ id: 'a', date: '2026-10-01', type: 'class' }] }); await old
  assert.equal(p.data.activities[0].id, 'b'); assert.equal(p.data.loading, false)
})

test('交易、活动和销卡历史旧读取不能覆盖新结果，失败不清空历史或伪装无记录', async () => {
  for (const [page, method, apiMethod] of [['transactions', 'loadTransactions', 'getTransactions'], ['activity-records', 'loadActivityRecords', 'getActivityRecords'], ['deductions', 'loadDeductions', 'getDeductions']]) {
    const calls = []
    const p = fixture(`miniprogram-client/pages/${page}/index.js`, { clientApi: {
      [apiMethod]: () => { const d = deferred(); calls.push(d); return d.promise },
    } })
    const old = p[method](), current = p[method]()
    calls[1].resolve({ items: [{ id: 'b' }] }); await current
    calls[0].reject(new Error('旧错误')); await old
    assert.equal(p.data.loadError, '')
    const failure = p[method](); calls[2].reject(new Error('新错误')); await failure
    assert.equal(p.data.loadError, '新错误')
    assert.equal((p.data.items || p.data.allItems)[0].id, 'b')
  }
})

test('客户端旧会话续期和 401 不覆盖或清除新登录，范围查询读取所有页', async () => {
  const requests = [], storage = { client_token: 'a' }, updated = [], cleared = []
  const app = { globalData: { token: 'a' }, updateToken: token => updated.push(token), clearLogin: () => cleared.push(true) }
  const api = fixture('miniprogram-client/utils/api.js', {}, { app, wx: {
    getStorageSync: key => storage[key], request: request => requests.push(request),
  } })
  const first = api.get('/first'), failed = api.get('/second')
  app.globalData.token = storage.client_token = 'b'
  requests[0].success({ statusCode: 200, header: { 'x-new-token': 'old-renewed' }, data: [] }); await first
  requests[1].success({ statusCode: 401, data: {} }); await assert.rejects(failed)
  assert.equal(updated.length, 0); assert.equal(cleared.length, 0)
  const range = api.clientApi.listActivitiesByRange('2026-10-01', '2026-10-31')
  requests[2].success({ statusCode: 200, data: { items: [{ id: 'a' }], total_pages: 2 } }); await settle()
  assert.match(requests[3].url, /page=2/)
  requests[3].success({ statusCode: 200, data: { items: [{ id: 'b' }], total_pages: 2 } })
  assert.equal((await range).items.map(item => item.id).join(','), 'a,b')
})

test('导出和上传共用来源、会话续期与中文错误；无权限不清登录', async () => {
  const requests = [], uploads = [], writes = [], storage = { auth_token: 'a', wyyard_device_id: 'device' }
  const api = fixture('miniprogram/utils/api.js', {}, { wx: {
    env: { USER_DATA_PATH: '/test' },
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value },
    request: data => requests.push(data), uploadFile: data => uploads.push(data),
    getFileSystemManager: () => ({ writeFile: data => { writes.push(data); data.success() } }),
  } })
  const download = api.downloadFile('/api/visits/export?date=2026-10-01', '邀约.xlsx')
  assert.equal(requests[0].responseType, 'arraybuffer')
  assert.equal(requests[0].header['X-Client-Type'], 'miniprogram')
  assert.equal(requests[0].header.Authorization, 'Bearer a')
  const binary = new ArrayBuffer(2)
  requests[0].success({ statusCode: 200, data: binary, header: { 'x-new-token': 'b' } })
  assert.equal(await download, '/test/邀约.xlsx'); assert.equal(writes[0].data, binary)
  assert.equal(storage.auth_token, 'b')
  const denied = api.downloadFile('/api/visits/export?date=2026-10-02', '邀约.xlsx')
  const bytes = Uint8Array.from(Buffer.from(JSON.stringify({ detail: '无权导出' }))).buffer
  requests[1].success({ statusCode: 403, data: bytes })
  await assert.rejects(denied, /无权导出/)
  assert.equal(writes.length, 1); assert.equal(storage.auth_token, 'b')
  const upload = api.uploadPublicImage('/test/image.png')
  assert.equal(uploads[0].header.Authorization, 'Bearer b')
  assert.equal(uploads[0].header['Content-Type'], undefined)
  uploads[0].success({ statusCode: 200, data: '{"url":"/image.png"}', header: { 'x-new-token': 'c' } })
  assert.equal((await upload).url, '/image.png'); assert.equal(storage.auth_token, 'c')
})

test('信息核对空间失败可重试，后续页失败不跳页，完整天数由后端提供', async () => {
  let spaceReads = 0, reads = 0
  const p = fixture('miniprogram/pages/audit-check/index.js', {
    spaceApi: { list: async () => { if (++spaceReads === 1) throw new Error('空间失败'); return [{ id: 's' }] } },
    auditCheckApi: { list: async params => {
      if (++reads === 2) throw new Error('第二页失败')
      return { days: [{ date: params.page === 1 ? '2026-10-01' : '2026-09-30', course: { rows: [] } }],
        page: params.page, total_days: 21, total_pages: 2, summary: { unchecked_day_count: 21 } }
    } },
  })
  await p.load(); assert.equal(p.data.error, '空间失败'); assert.equal(reads, 0)
  await p.load({}); assert.equal(spaceReads, 2); assert.equal(p.data.page, 1)
  await p.load(false); assert.equal(p.data.page, 1); assert.equal(p.data.error, '第二页失败')
  await p.load({}); assert.equal(p.data.page, 2); assert.equal(p.data.days.length, 2)
  assert.equal(p.data.totalDays, 21); assert.equal(p.data.hasMore, false)
})

test('表单元数据失败明确提示，仅重试失败来源，已有输入不被重载', async () => {
  let peopleReads = 0, statusReads = 0
  const p = fixture('miniprogram/pages/customer-form/index.js', {
    customerApi: { selector: async () => { if (++peopleReads === 1) throw new Error('人员失败'); return [{ id: 'a' }] } },
    followUpStatusApi: { list: async () => { statusReads++; return [{ name: '沟通中' }] } },
  })
  await Promise.all([p.loadCustomers(), p.loadFollowUpStatuses()])
  p.data.nickname = '已填写昵称'
  assert.equal(p.data.sourceError, '人员失败')
  await p.retrySources()
  assert.equal(p.data.sourceError, ''); assert.equal(peopleReads, 2); assert.equal(statusReads, 1)
  assert.equal(p.data.nickname, '已填写昵称')
})

test('课表选项失败后重试保留活动类型和原课程，不回到默认读书会', async () => {
  for (const file of ['activity-create', 'activity-detail']) {
    let reads = 0
    const p = fixture(`miniprogram/pages/${file}/index.js`, {
      courseTypeApi: { list: async () => {
        if (++reads === 1) throw new Error('课程选项失败')
        return [{ name: '读书会' }, { name: '自我关系探索' }]
      } }, organizationApi: { list: async () => [] },
    })
    p.data.activityType = file === 'activity-create' ? 'eks' : 'class'
    await p.loadCourses('自我关系探索')
    await p.loadCourses('自我关系探索')
    const selected = p.data.unifiedTypes[p.data.unifiedIndex]
    assert.equal(selected.value, p.data.activityType)
    if (file === 'activity-detail') assert.equal(selected.courseName, '自我关系探索')
    assert.equal(p.data.sourceError, '')
  }
})

test('客户详情先基本信息再当前页签，切页签不清空已读取的历史，失败可重试', async () => {
  const sections = [], pending = []
  const p = fixture('miniprogram/pages/customer-profile/index.js', {
    PAYMENT_PROJECT_TYPES: [{ key: 'membership_card' }], customerTagApi: { listForCustomer: async () => [] },
    customerApi: { detail: async (id, date, principal, course, section) => {
      sections.push(section)
      if (section === 'basic') return { customer: { id, nickname: '甲', first_visit: '2026-09-01', transaction_count: 45 } }
      const d = deferred(); pending.push(d); return d.promise
    } },
  })
  p.data.customerId = 'c'
  await p.loadData('c')
  assert.equal(sections.join(','), 'basic,healing')
  assert.equal(p.data.firstVisit, '2026-09-01')
  assert.equal(p.data.tabs.find(t => t.key === 'payment').count, null)
  pending[0].resolve({ visit_records: [{ id: 'v', visit_date: '2026-09-01', arrived: true }] }); await settle()
  p.onTabChange({ currentTarget: { dataset: { key: 'activities' } } })
  pending[1].reject(new Error('活动失败')); await settle()
  assert.equal(p.data.sectionStates.activities.error, '活动失败')
  const retry = p.retrySection()
  pending[2].resolve({ activities: [{ activity_key: 'class:a', participated: true, activity_type: 'class' }] }); await retry
  assert.equal(p.data.activities.length, 1); assert.equal(p.data.healingRecords.length, 1)
  assert.equal(p.data.tabs.find(t => t.key === 'activities').count, 1)
})

test('个人交易分页追加不漏无 id 的交易，失败重试原页，活动人数来自完整汇总', async () => {
  let reads = 0
  const p = fixture('miniprogram-client/pages/transactions/index.js', { clientApi: { getTransactions: async params => {
    if (++reads === 2) throw new Error('失败')
    return { items: [{ source_id: String(params.page), type: '会员卡' }], total: 45, page: params.page, total_pages: 3 }
  } } })
  await p.loadTransactions(true); await p.loadTransactions(false)
  assert.equal(p.data.page, 1); assert.equal(p.data.items.length, 1)
  await p.loadTransactions(); assert.equal(p.data.page, 2); assert.equal(p.data.items.length, 2)
  const a = fixture('miniprogram-client/pages/activity-records/index.js', { clientApi: { getActivityRecords: async params => {
    assert.equal(params.page_size, 20)
    return { items: [{ activity_key: 'a', date: '2026-10-01', filter_type: 'arrived' }], total: 21, total_pages: 2, summary: { total: 45, signedup: 3, arrived: 21, missed: 20 } }
  } } })
  await a.loadActivityRecords(true)
  assert.equal(a.data.totalCount, 45); assert.equal(a.data.arrivedCount, 21); assert.equal(a.data.hasMore, true)
})
