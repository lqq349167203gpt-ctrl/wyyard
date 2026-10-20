const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const pc = {}
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'frontend/src/lib/customer-referrers.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: pc })

test('PC 多人关系去重、清空与旧单人昵称兼容', () => {
  const read = pc.customerReferrers
  assert.deepEqual(Array.from(read({ referrer: '甲、乙' })), ['甲、乙'])
  assert.deepEqual(Array.from(read({ referrer: '旧值', referrers: [' 甲 ', '乙', '甲'] })), ['甲', '乙'])
  assert.deepEqual(Array.from(read({ referrer: '旧值', referrers: [] })), [])
})

function compactPicker(searchable = true) {
  const exported = {}, states = []
  let stateIndex = 0
  const props = { customers: Array.from({ length: 1050 }, (_, index) => ({ id: `p${index}`, nickname: `人员${index}`, name: `姓名${index}` })),
    multi: true, compactMulti: true, compactSearch: searchable, value: ['已有引流人'], onChange(value) { props.value = value } }
  vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'frontend/src/components/customer-search-input.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: exported, document: { body: {} }, requestAnimationFrame: fn => fn(), require(name) {
    if (name === 'react') return { useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] },
      useRef: () => ({ current: null }), useMemo: fn => fn(), useCallback: fn => fn, useEffect() {} }
    if (name === 'react-dom') return { createPortal: child => child }
    if (name === 'lucide-react') return { Check: 'check', X: 'clear' }
    if (name === '@/components/ui/input') return { Input: 'input' }
    return require(name)
  } })
  const render = () => { stateIndex = 0; return exported.CustomerSearchInput(props) }
  function nodes(tree, predicate) {
    const found = []
    function walk(node) {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(walk)
      if (predicate(node)) found.push(node)
      walk(node.props?.children)
    }
    walk(tree)
    return found
  }
  nodes(render(), node => node.type === 'div' && node.props.onClick)[0].props.onClick()
  return { render, nodes, props }
}

test('PC 多选搜索覆盖千人目录末尾，姓名和昵称均可搜到，选择不清除已有人员', () => {
  const view = compactPicker()
  const input = () => view.nodes(view.render(), node => node.type === 'input')[0]
  assert.equal(view.nodes(view.render(), node => node.type === 'button' && node.props['aria-pressed'] !== undefined).length, 50)
  input().props.onChange({ target: { value: '人员1049' } })
  let options = view.nodes(view.render(), node => node.type === 'button' && node.props['aria-pressed'] !== undefined)
  assert.equal(options.length, 1)
  assert.equal(options[0].props.title, '人员1049')
  options[0].props.onClick()
  assert.deepEqual(Array.from(view.props.value), ['已有引流人', '人员1049'])
  input().props.onChange({ target: { value: '姓名1049' } })
  options = view.nodes(view.render(), node => node.type === 'button' && node.props['aria-pressed'] !== undefined)
  assert.equal(options[0].props['aria-pressed'], true)
  options[0].props.onClick()
  assert.deepEqual(Array.from(view.props.value), ['已有引流人'])
  input().props.onChange({ target: { value: '不存在的人员' } })
  assert.equal(view.nodes(view.render(), node => node.type === 'button' && node.props['aria-pressed'] !== undefined).length, 0)
  assert.deepEqual(Array.from(view.props.value), ['已有引流人'])
})

test('未启用搜索的既有紧凑多选保持原行为', () => {
  const view = compactPicker(false)
  assert.equal(view.nodes(view.render(), node => node.type === 'input').length, 0)
  assert.equal(view.nodes(view.render(), node => node.type === 'button').length, 50)
})

test('PC 顶部显示全部已选人员，搜索无匹配时仍可直接取消且不关闭弹层', () => {
  const view = compactPicker()
  view.props.value = ['已有引流人', '目录外的历史引流人']
  const groups = view.nodes(view.render(), node => node.props?.['aria-label'] === '已选人员')
  assert.equal(groups.length, 1)
  assert.equal(view.nodes(groups[0], node => node.type === 'button').length, 2)
  const input = view.nodes(view.render(), node => node.type === 'input')[0]
  input.props.onChange({ target: { value: '没有匹配结果' } })
  const remove = view.nodes(view.render(), node => node.props?.['aria-label'] === '取消选择目录外的历史引流人')[0]
  remove.props.onClick()
  assert.deepEqual(Array.from(view.props.value), ['已有引流人'])
  assert.equal(view.nodes(view.render(), node => node.type === 'input')[0].props.value, '没有匹配结果')
  view.nodes(view.render(), node => node.props?.['aria-label'] === '取消选择已有引流人')[0].props.onClick()
  assert.deepEqual(Array.from(view.props.value), [])
  assert.equal(view.nodes(view.render(), node => node.props?.['aria-label'] === '已选人员').length, 0)
})
