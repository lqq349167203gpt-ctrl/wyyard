const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../..')
const helper = require('../../miniprogram/utils/course-roster')
const feedback = require('../../miniprogram/utils/feedback-person')
const person = (id, name) => ({ id, nickname: name, member_type: '次卡用户', role: '参与者', visit_needs: [{ content: '本日需求', need_tags: [{ id: 'tag', name: '沟通' }] }] })
const course = () => ({ id: 'lesson', source: 'class_record', name: '测试课', record_type: 'class', mode: '线上',
  can_confirm: true, can_withdraw: true, can_edit_notes: true, participants: [person('a', '小禾'), person('b', '阿岚')],
  feedback_people: { current_person: { name: '老师', customer_id: 'teacher' }, options: [{ name: '老师', customer_id: 'teacher' }] },
  follow_up_people: [{ id: 'teacher', nickname: '老师' }] })

function harness(name, api, extra = {}) {
  let definition
  const events = []
  const wx = { getStorageSync: () => ({}), showToast: e => events.push(e), showModal: async () => ({ confirm: true }),
    enableAlertBeforeUnload() {}, disableAlertBeforeUnload() {}, pageScrollTo() {}, navigateBack: () => events.push('back'),
    navigateTo: e => events.push(e.url), ...extra.wx }
  const app = { checkLogin: () => true, checkPagePermission: () => true, globalData: {}, ...extra.app }
  const helperMock = { ...helper, markCoursePagesDirty: () => events.push('dirty') }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages', name, 'index.js'), 'utf8'), {
    Page: p => { definition = p }, wx, getApp: () => app, console,
    require: module => module.endsWith('/customer-search') ? require('../../miniprogram/utils/customer-search')
      : module.endsWith('/api') ? { courseRosterApi: api, activityWithdrawalApi: extra.withdrawApi || {}, PAYMENT_PROJECT_TYPES: [{ key: 'online_tea', label: '线上茶疗' }] }
      : module.endsWith('/course-roster') ? helperMock
      : module.endsWith('/note-permissions') ? { noteVisibility: () => ({ customer_info: true, follow_up: true, customer_feedback: true }) }
      : module.endsWith('/feedback-person') ? feedback : assert.fail(module),
  })
  const page = { ...definition, data: structuredClone(definition.data) }
  page.setData = function(values) {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = this.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    }
  }
  return { page, events }
}
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { value } })

test('名单按服务器可见成员展示需求标签，筛选清空隐藏选择，上课确认使用当前课ID', async () => {
  const calls = []
  const data = course()
  data.participants.push({ ...person('c', '退课'), withdrawn: true })
  const { page } = harness('course-roster', { get: async () => data, notes: async () => [], confirm: async (...args) => calls.push(args) })
  page.source = 'class_record'; page.sessionId = 'lesson'
  await page.load()
  assert.equal(page.data.activeCount, 2)
  assert.equal(page.data.visiblePeople.length, 2)
  assert.equal(page.data.visiblePeople[0].tags[0].name, '沟通')
  page.onSelect(event({ id: 'a' }))
  page.onSearch(event({}, '阿岚'))
  assert.equal(page.data.selectedCount, 0)
  assert.equal(page.data.visiblePeople.length, 1)
  page.onSelect(event({ id: 'b' }))
  await page.onConfirm()
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['class_record', 'lesson', ['b']]])
})

test('只填深度需求也能保存并下一位，修改只发本人本场记录，其他同事内容保持只读', async () => {
  const writes = []
  const { page, events } = harness('course-participant-record', {
    get: async () => course(), notes: async () => [{ id: 'other', customer_id: 'a', category: 'customer_info', content: '同事内容', can_edit: false, created_by: '同事', feedback_person: '老师' }],
    saveNote: async data => { writes.push(data); return { ...data, id: 'own', can_edit: true } },
  })
  Object.assign(page, { source: 'class_record', sessionId: 'lesson', customerId: 'a' })
  await page.load()
  assert.equal(page.data.fields[0].value, '')
  assert.equal(page.data.fields[0].others[0].content, '同事内容')
  page.onInput(event({ index: 0 }, '新的深度需求'))
  await page.onSave(event({ next: true }))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].customer_id, 'a')
  assert.equal(writes[0].session_id, 'lesson')
  assert.equal(page.data.person.id, 'b')
  assert.ok(events.includes('dirty'))
})

test('跟进安排提交人员与日期，保存失败保留草稿；部分成功重试不重复提交已保存字段', async () => {
  const writes = []; let fail = true
  const { page } = harness('course-participant-record', {
    get: async () => course(), notes: async () => [],
    saveNote: async data => { writes.push(data); if (data.category === 'follow_up' && fail) throw Error('网络失败'); return { ...data, id: data.category, can_edit: true } },
  })
  Object.assign(page, { source: 'class_record', sessionId: 'lesson', customerId: 'a' })
  await page.load()
  page.onInput(event({ index: 0 }, '需求'))
  page.onInput(event({ index: 1 }, '继续沟通'))
  page.onPlanDate(event({}, '2026-10-25'))
  await page.onSave(event())
  assert.equal(page.data.person.id, 'a')
  assert.equal(page.data.fields[1].value, '继续沟通')
  assert.equal(page._dirty, true)
  fail = false
  await page.onSave(event())
  assert.equal(writes.filter(x => x.category === 'customer_info').length, 1)
  assert.equal(writes.at(-1).next_follow_up_person_id, 'teacher')
  assert.equal(writes.at(-1).next_follow_up_date, '2026-10-25')
  assert.equal(page._dirty, false)
})

test('完整资料和交易入口保留学员及草稿，只读账号不能提交', async () => {
  const { page, events } = harness('course-participant-record', { get: async () => course(), notes: async () => [], saveNote: () => assert.fail('不应写入') })
  Object.assign(page, { source: 'class_record', sessionId: 'lesson', customerId: 'a' })
  await page.load()
  page.onInput(event({ index: 0 }, '尚未保存的内容'))
  page.onProfile()
  page.data.canCreatePayment = true
  page.onPayment(event({}, 0))
  assert.ok(events.some(x => typeof x === 'string' && x.includes('customer-profile/index?id=a')))
  assert.ok(events.some(x => typeof x === 'string' && x.includes('customerId=a') && x.includes('type=online_tea')))
  assert.equal(page.data.fields[0].value, '尚未保存的内容')
  page.data.canEdit = false
  await page.onSave(event())
})

test('课程名单可以按手机尾号搜索，不改变已退课隐藏规则', async () => {
  const data = course()
  data.participants.forEach(person => { person.phone_suffix = '0017' })
  data.participants.push({ ...person('c', '已退课'), phone_suffix: '0017', withdrawn: true })
  const { page } = harness('course-roster', { get: async () => data, notes: async () => [] })
  page.source = 'class_record'; page.sessionId = 'lesson'; await page.load()
  page.onSearch(event({}, '0017'))
  assert.deepEqual(Array.from(page.data.visiblePeople, item => item.id), ['a', 'b'])
  page.onToggleWithdrawn()
  assert.deepEqual(Array.from(page.data.visiblePeople, item => item.id), ['a', 'b', 'c'])
})
