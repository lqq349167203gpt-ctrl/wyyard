const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '../..')

function setup(notes = []) {
  let component
  const writes = []
  const api = {
    list: async () => notes,
    create: async data => writes.push({ action: 'create', ...data }),
    update: async (id, content, data) => writes.push({ action: 'update', id, content, ...data }),
    delete: async id => writes.push({ action: 'delete', id }),
  }
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/components/visit-note-section/index.js'), 'utf8'), {
    Component(value) { component = value }, wx: { showToast() {} },
    require(name) {
      if (name === '../../utils/customer-search') return require(path.join(root, 'miniprogram/utils/customer-search.js'))
      if (name === '../../utils/api') return { visitNoteApi: api, customerTagApi: { list: async () => [{ id: 'a', name: '关系' }, { id: 'b', name: '工作' }] } }
      if (name === '../../utils/feedback-person') return { attributionFromPicker: () => ({ feedback_person: '甲' }) }
      if (name === '../../utils/read-scope') return require(path.join(root, 'miniprogram/utils/read-scope.js'))
      if (name === '../../utils/note-feedback-meta') return { formatNoteTime: () => '' }
      if (name === '../../utils/note-permissions') return require(path.join(root, 'miniprogram/utils/note-permissions.js'))
      throw new Error(name)
    },
  })
  const instance = { ...component.methods, properties: { visitId: 'v', category: 'visit_need', readOnly: false },
    data: JSON.parse(JSON.stringify(component.data)), setData(update) { Object.assign(this.data, update) }, loadNotes: async () => {} }
  instance.data.editorOpen = true
  return { instance, writes, loadNotes: component.methods.loadNotes }
}

test('来访需求可多选后只保存标签，编辑可以减少或清空标签', async () => {
  const { instance, writes } = setup()
  await instance.loadNeedTags()
  instance.onToggleNeedTag({ currentTarget: { dataset: { id: 'a' } } })
  instance.onToggleNeedTag({ currentTarget: { dataset: { id: 'b' } } })
  await instance.onSubmit()
  assert.equal(writes[0].action, 'create')
  assert.deepEqual(Array.from(writes[0].need_tag_ids), ['a', 'b'])
  assert.equal(writes[0].content, '')
  instance.data.myNote = { id: 'note' }
  instance.onToggleNeedTag({ currentTarget: { dataset: { id: 'a' } } })
  await instance.onSubmit()
  assert.deepEqual(Array.from(writes[1].need_tag_ids), ['b'])
  instance.onToggleNeedTag({ currentTarget: { dataset: { id: 'b' } } })
  await instance.onSubmit()
  assert.equal(writes[2].action, 'delete')
  assert.equal(writes[2].id, 'note')
})

test('停用需求标签的历史选项仍回显，只读模式禁止保存', async () => {
  const { instance, writes } = setup()
  instance.data.myNote = { id: 'note', need_tags: [{ id: 'old', name: '历史需求' }] }
  instance.data.needTagIds = ['old']
  await instance.loadNeedTags()
  assert.equal(instance.data.needTagOptions.find(tag => tag.id === 'old').selected, true)
  instance.properties.readOnly = true
  await instance.onSubmit()
  assert.equal(writes.length, 0)
})

test('小程序读取本人和他人需求时保留独立标签，正文不混入标签名称', async () => {
  const notes = [
    { id: 'mine', category: 'visit_need', created_by_id: 'me', can_edit: true, content: '具体情况', need_tags: [{ id: 'a', name: '关系' }] },
    { id: 'other', category: 'visit_need', created_by_id: 'other', content: '', need_tags: [{ id: 'b', name: '工作' }] },
  ]
  const { instance, loadNotes } = setup(notes)
  await loadNotes.call(instance)
  assert.equal(instance.data.myNote.content, '具体情况')
  assert.equal(instance.data.myNote.need_tags[0].name, '关系')
  assert.equal(instance.data.otherNotes[0].content, '')
  assert.equal(instance.data.otherNotes[0].need_tags[0].name, '工作')
})

function renderCell({ tags = true, detail = true, expanded = true, content = '具体情况' } = {}) {
  const exports = {}
  const source = readFileSync(path.join(root, 'frontend/src/components/visits/visit-note-cell.tsx'), 'utf8')
  const wrapper = ({ children, render }) => render || children || null
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name) {
    if (name === 'react') return { useMemo: fn => fn(), useRef: current => ({ current }), useState: initial => [initial, () => {}] }
    if (name === 'react/jsx-runtime') return require(name)
    if (name === '@/hooks/use-edit-permissions') return { useEditPermissions: () => ({ customer_access: { tags, detail } }) }
    if (name === '@/lib/note-permissions') return { canViewNote: () => tags || detail,
      canViewNotePart: (access, key) => key === 'visit_need_tags' ? access.tags : access.detail }
    if (name === '@/components/visits/feedback-person-select') return { currentFeedbackPersonName: () => '本人', FeedbackPersonSelect: () => React.createElement('input', { 'aria-label': '反馈人' }) }
    if (name === '@/lib/note-time') return { formatNoteTime: () => '' }
    return new Proxy({}, { get: () => wrapper })
  } })
  return renderToStaticMarkup(exports.VisitNoteCell({ visitId: 'v', nickname: '客户', title: '来访需求', category: 'visit_need', expanded,
    notes: [{ id: 'note', category: 'visit_need', content, need_tags: [{ id: 'a', name: '关系' }], created_by: '别人' }], onNotesChange() {} }))
}

test('PC 缩略、展开和详情均把标签与正文分开渲染，选择区位于反馈人下方', () => {
  for (const expanded of [false, true]) {
    const html = renderCell({ expanded })
    assert.match(html, /<span[^>]*title="关系"[^>]*>关系<\/span>/)
    assert.ok(html.includes('具体情况'))
    assert.ok(html.indexOf('aria-label="反馈人"') < html.indexOf('来访标签'))
  }
  assert.match(renderCell({ content: '' }), /title="关系"/)
})

test('PC 标签与正文分别遵从查看权限', () => {
  assert.ok(!renderCell({ tags: false }).includes('关系'))
  assert.ok(!renderCell({ detail: false }).includes('具体情况'))
  assert.equal(renderCell({ tags: false, detail: false }), '')
})

test('小程序邀约卡片分离需求标签与正文，并遵从独立查看权限', () => {
  let component
  let visibility = { visit_need_tags: true, visit_need_detail: true }
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/components/visit-card/index.js'), 'utf8'), {
    Component(value) { component = value }, require() { return { noteVisibility: () => visibility } },
  })
  const instance = { data: {}, setData(update) { Object.assign(this.data, update) } }
  const visit = { visit_need_entries: [{ id: 'n', feedback_person: '甲', content: '详情', need_tags: [{ id: 'a', name: '关系' }] }] }
  component.observers.visit.call(instance, visit)
  assert.equal(instance.data.needEntries[0].tags[0].name, '关系')
  assert.equal(instance.data.needEntries[0].content, '详情')
  visibility = { visit_need_tags: false, visit_need_detail: true }
  component.observers.visit.call(instance, visit)
  assert.equal(instance.data.needEntries[0].tags.length, 0)
  visibility = { visit_need_tags: true, visit_need_detail: false }
  component.observers.visit.call(instance, visit)
  assert.equal(instance.data.needEntries[0].content, '')
  component.observers.visit.call(instance, {})
  assert.equal(instance.data.hasStructuredNeeds, false)
})
