const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const miniNames = require(path.join(root, 'miniprogram/utils/customer-referrers.js')).customerReferrers
const pc = {}
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'frontend/src/lib/customer-referrers.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: pc })

test('PC 和小程序多人关系去重、清空与旧单人昵称兼容一致', () => {
  for (const read of [pc.customerReferrers, miniNames]) {
    assert.deepEqual(Array.from(read({ referrer: '甲、乙' })), ['甲、乙'])
    assert.deepEqual(Array.from(read({ referrer: '旧值', referrers: [' 甲 ', '乙', '甲'] })), ['甲', '乙'])
    assert.deepEqual(Array.from(read({ referrer: '旧值', referrers: [] })), [])
  }
})

test('小程序引流人连续多选不关窗，可取消单人并保存完整数组，承接人仍单选', async () => {
  let page
  const writes = []
  const file = path.join(root, 'miniprogram/pages/customer-form/index.js')
  vm.runInNewContext(readFileSync(file, 'utf8'), { Page(value) { page = value },
    wx: { showToast() {}, navigateBack() {} }, getCurrentPages: () => [],
    require(name) {
      if (name === '../../utils/api') return { customerApi: { create: async data => { writes.push(data); return { id: 'saved' } } } }
      return require(path.resolve(path.dirname(file), name))
    },
  })
  page.data = structuredClone(page.data)
  page.setData = update => Object.assign(page.data, update)
  page.data.nickname = '客户'
  page.data.allCustomers = [{ id: 'a', nickname: '甲' }, { id: 'b', nickname: '乙' }]
  const event = values => ({ currentTarget: { dataset: values } })
  page.onPickerOpen(event({ field: 'referrer' }))
  page.onPickerSelect(event({ nickname: '甲' }))
  page.onPickerSelect(event({ nickname: '乙' }))
  assert.equal(page.data.showPicker, true)
  assert.equal(page.data.referrer, '甲、乙')
  assert.ok(page.data.pickerList.every(item => item.selected))
  await page.onSubmit()
  assert.deepEqual(Array.from(writes[0].referrers), ['甲', '乙'])
  page.onPickerSearch({ detail: { value: '没有匹配结果' } })
  page.onRemoveReferrer(event({ nickname: '甲' }))
  assert.deepEqual(Array.from(page.data.referrers), ['乙'])
  assert.equal(page.data.pickerList.length, 0)
  assert.equal(page.data.pickerKeyword, '没有匹配结果')
  assert.equal(page.data.showPicker, true)
  page.onPickerClear(event({ field: 'referrer' }))
  await page.onSubmit()
  assert.deepEqual(Array.from(writes[1].referrers), [])
  page.onPickerOpen(event({ field: 'referrer_handler' }))
  page.onPickerSelect(event({ nickname: '甲' }))
  assert.equal(page.data.referrer_handler, '甲')
  assert.equal(page.data.showPicker, false)
  page.data.allCustomers = Array.from({ length: 1050 }, (_, index) => ({ id: `p${index}`, nickname: `人员${index}`, name: `姓名${index}` }))
  page.onPickerOpen(event({ field: 'referrer' }))
  page.onPickerSearch({ detail: { value: '人员1049' } })
  assert.equal(page.data.pickerList.length, 1)
  assert.equal(page.data.pickerList[0].nickname, '人员1049')
  page.onPickerSearch({ detail: { value: '姓名1049' } })
  assert.equal(page.data.pickerList[0].nickname, '人员1049')
})

function compactPicker(searchable = true) {
  const exported = {}, states = []
  let stateIndex = 0
  const props = { customers: Array.from({ length: 1050 }, (_, index) => ({ id: `p${index}`, nickname: `人员${index}`, name: `姓名${index}` })),
    multi: true, compactMulti: true, compactSearch: searchable, value: ['已有引流人'], onChange(value) { props.value = value } }
  vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'frontend/src/components/customer-search-input.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: exported, document: { body: {} }, requestAnimationFrame: fn => fn(), require(name) {
    if (name === '@/lib/customer-search') { const result = {}; vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'frontend/src/lib/customer-search.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: result }); return result }
    if (name === 'react') return { useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] },
      useRef: () => ({ current: null }), useMemo: fn => fn(), useCallback: fn => fn, useEffect() {} }
    if (name === 'react-dom') return { createPortal: child => child }
    if (name === 'lucide-react') return { Check: 'check', X: 'clear' }
    if (name === '@/components/ui/input') return { Input: 'input' }
    if (name === '@/components/member-labels') {
      const labels = {}
      vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'frontend/src/components/member-labels.tsx'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText, { exports: labels, require })
      return labels
    }
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

test('PC 多选输入手机尾号保留同尾号候选，选择后仍保存昵称', () => {
  const view = compactPicker()
  view.props.customers = [{ id: 'a', nickname: '甲', name: '', phone_suffix: '0017', phone_masked: '138****0017' },
    { id: 'b', nickname: '乙', name: '', phone_suffix: '0017', phone_masked: '137****0017' }, { id: 'c', nickname: '丙', phone_suffix: '1799' }]
  const input = view.nodes(view.render(), node => node.type === 'input')[0]
  input.props.onChange({ target: { value: '17' } })
  const options = view.nodes(view.render(), node => node.type === 'button' && node.props['aria-pressed'] !== undefined)
  assert.deepEqual(options.map(node => node.props.title), ['甲', '乙'])
  assert.equal(view.nodes(options[0], node => node.type === 'span' && node.props.children === '138****0017').length, 1)
  assert.equal(view.nodes(options[1], node => node.type === 'span' && node.props.children === '137****0017').length, 1)
  assert.ok(!JSON.stringify(options).includes('13855550017'))
  options[0].props.onClick()
  assert.deepEqual(Array.from(view.props.value), ['已有引流人', '甲'])
})
