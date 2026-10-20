const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const actor = { id: 'me', owner: '本人' }
const own = { id: 'own', created_by_id: 'me', created_by: '本人', author: '代填的反馈人', content: '填错了', at: '' }
const other = { id: 'other', created_by_id: 'them', created_by: '别人', author: '本人', content: '别人的记录', at: '' }

function pcFunction(name, bindings) {
  const source = ts.createSourceFile('page.tsx', readFileSync(path.join(root, 'frontend/src/pages/service-teachers/index.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let target
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) target = node
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) target = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(target, name)
  const code = ts.transpileModule(`result = (${target.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const context = { ...bindings, result: null }
  vm.runInNewContext(code, context)
  return context.result
}

test('PC 清空本人记录只更新当前备注，保留第三页和他人记录，不触发整表重载', async () => {
  const isOwn = pcFunction('isOwnParticipantNote', { localStorage: { getItem: () => JSON.stringify(actor) } })
  assert.equal(isOwn(own), true)
  assert.equal(isOwn(other), false) // 不能按反馈人姓名误判创建人。
  const apply = pcFunction('applySavedParticipantNote', { isOwnParticipantNote: isOwn })
  let groups = [{ course_id: 'course', participants: [{ visit_id: 'visit', customer_info_entries: [own, other] }] }]
  let closed = false, reloads = 0
  const save = pcFunction('saveParticipantNote', {
    participantEditing: { row: groups[0].participants[0], field: 'customer_info' },
    participantEditorLoading: false, participantEditorReadFailed: false, participantDraft: '  ', participantMyNoteId: 'own',
    participantFeedbackPeople: [], participantFeedbackPerson: '', participantPage: 3,
    customerFollowUpApi: { update: async (id, content) => { assert.equal(id, 'own'); assert.equal(content, ''); return { id, deleted: true } } },
    setParticipantSaving() {}, setParticipantEditorError(error) { if (error) assert.fail(error) },
    setParticipantEditing(value) { closed = value === null },
    setParticipantGroups(update) { groups = update(groups) }, applySavedParticipantNote: apply,
    loadParticipants() { reloads++ },
  })
  await save()
  assert.equal(closed, true)
  assert.equal(reloads, 0)
  assert.equal(groups[0].participants[0].customer_info_entries.length, 1)
  assert.equal(groups[0].participants[0].customer_info_entries[0].id, 'other')
})

function miniHarness(api, activityApi = {}) {
  const file = path.join(root, 'miniprogram/utils/service-teacher-records.js')
  const context = { module: { exports: {} }, require(name) {
    if (name === './api') return { customerFollowUpApi: api, activityParticipantNoteApi: activityApi, serviceTeacherApi: {} }
    return require(path.resolve(path.dirname(file), name))
  }, getApp: () => ({ globalData: { currentUser: actor } }), wx: { showToast() {} }, console }
  vm.runInNewContext(readFileSync(file, 'utf8'), context)
  const page = context.module.exports('courses')
  page.data = structuredClone(page.data)
  page.setData = function(values) {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let current = this.data
      for (const part of parts.slice(0, -1)) current = current[part]
      current[parts.at(-1)] = value
    }
  }
  return page
}

test('小程序清空后保留已加载分页，填写入口与他人内容按创建人分开', async () => {
  const page = miniHarness({ update: async () => ({ id: 'own', deleted: true }) })
  const row = { visit_id: 'visit', customer_info_entries: [own, other] }
  const formatted = page.formatParticipant(row)
  assert.equal(formatted.customer_info_mine[0].id, 'own')
  assert.equal(formatted.customer_info_others[0].id, 'other')
  page.data.participantGroups = Array.from({ length: 30 }, (_, i) => ({ participants: [i === 25 ? row : { visit_id: 'v' + i }] }))
  Object.assign(page.data, { participantPage: 3, participantMyNoteId: 'own', participantDraft: '',
    participantEditing: { visitId: 'visit', field: 'customer_info', groupIndex: 25, index: 0 }, feedbackOptions: [], feedbackIndex: 0 })
  page.loadParticipants = () => assert.fail('保存不应重置分页或整表重载')
  await page.saveParticipantEdit()
  assert.equal(page.data.participantPage, 3)
  assert.equal(page.data.participantGroups.length, 30)
  const saved = page.data.participantGroups[25].participants[0]
  assert.equal(saved.customer_info_mine.length, 0)
  assert.equal(saved.customer_info_others[0].id, 'other')
  assert.equal(page.data.participantEditing, null)
})

test('课程记录参与人没有邀约时也能填写客户反馈', async () => {
  const writes = []
  const page = miniHarness({
    feedbackPeople: async () => ({ current_person: { name: '本人', customer_id: '' }, options: [{ name: '本人', customer_id: '' }] }),
  }, {
    list: async () => [],
    save: async payload => {
      writes.push(payload)
      return { id: 'course-note', ...payload, created_by_id: 'me', created_by: '本人', updated_at: '' }
    },
  })
  page.data.participantGroups = [{ participants: [{ visit_id: '', course_id: 'course', activity_type: 'class',
    course_date: '2026-10-20', customer_id: 'customer', nickname: '小安', customer_feedback_entries: [] }] }]
  await page.onParticipantOpenEdit({ currentTarget: { dataset: { group: 0, index: 0, field: 'customer_feedback' } } })
  assert.equal(page.data.participantEditing.activitySource, 'class_record')
  page.setData({ participantDraft: '愿意再次参加' })
  await page.saveParticipantEdit()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].customer_id, 'customer')
  assert.equal(writes[0].feedback_person, '本人')
  assert.equal(page.data.participantGroups[0].participants[0].customer_feedback_mine[0].content, '愿意再次参加')
})

test('小程序来访需求支持只选标签，跟进点提交完整安排，空白新记录无需造一条空数据', async () => {
  const writes = []
  const page = miniHarness({ create: async (...args) => { writes.push(args); return { id: 'new', content: args[2], created_by_id: 'me', need_tags: [], updated_at: '' } } })
  Object.assign(page.data, { participantGroups: [], participantEditing: { visitId: 'v', field: 'visit_need' }, participantDraft: '',
    participantNeedTagIds: ['tag'], feedbackOptions: [], feedbackIndex: 0 })
  await page.saveParticipantEdit()
  assert.deepEqual(Array.from(writes[0][3].need_tag_ids), ['tag'])
  Object.assign(page.data, { participantEditing: { visitId: 'v', field: 'follow_up' }, participantDraft: '联系',
    participantPlan: { next_follow_up_person_id: 'p', next_follow_up_person: '老师', next_follow_up_date: '2026-11-01' } })
  await page.saveParticipantEdit()
  assert.equal(writes[1][3].next_follow_up_date, '2026-11-01')
  Object.assign(page.data, { participantEditing: { visitId: 'v', field: 'customer_info' }, participantDraft: '' })
  await page.saveParticipantEdit()
  assert.equal(writes.length, 2)
  assert.equal(page.data.participantEditing, null)
})
