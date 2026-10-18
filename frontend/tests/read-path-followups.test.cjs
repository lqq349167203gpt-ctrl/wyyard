const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// 从实际组件提取异步回调执行，隔离网络与 DOM，不复制业务实现。
function callback(file, name, bindings, effect = false) {
  const source = ts.createSourceFile(file, readFileSync(path.join(__dirname, '../src', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let target
  function visit(node) {
    if (effect && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
      && node.arguments[0]?.getText(source).includes(name)) target = node.arguments[0]
    if (!effect && ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      target = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(target, `找不到回调 ${name}`)
  const code = ts.transpileModule(`result = ${target.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const context = { ...bindings, result: null }
  vm.runInNewContext(code, context)
  return context.result
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('邀约历史只在面板打开后读取，关闭或切日期后的旧响应不回写', async () => {
  const reads = [], commits = [], failures = []
  const setup = (selectedDate, historyPanelOpen, pending) => callback('components/visits/detail-view.tsx', 'visitHistoryApi.list(selectedDate', {
    selectedDate, historyPanelOpen, spaceId: 'space',
    visitHistoryApi: { list(date) { reads.push(date); return pending.promise } },
    setHistoryLoading() {}, setHistoryError(message) { if (message) failures.push(message) },
    setCloudHistory(entries) { commits.push(entries) },
  }, true)()
  assert.equal(setup('2026-09-12', false, deferred()), undefined)
  assert.deepEqual(reads, [])
  const old = deferred(), fresh = deferred()
  const cancel = setup('2026-09-12', true, old)
  cancel()
  setup('2026-09-13', true, fresh)
  old.resolve([{ id: 'old', created_at: '2026-09-12T09:00:00Z', rows_snapshot: [] }])
  fresh.resolve([{ id: 'fresh', created_at: '2026-09-13T09:00:00Z', rows_snapshot: [] }])
  await settle()
  assert.equal(commits.length, 1)
  assert.equal(commits[0][0].id, 'fresh')
  assert.deepEqual(failures, [])
})

test('核对锁定与预览时课程老师只读，解锁后保持原编辑权限', () => {
  for (const [locked, previewRows, allowed, expected] of [
    [true, undefined, true, false], [false, [], true, false],
    [false, undefined, false, false], [false, undefined, true, true],
  ]) {
    const canEdit = callback('pages/daily-activities/activity-batch-table.tsx', 'canEditTeachers', {
      locked, previewRows, interactionBlocked: false, canEditRow: () => allowed,
    })
    assert.equal(canEdit({ id: 'course' }), expected)
  }
})

function reportEffect(date, pending, commits, errors) {
  const bindings = { dailyReportApi: {
    read: () => pending.promise.then(() => ({ date, visits: [], customers: [], activities: [], dashboard: { class_records: [] }, identities: [] })),
    finance: () => pending.promise.then(() => ({ sources: {}, sessions: { gcs: [], ers: [], eks: [] }, deductions: [] })),
  } }
  for (const name of ['setCustomers', 'setActivities', 'setVisits', 'setMemberIdentities']) {
    bindings[name] = () => commits.push(date)
  }
  return callback('pages/daily-report/index.tsx', 'dailyReportApi.read(detailDate)', {
    ...bindings, detailDate: date, setLoading: () => {}, setLoadError: value => { if(value) errors.push(value) },
    setLoadedDate: value => commits.push(value), canViewTransactions: true,
    setFinanceRows() {}, setHasCardSet() {}, setDeductionRows() {}, setFinanceLoading() {}, setFinanceLoadedDate() {}, setFinanceError() {},
  }, true)()
}

test('共用下拉框不嵌套按钮，移除与清空保留原交互', () => {
  const exports = {}, changes = []
  const source = readFileSync(path.join(__dirname, '../src/components/select-dropdown.tsx'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const react = { useRef: v => ({ current: v }), useState: v => [v, () => {}], useEffect: () => {}, useCallback: fn => fn }
  const imports = name => name === 'react' ? react : name === 'react/jsx-runtime' ? require(name)
    : name === 'react-dom' ? { createPortal: () => null }
      : name === 'lucide-react' ? { ChevronDown: () => null, ChevronRight: () => null, X: () => null }
        : { broadcastPopoverOpen: () => {} }
  vm.runInNewContext(`(function(require, exports) { ${code}\n })`, {})(imports, exports)
  for (const multi of [true, false]) {
    const tree = exports.SelectDropdown({ multi, value: multi ? ['a', 'b'] : 'a', clearable: true,
      options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }], onChange: value => changes.push(value) })
    const buttons = []
    function walk(node, inButton = false) {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(child => walk(child, inButton))
      if (node.type === 'button') { assert.equal(inButton, false); buttons.push(node) }
      walk(node.props?.children, inButton || node.type === 'button')
    }
    walk(tree)
    buttons.find(button => button.props['aria-label'] === (multi ? '移除甲' : '清空选择')).props.onClick({ stopPropagation() {} })
  }
  assert.equal(JSON.stringify(changes), JSON.stringify([['b'], '']))
})

test('组织查询结果不属于当前条件时禁止导出', async () => {
  // 实际函数声明，验证守卫发生在请求之前。
  const source = ts.createSourceFile('principal.tsx', readFileSync(path.join(__dirname, '../src/pages/principal/index.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let target
  function find(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'download') target = node; ts.forEachChild(node, find) }
  find(source)
  const code = ts.transpileModule(`${target.getText(source)}; result = download`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const state of [{ hasCurrentResult: false, pagination: { loading: false, error: '' } }, { hasCurrentResult: true, pagination: { loading: true, error: '' } }]) {
    let calls = 0
    const context = { ...state, result: null, setBusy: () => calls++, setError: () => calls++ }
    vm.runInNewContext(code, context)
    await context.result()
    assert.equal(calls, 0)
  }
})

test('每日报表旧日期后返回，不覆盖新日期任何数据', async () => {
  const old = deferred(), current = deferred(), commits = [], errors = []
  const cleanup = reportEffect('2026-09-01', old, commits, errors)
  cleanup()
  reportEffect('2026-09-02', current, commits, errors)
  current.resolve([]); await settle()
  assert.ok(commits.length > 0)
  old.resolve([]); await settle()
  assert.ok(commits.every(date => date === '2026-09-02'))
  assert.deepEqual(errors, [])
})

test('每日报表请求失败保留原结果，不提交空统计', async () => {
  const pending = deferred(), commits = [], errors = []
  reportEffect('2026-09-02', pending, commits, errors)
  pending.reject(new Error('读取失败')); await settle()
  assert.deepEqual(commits, [])
  assert.equal(errors.length, 1)
})

test('每日报表无交易权限不请求交易接口，交易失败也不阻塞普通内容', async () => {
  for (const allowed of [false, true]) {
    const committed = [], financialErrors = [], calls = []
    const bindings = { dailyReportApi: {
      read: async () => { calls.push('read'); return { date: '2026-09-02', visits: [], customers: [], activities: [], dashboard: { class_records: [] }, identities: [] } },
      finance: async () => { calls.push('finance'); throw new Error('没有查看交易明细的权限') },
    } }
    for (const name of ['setCustomers', 'setActivities', 'setVisits', 'setMemberIdentities']) bindings[name] = () => committed.push(name)
    callback('pages/daily-report/index.tsx', 'dailyReportApi.read(detailDate)', {
      ...bindings, detailDate: '2026-09-02', canViewTransactions: allowed,
      setLoading() {}, setLoadError(value) { assert.equal(value, '') }, setLoadedDate() {},
      setFinanceRows() {}, setHasCardSet() {}, setDeductionRows() {}, setFinanceLoading() {}, setFinanceLoadedDate() {},
      setFinanceError(value) { if (value) financialErrors.push(value) },
    }, true)()
    await settle()
    assert.equal(committed.length, 4)
    assert.equal(financialErrors.length, allowed ? 1 : 0)
    assert.equal(calls.filter(name => name === 'read').length, 1)
    assert.equal(calls.includes('finance'), allowed)
  }
})

test('报表导出尚未就绪时不能产生新日期的旧数据文件', () => {
  const run = callback('pages/daily-report/index.tsx', 'handleExport', { reportReady: false })
  assert.doesNotThrow(() => run()) // 任何 Blob / DOM / 文件操作均未提供，越过守卫即失败。
})

test('报表补全课程展示不把五类来源重复用于销卡计算', async () => {
  const sources = Object.fromEntries(['membership-cards', 'group-cases', 'emotional-releases', 'oh-card-readings',
    'energy-knots', 'internal-courses', 'other-projects', 'tea-seat-fees', 'offline-courses'].map(key => [key, []]))
  let rows, error = ''
  callback('pages/daily-report/index.tsx', 'dailyReportApi.read(detailDate)', {
    detailDate: '2026-10-01', canViewTransactions: true,
    dailyReportApi: {
      read: async () => ({ date: '2026-10-01', visits: [], customers: [{ id: 'a', nickname: '甲' }], identities: [],
        activities: Array.from({ length: 5 }, () => ({ participant_ids: ['a'], membership_deduction_count: 1 })),
        dashboard: { class_records: [{ participant_ids: ['a'], membership_deduction_count: 1 }] } }),
      finance: async () => ({ sources, deductions: [], sessions: { gcs: [{ participant_ids: ['a'] }], ers: [], eks: [] } }),
    },
    setCustomers() {}, setActivities() {}, setVisits() {}, setMemberIdentities() {}, setLoadedDate() {},
    setLoading() {}, setLoadError() {}, setFinanceRows() {}, setHasCardSet() {}, setFinanceLoading() {}, setFinanceLoadedDate() {},
    setDeductionRows(value) { rows = value }, setFinanceError(value) { error = value },
  }, true)()
  await settle()
  assert.equal(error, '')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].count, 2)
})

test('新日期读取未完成或失败时，实际日报界面不显示旧名单和旧课程', () => {
  const source = readFileSync(path.join(__dirname, '../src/pages/daily-report/index.tsx'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText
  for (const failed of [false, true]) {
    let stateIndex = 0
    const overrides = { 0: '2026-10-02', 3: [{ id: 'old', nickname: '旧日期客户' }],
      4: false, 5: failed ? '读取失败' : '', 7: '2026-10-01',
      12: [{ id: 'old-course', course_name: '旧日期课程' }] }
    const react = { useState(value) {
      const index = stateIndex++
      return [index in overrides ? overrides[index] : typeof value === 'function' ? value() : value, () => {}]
    }, useRef: value => ({ current: value }), useEffect() {}, useMemo: fn => fn(), startTransition: fn => fn() }
    const emptyComponents = new Proxy({ default: () => null }, { get: (target, key) => target[key] || (() => null) })
    const imports = name => name === 'react' ? react : name === 'react/jsx-runtime' ? require(name)
      : name.includes('use-organizations') ? { useOrganizations: () => ({ organizations: [] }) }
        : name.includes('use-edit-permissions') ? { useEditPermissions: () => ({ customer_access: { transaction_access: 'detail' } }) }
          : emptyComponents
    const exports = {}
    vm.runInNewContext(`(function(require, exports) { ${code} })`, {
      localStorage: { getItem: () => '2026-10-02' },
    })(imports, exports)
    const tree = exports.default()
    const text = require('react-dom/server').renderToStaticMarkup(tree)
    assert.equal(text.includes('旧日期客户'), false)
    assert.equal(text.includes('旧日期课程'), false)
    assert.ok(text.includes(failed ? '邀约数据尚未加载成功' : '加载中...'))
  }
})

test('课表同一日期保存后的余额刷新不被之前的候选请求覆盖', async () => {
  const pending = [deferred(), deferred()], values = [], errors = []
  let i = 0
  const run = callback('pages/daily-activities/activity-batch-table.tsx', 'fetchRemaining', {
    date: '2026-09-01', dateRef: { current: '2026-09-01' }, remainingSequences: { current: {} },
    remainingRequests: { current: {} }, requestedRemainingTypes: { current: new Set() },
    energyKnotSessionApi: { searchCustomers: () => pending[i++].promise },
    setRemainingMap(update) { values.push(update({})) }, setRemainingError(value) { errors.push(value) },
  })
  const old = run('eks', 'all'), fresh = run('eks', 'all', true)
  pending[1].resolve([{ id: 'a', remaining: 2 }]); await fresh
  pending[0].resolve([{ id: 'a', remaining: 5 }]); await old
  assert.equal(values.length, 1)
  assert.equal(values[0].eks.a, 2)
  assert.deepEqual(errors, [])
})

test('课表案主聚焦读取合并在途请求，旧请求完成不能删除保存后的新请求', async () => {
  const pending = [deferred(), deferred()], requests = { current: {} }
  let reads = 0
  const run = callback('pages/daily-activities/activity-batch-table.tsx', 'fetchRemaining', {
    date: '2026-09-01', dateRef: { current: '2026-09-01' }, remainingSequences: { current: {} },
    remainingRequests: requests, requestedRemainingTypes: { current: new Set() },
    energyKnotSessionApi: { searchCustomers: () => pending[reads++].promise },
    setRemainingMap() {}, setRemainingError() {},
  })
  const initial = run('eks', 'all')
  assert.equal(run('eks', 'all'), initial)
  const afterSave = run('eks', 'all', true)
  pending[0].resolve([]); await initial
  assert.equal(run('eks', 'all'), afterSave)
  assert.equal(reads, 2)
  pending[1].resolve([]); await afterSave
  assert.equal(Object.keys(requests.current).length, 0)
})

test('课表历史快照仅在展开时加载，换日期后旧响应不能提交', async () => {
  const requests = [], rows = []
  const setup = (detailDate, historyPanelOpen, scopeChanging = false) => callback('pages/daily-activities/index.tsx', 'activityHistoryApi.list(detailDate', {
    detailDate, selectedSpaceId: 'space', historyPanelOpen, scopeChanging,
    activityHistoryApi: { list() { const pending = deferred(); requests.push(pending); return pending.promise } },
    setCloudHistory(value) { rows.push(value) }, setHistoryLoading() {}, setHistoryError() {},
  }, true)()
  setup('2026-09-01', false)
  setup('2026-09-01', true, true)
  assert.equal(requests.length, 0)
  const cleanup = setup('2026-09-01', true)
  cleanup()
  setup('2026-09-02', true)
  requests[0].resolve([{ id: 'old', created_at: '2026-09-01T09:00:00Z', rows_snapshot: [] }])
  requests[1].resolve([{ id: 'new', created_at: '2026-09-02T09:00:00Z', rows_snapshot: [] }])
  await settle()
  assert.equal(rows.length, 1)
  assert.equal(rows[0][0].id, 'new')
})

function scheduleLoadHarness({ known = [], customersPending = null, dashboard, previousScope = null } = {}) {
  const state = {}, calls = [], customersRef = { current: known }, sequence = { current: 0 }
  const run = callback('pages/daily-activities/index.tsx', 'loadDateData', {
    selectedSpaceId: 'space', loadSeqRef: sequence, loadedScopeRef: { current: previousScope },
    customersLoadRef: { current: customersPending }, allCustomersRef: customersRef,
    flushPendingSavesRef: { current: async () => { calls.push('flush') } },
    classRecordApi: { dashboard: async date => { calls.push(['dashboard', date]); return typeof dashboard === 'function' ? dashboard(date) : dashboard } },
    customerApi: { batch: async ids => { calls.push(['batch', [...ids]]); return ids.map(id => ({ id })) } },
    setDetailLoading(value) { state.loading = value }, setDetailError(value) { state.error = value },
    setAllCustomers(update) { customersRef.current = update(customersRef.current) },
    ...Object.fromEntries(['DetailRecords', 'DetailGcsSessions', 'DetailErsSessions', 'DetailEksSessions', 'DetailIcsSessions', 'DetailVisits', 'CalendarCounts', 'LoadedScope'].map(key => [
      `set${key}`, value => { state[key] = value },
    ])),
  })
  return { run, state, calls, customersRef, sequence }
}

function scheduleDashboard(classRecords = []) {
  return { class_records: classRecords, gcs_sessions: [], ers_sessions: [], eks_sessions: [], ics_sessions: [], visits: [], calendar_counts: {} }
}

test('课表复用并行客户简表，只补缺失人员；已覆盖时不补取', async () => {
  const customers = deferred()
  const records = [{ id: 'course', teacher_ids: ['teacher'], participant_ids: ['known', 'missing'], groups: [] }]
  const harness = scheduleLoadHarness({ customersPending: customers.promise, dashboard: scheduleDashboard(records) })
  const pending = harness.run('2026-09-01')
  await settle()
  assert.equal(harness.calls.length, 1)
  harness.customersRef.current = [{ id: 'known' }, { id: 'teacher' }]
  customers.resolve(harness.customersRef.current)
  await pending
  assert.deepEqual(harness.calls[1], ['batch', ['missing']])
  assert.equal(harness.state.DetailRecords[0].id, 'course')
  const covered = scheduleLoadHarness({ known: [{ id: 'known' }, { id: 'teacher' }, { id: 'missing' }], dashboard: scheduleDashboard(records) })
  await covered.run('2026-09-01')
  assert.equal(covered.calls.length, 1)
})

test('课表切换范围先保存旧草稿，过期响应不覆盖新日期', async () => {
  const requests = { '2026-09-01': deferred(), '2026-09-02': deferred() }
  const harness = scheduleLoadHarness({ previousScope: { date: '2026-08-31', spaceId: 'space' }, dashboard: date => requests[date].promise })
  const old = harness.run('2026-09-01')
  await settle()
  const current = harness.run('2026-09-02')
  await settle()
  assert.equal(harness.calls[0], 'flush')
  requests['2026-09-02'].resolve(scheduleDashboard([{ id: 'new', teacher_ids: [], participant_ids: [], groups: [] }]))
  await current
  requests['2026-09-01'].resolve(scheduleDashboard([{ id: 'old', teacher_ids: [], participant_ids: [], groups: [] }]))
  await old
  assert.equal(harness.state.LoadedScope.date, '2026-09-02')
  assert.equal(harness.state.DetailRecords[0].id, 'new')
  assert.equal(harness.state.loading, false)
})

test('课表同ID刷新更新已保存内容、保留行节点与未保存草稿', () => {
  const rowsRef = { current: [
    { key: 1, record_id: 'saved', record_type: 'class', name: '旧老师' },
    { key: 2, record_id: 'draft', record_type: 'class', name: '正在输入' },
  ] }
  const savedRowsRef = { current: { 2: { name: '草稿修改前' } } }
  callback('pages/daily-activities/activity-batch-table.tsx', 'const signature = JSON.stringify', {
    date: '2026-09-01', spaceId: 'space', records: [
      { type: 'class', data: { id: 'saved', name: '新老师' } },
      { type: 'class', data: { id: 'draft', name: '后台旧内容' } },
    ], courses: [], spaces: [], courseTypes: [],
    prevRecordsRef: { current: { scope: '2026-09-01|space', signature: 'old' } },
    rowsRef, rowStatusRef: { current: { 1: 'saved', 2: 'idle' } }, savedRowsRef,
    eksEditsRef: { current: new Map() },
    recordToRow: (type, data) => ({ key: 99, record_id: data.id, record_type: type, name: data.name }),
    localStorage: { getItem: () => null }, setRows() {}, setRowStatus() {},
  }, true)()
  assert.equal(rowsRef.current[0].name, '新老师')
  assert.equal(rowsRef.current[0].key, 1)
  assert.equal(rowsRef.current[1].name, '正在输入')
  assert.equal(savedRowsRef.current[2].name, '草稿修改前')
})

test('课表课程配置晚于记录返回时，更新行显示而不重复获取排序', () => {
  const records = [{ type: 'class', data: { id: 'saved' } }]
  const rowsRef = { current: [{ key: 1, record_id: 'saved', record_type: 'class', name: '' }] }
  const spaces = []
  callback('pages/daily-activities/activity-batch-table.tsx', 'const signature = JSON.stringify', {
    date: '2026-09-01', spaceId: 'space', records, courses: [{ id: 'course', name: '课程名称' }], spaces, courseTypes: [],
    prevRecordsRef: { current: { scope: '2026-09-01|space', signature: JSON.stringify([records, [], spaces]) } },
    rowsRef, rowStatusRef: { current: { 1: 'saved' } }, savedRowsRef: { current: {} },
    eksEditsRef: { current: new Map() },
    recordToRow: (type, data, courses) => ({ key: 99, record_id: data.id, record_type: type, name: courses[0].name }),
    localStorage: { getItem: () => null }, setRows() {}, setRowStatus() {},
  }, true)()
  assert.equal(rowsRef.current[0].name, '课程名称')
  assert.equal(rowsRef.current[0].key, 1)
})

test('报表详情快速换人或关闭后，旧响应不改标题下的数据与加载状态', async () => {
  const pending = { a: deferred(), b: deferred(), c: deferred() }
  const state = {}, detailSequence = { current: 0 }
  const run = callback('pages/daily-report/index.tsx', 'openDetail', {
    detailSequence, detailDate: '2026-09-02', customerDetailApi: { get: id => pending[id].promise },
    setDetailType() {}, setSelectedPaymentCustomerId() {}, setDetailNickname(v) { state.name = v },
    setDetailOpen() {}, setDetailLoading(v) { state.loading = v }, setDetailExpanded() {}, setDetailOverflow() {},
    setDetailData(v) { state.data = v }, setDetailError(v) { state.error = v },
  })
  const a = run('visit', 'a', '甲'), b = run('visit', 'b', '乙')
  pending.b.resolve('乙的数据'); await b
  pending.a.resolve('甲的数据'); await a
  assert.equal(state.name, '乙'); assert.equal(state.data, '乙的数据')
  const c = run('visit', 'c', '丙')
  detailSequence.current++ // 关闭弹窗
  pending.c.reject(new Error('旧错误')); await c
  assert.equal(state.data, null); assert.equal(state.error, '')
})

test('组织数字明细遵守日期、取消状态及实际计入的课程键', () => {
  const exports = {}
  const source = readFileSync(path.join(__dirname, '../src/lib/principal-record-details.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(`(function(exports) { ${code} })`, {})(exports)
  const detail = { customer: {}, visit_records: [
    { visit_date: '2026-08-31', arrived: true }, { visit_date: '2026-09-01', arrived: true },
    { visit_date: '2026-09-30', arrived: false }, { visit_date: '2026-09-02', arrived: true, cancelled: true },
    { visit_date: '2026-10-01', arrived: true },
  ], activities: [
    { date: '2026-09-01', activity_key: 'class:counted' },
    { date: '2026-09-02', activity_key: 'gcs:owner-not-counted' },
    { date: '2026-08-31', activity_key: 'class:old' },
  ] }
  const rows = type => exports.principalRecordRows(detail, type, '2026-09-01', '2026-09-30', ['class:counted'])
  assert.equal(rows('invited').length, 2)
  assert.equal(rows('cancelled').length, 1)
  assert.equal(rows('arrived').length, 1)
  assert.equal(rows('activity').length, 1)
  detail.customer.customer_access_permissions = { detail_tabs: { activities: false } }
  assert.throws(() => rows('activity'), /没有查看活动记录的权限/)
})

test('成交明细沿用打开时的筛选，超过100笔可继续请求第六页，过期结果不标记就绪', async () => {
  const selection = { customer_id: 'customer-a', date_from: '2026-09-01', date_to: '2026-09-30', tab: 'orders', list_view: 'order' }
  const calls = [], committed = []
  const run = callback('pages/principal/index.tsx', 'dealPagination', {
    dealDetail: { query: selection }, dealQueryKey: 'customer-a-september',
    setDealResultKey(value) { committed.push(value) },
    principalApi: { query: async (query, page, size) => {
      calls.push({ query, page, size })
      return { items: Array.from({ length: size }, (_, i) => ({ id: (page - 1) * size + i + 1 })), total: 125, total_pages: 7, page, page_size: size }
    } },
  })
  const sixth = await run(6, 20, () => true)
  assert.equal(sixth.items[0].id, 101)
  assert.equal(sixth.total, 125)
  assert.equal(calls[0].query, selection)
  assert.deepEqual(committed, ['customer-a-september'])
  await run(7, 20, () => false)
  assert.equal(committed.length, 1)
})

// 分页刷新失败保留记录由 server-pagination.test.cjs 对实际公共 Hook 验证。

test('组织概况先取轻量选项，切换后完整选项不被旧响应覆盖', async () => {
  const requests = [], values = []
  const fullMetadataLoaded = { current: false }
  const setup = tab => callback('pages/principal/index.tsx', 'principalApi.metadata(', {
    query: { tab }, fullMetadataLoaded,
    setMetadata: value => values.push(value), setError: () => {},
    principalApi: { metadata: lite => {
      const d = deferred(); requests.push({ ...d, lite }); return d.promise
    } },
  }, true)()
  const cleanup = setup('overview')
  assert.equal(requests[0].lite, true)
  cleanup()
  setup('conversion')
  assert.equal(requests[1].lite, false)
  requests[1].resolve('完整选项'); await settle()
  requests[0].resolve('轻量旧选项'); await settle()
  assert.deepEqual(values, ['完整选项'])
  setup('overview')
  assert.equal(requests.length, 2)
})

test('组织概况不预取转化模板，进入转化才加载', async () => {
  let calls = 0
  const rulesLoaded = { current: false }
  const setup = tab => callback('pages/principal/index.tsx', 'rulesLoaded.current', {
    query: { tab }, rulesLoaded, setRules: () => {}, setError: () => {},
    principalApi: { rules: async () => { calls++; return [] } },
  }, true)()
  setup('overview'); assert.equal(calls, 0)
  setup('conversion'); await settle(); assert.equal(calls, 1)
  setup('conversion'); assert.equal(calls, 1)
})

test('分组只读加载丢弃旧日期，不能根据页面名单自动保存', async () => {
  const requests = [], values = []
  const setup = detailDate => callback('pages/class-records/index.tsx', 'dailyGroupingApi.get', {
    detailDate, setGroups: value => values.push(value),
    dailyGroupingApi: {
      get: () => { const d = deferred(); requests.push(d); return d.promise },
      upsert: () => { throw new Error('读取页面不允许保存分组') },
    },
  }, true)()
  const cleanup = setup('2026-09-01'); cleanup()
  setup('2026-09-02')
  requests[1].resolve({ groups: ['当前日分组'] }); await settle()
  requests[0].resolve({ groups: ['旧日分组'] }); await settle()
  assert.equal(values.at(-1)[0], '当前日分组')
})

test('导入查重读取100条以外的数据，查询失败必须终止', async () => {
  const pages = []
  const build = callback('pages/payment/unified-payment.tsx', 'buildExistingKeys', {
    getApi: () => ({ listPaginated: async page => {
      pages.push(page)
      return { items: [{ customer_id: `c${page}`, deal_date: '2026-09-01', card_type: '次卡', price: 398 }], total_pages: 2 }
    } }),
  })
  const keys = await build(['membership_card'])
  assert.deepEqual(pages, [1, 2])
  assert.ok(keys.has('c2|membership_card|2026-09-01|次卡|398'))
  const fail = callback('pages/payment/unified-payment.tsx', 'buildExistingKeys', {
    getApi: () => ({ listPaginated: async () => { throw new Error('查重失败') } }),
  })
  await assert.rejects(fail(['membership_card']), /查重失败/)
})

test('服务老师统计只接受当前查询的汇总', async () => {
  const requests = [], values = []
  const fetch = callback('pages/service-teachers/index.tsx', 'fetchCustomers', {
    mode: 'followups', teacher: '老师', followUpFilter: 'all', followUpDefinition: 'all', followUpDays: 30,
    serviceTeacherCustomerApi: { list: () => { const d = deferred(); requests.push(d); return d.promise } },
    setSummary: value => values.push(value),
  })
  let current = 1
  const old = fetch(1, 10, () => current === 1)
  current = 2
  const fresh = fetch(1, 10, () => current === 2)
  requests[1].resolve({ summary: '新统计' }); await fresh
  requests[0].resolve({ summary: '旧统计' }); await old
  assert.deepEqual(values, ['新统计'])
})

test('邀约切换日期后旧成交笔数不覆盖，新日期失败也不显示旧笔数', async () => {
  const requests = [], values = []
  const setup = date => callback('components/visits/batch-input-table.tsx', 'getDailyCounts', {
    date, setDailyTotals: value => values.push(value),
    consumptionRecordsApi: { getDailyCounts: () => { const d = deferred(); requests.push(d); return d.promise } },
  }, true)()
  const cleanup = setup('2026-09-01')
  cleanup()
  setup('2026-09-02')
  requests[1].resolve({ current: 2 }); await settle()
  requests[0].resolve({ previous: 9 }); await settle()
  assert.equal(values.at(-1).current, 2)
  setup('2026-09-03')
  requests[2].reject(new Error('网络失败')); await settle()
  assert.equal(Object.keys(values.at(-1)).length, 0)
})

test('分析日志切换页签后，旧响应不替换人员选项', async () => {
  const requests = [], values = []
  const filtersRef = { current: { kind: 'custom' } }
  const fetchLogs = callback('pages/analysis-logs/index.tsx', 'fetchLogs', {
    filtersRef, setOperators: value => values.push(value),
    analysisLogApi: { list: () => { const d = deferred(); requests.push(d); return d.promise } },
  })
  const old = fetchLogs(1, 10)
  filtersRef.current = { kind: 'conversion' }
  const fresh = fetchLogs(1, 10)
  requests[1].resolve({ operators: ['当前页签'] }); await fresh
  requests[0].resolve({ operators: ['旧页签'] }); await old
  assert.equal(values.length, 1)
  assert.equal(values[0][0], '当前页签')
})

test('付费搜索仅更新查询条件，由公共分页触发请求，不另发旧页请求', () => {
  const values = {}
  const update = callback('pages/payment/unified-payment.tsx', 'handleFilterChange', {
    setSearchNickname: value => { values.nickname = value },
    setSearchCloserName: value => { values.closer = value },
    refresh: () => { throw new Error('不应直接刷新旧页') },
  })
  update('nickname', '客户甲')
  update('closer', '老师乙')
  assert.deepEqual(values, { nickname: '客户甲', closer: '老师乙' })
})

test('退费状态切换列表后丢弃旧结果，失败明确标识而不冒充未退费', async () => {
  const requests = [], state = {}
  const setup = id => callback('pages/payment/unified-payment.tsx', 'projectRefundApi.statusKeys', {
    paginatedItems: [{ id, type: 'group_case' }],
    setRefundedKeys: keys => { state.keys = keys },
    setRefundStatusError: value => { state.error = value },
    setRefundStatusLoading: value => { state.loading = value },
    projectRefundApi: { statusKeys: () => { const d = deferred(); requests.push(d); return d.promise } },
  }, true)()
  const cleanup = setup('old')
  cleanup()
  setup('new')
  requests[1].resolve(['group-cases:new']); await settle()
  requests[0].resolve(['group-cases:old']); await settle()
  assert.ok(state.keys.has('group-cases:new'))
  assert.ok(!state.keys.has('group-cases:old'))
  setup('failed')
  requests[2].reject(new Error('失败')); await settle()
  assert.equal(state.error, true)
  assert.equal(state.loading, false)
})

test('Excel 工具导入时不加载库，实际操作才加载且失败可重试', async () => {
  const source = readFileSync(path.join(__dirname, '../src/lib/excel.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let calls = 0
  const context = {
    exports: {},
    require: name => {
      assert.equal(name, 'exceljs')
      calls++
      if (calls === 1) throw new Error('首次加载失败')
      return { Workbook: '测试工作簿' }
    },
  }
  vm.runInNewContext(code, context)
  assert.equal(calls, 0)
  await assert.rejects(context.exports.loadExcel(), /首次加载失败/)
  assert.equal((await context.exports.loadExcel()).Workbook, '测试工作簿')
  assert.equal(calls, 2)
})
