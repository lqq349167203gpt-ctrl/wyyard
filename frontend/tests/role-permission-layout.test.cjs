const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(relative) {
  const filename = path.join(__dirname, '../src', relative)
  const source = readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: name => load(name.replace('@/', '') + '.ts'),
  })
  return exports
}
const model = load('pages/position-management/permission-model.ts')
const registry = load('lib/page-registry.ts')

function permissions() {
  return {
    customers: 'all', visits: 'own', activities: 'view', activity_teachers: 'all', activity_participants: 'all',
    activity_lock: false, visit_lock: false, payments: 'own', principal_scope: 'own', course_records: 'all',
    contacts: { phone: { view: true, copy: false, edit: false }, wechat: { view: false, copy: false, edit: false } },
    customer_access: {
      scope: 'related', relations: { referrer: true, referrer_handler: false },
      sensitive_fields: { visit_purpose: false, trauma_history: false, current_block: false, work_info: false, other_info: false },
      detail_tabs: { follow_up: true, communication: false, activities: false, customer_followups: false, card_statistics: false, offline_courses: false },
      transaction_access: 'summary',
    },
    principal_external_access: { scope: 'none', relations: {}, sensitive_fields: { other_info: true }, detail_tabs: { follow_up: false }, transaction_access: 'none' },
  }
}

test('浏览和总览不改变历史配置，不把授课老师权限与课程编辑范围混在一起', () => {
  const edit = permissions()
  const before = JSON.stringify(edit)
  const pages = ['daily-activities', 'activity-checkin']
  const lines = model.pageSummary('daily-activities', pages, edit)
  assert.ok(lines.some(line => line.includes('课程内容编辑：仅浏览')))
  assert.ok(lines.some(line => line.includes('授课老师编辑：允许')))
  assert.ok(lines.some(line => line.includes('参与人员配置：全部课表')))
  assert.ok(lines.some(line => line.includes('核销：已开启')))
  assert.equal(JSON.stringify(edit), before)
  assert.equal(model.permissionChanges(JSON.stringify({ pages, editPermissions: edit }), pages, edit).length, 0)
})

test('共用信息与外部参与者分别追踪，修改摘要包含前后值', () => {
  const edit = permissions()
  const pages = ['principal', 'class-records']
  const snapshot = JSON.stringify({ pages, editPermissions: edit })
  const next = structuredClone(edit)
  next.customer_access.detail_tabs.follow_up = false
  const changes = model.permissionChanges(snapshot, pages, next)
  assert.equal(changes.length, 1)
  assert.match(changes[0], /共用权限.*跟进点.*允许 → 不允许/)
  assert.deepEqual(next.principal_external_access, edit.principal_external_access)
})

test('取消入口的联动也逐项列出，不仅报告页面开关', () => {
  const edit = permissions()
  const snapshot = JSON.stringify({ pages: ['daily-activities'], editPermissions: edit })
  const next = { ...edit, activities: 'own', activity_teachers: 'view', activity_participants: 'view' }
  const changes = model.permissionChanges(snapshot, [], next)
  assert.equal(changes.length, 4)
  assert.ok(changes.some(line => line.includes('已开启 → 未开启')))
  assert.ok(changes.some(line => line.includes('授课老师编辑')))
  assert.ok(changes.some(line => line.includes('参与人员配置')))
})

test('目录保留所有页面原子权限，核销和监管页签继续分别授权', () => {
  const keys = model.DIRECTORY_GROUPS.flatMap(group => group.keys)
  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual([...keys].sort(), [...registry.PAGE_PERMISSIONS].map(item => item.key).sort())
  for (const key of ['audit-check', 'debt-records', 'agreement-signings']) assert.ok(keys.includes(key))
  for (const impacts of Object.values(model.SHARED_IMPACTS)) {
    assert.equal(new Set(impacts).size, impacts.length)
    for (const key of impacts) assert.ok(keys.includes(key), `共用页面 ${key} 必须有目录入口`)
  }
  for (const key of ['principal', 'organizations', 'course-statistics']) assert.equal(model.SHARED_IMPACTS.scope.includes(key), false)
})

test('旧备注权限兼容读取，明确关闭的字段不被跟进点总开关重新开启', () => {
  const edit = permissions()
  assert.equal(model.detailAllowed(edit.customer_access, 'visit_need_tags'), true)
  edit.customer_access.detail_tabs.visit_need_tags = false
  assert.equal(model.detailAllowed(edit.customer_access, 'visit_need_tags'), false)
})

test('搜索权限名称包含尚未允许的选项，不能只检索已经授予的权限', () => {
  assert.ok(model.pageSearchText('class-records').includes('客户反馈'))
  assert.ok(model.pageSearchText('healing-records').includes('创伤经历'))
  assert.ok(model.pageSearchText('daily-activities').includes('参与人员配置'))
  assert.equal(model.pageSearchText('spaces').includes('客户反馈'), false)
})
