const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../..')

function setup() {
  let component
  const writes = []
  const api = {
    create: async data => writes.push({ action: 'create', ...data }),
    update: async (id, content, data) => writes.push({ action: 'update', id, content, ...data }),
    delete: async id => writes.push({ action: 'delete', id }),
  }
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/components/visit-note-section/index.js'), 'utf8'), {
    Component(value) { component = value }, wx: { showToast() {} },
    require(name) {
      if (name === '../../utils/api') return { visitNoteApi: api, customerTagApi: { list: async () => [{ id: 'a', name: '关系' }, { id: 'b', name: '工作' }] } }
      if (name === '../../utils/feedback-person') return { attributionFromPicker: () => ({ feedback_person: '甲' }) }
      if (name === '../../utils/read-scope') return require(path.join(root, 'miniprogram/utils/read-scope.js'))
      if (name === '../../utils/note-feedback-meta') return { formatNoteTime: () => '' }
      throw new Error(name)
    },
  })
  const instance = { ...component.methods, properties: { visitId: 'v', category: 'visit_need', readOnly: false },
    data: JSON.parse(JSON.stringify(component.data)), setData(update) { Object.assign(this.data, update) }, loadNotes: async () => {} }
  instance.data.editorOpen = true
  return { instance, writes }
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
