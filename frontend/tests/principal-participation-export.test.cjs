const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function render(state = {}, busy = false, disabled = false) {
  let exported = 0
  const module = { exports: {} }
  const source = readFileSync(path.join(__dirname, '../src/pages/principal/member-participation-list.tsx'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(js, { exports: module.exports, require(name) {
    if (name === 'react') return { useState: () => [{ key: '', ids: new Set() }, () => {}] }
    if (name === '@/hooks/use-server-pagination') return { useServerPagination: () => ({ paginatedItems: [], totalItems: 0, ...state }) }
    if (name === '@/lib/api') return { principalApi: {} }
    if (name.startsWith('@/components/')) return { EmptyValue: 'empty', PaginationBar: 'pagination' }
    return require(name)
  } })
  const tree = module.exports.MemberParticipationList({ query: {}, period: '本月', showOwners: true,
    onOpenCustomer() {}, onExport() { exported++ }, busy, exportDisabled: disabled })
  const buttons = []
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (node.type === 'button') buttons.push(node)
    walk(node.props?.children)
  }
  walk(tree)
  return { buttons, exported: () => exported }
}

test('活动参与列表有可点击的导出入口，并在加载、失败或导出期间禁用', () => {
  const view = render()
  assert.equal(view.buttons.length, 1)
  assert.equal(view.buttons[0].props.disabled, false)
  view.buttons[0].props.onClick()
  assert.equal(view.exported(), 1)
  for (const state of [{ loading: true }, { error: '读取失败' }]) {
    assert.equal(render(state).buttons[0].props.disabled, true)
  }
  assert.equal(render({}, true, true).buttons[0].props.disabled, true)
})
