const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const keys = ['visit_need_tags', 'visit_need_detail', 'customer_info', 'follow_up', 'customer_feedback']
const source = readFileSync(path.join(__dirname, '../src/lib/note-permissions.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const pc = { exports: {} }
vm.runInNewContext(compiled, { exports: pc.exports })
const mini = { exports: {} }
vm.runInNewContext(readFileSync(path.join(__dirname, '../../miniprogram/utils/note-permissions.js'), 'utf8'), { module: mini })

test('PC 与小程序五项显示权限逐项一致，允许只看标签或只看详情', () => {
  for (const key of keys) {
    const access = { detail_tabs: Object.fromEntries(keys.map(item => [item, item === key])) }
    const visibility = mini.exports.noteVisibility(access)
    assert.equal(visibility.any, true)
    for (const item of keys) assert.equal(pc.exports.canViewNotePart(access, item), visibility[item])
    for (const category of ['visit_need', 'customer_info', 'follow_up', 'customer_feedback']) {
      assert.equal(pc.exports.canViewNote(access, category), visibility[category])
    }
    assert.equal(visibility.visit_need, ['visit_need_tags', 'visit_need_detail'].includes(key))
  }
})

test('旧查看权限兼容、明确关闭不会被总开关重新打开', () => {
  const legacy = { detail_tabs: { follow_up: true } }
  assert.equal(pc.exports.canViewAnyNote(legacy), true)
  assert.equal(mini.exports.noteVisibility(legacy).visit_need_tags, true)
  const denied = { detail_tabs: Object.fromEntries(keys.map(key => [key, false])) }
  assert.equal(pc.exports.canViewAnyNote(denied), false)
  assert.equal(mini.exports.noteVisibility(denied).any, false)
})
