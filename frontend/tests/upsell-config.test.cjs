const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/pages/upsell-config/index.tsx'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'element' },
}).outputText
const clone = value => JSON.parse(JSON.stringify(value))
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const keys = ['experience', 'conversion', 'assessment', 'upsell', 'repurchase']
// 接口契约示例；实际推荐方案的项目范围及保存往返另由后端接口测试覆盖。
const condition = products => ({ products, count_scope: 'group', count: 1, operator: 'gte' })
const defaults = [
  { key: 'experience', conditions: [condition(['coarse']), { ...condition(['class:读书会']), event_kind: 'attendance', public_welfare_only: true }] },
  { key: 'conversion', once: true, conditions: [{ ...condition(['membership:次卡', 'membership:体验会员', 'energy', 'companion_camp']), operator: 'eq' }] },
  { key: 'assessment', conditions: [condition(['oh'])] },
  { key: 'upsell', previous_stage: 'conversion', count_from: 'previous_stage', once: true, conditions: [condition(['energy'])] },
  { key: 'repurchase', previous_stage: 'upsell', count_from: 'previous_stage', conditions: [condition(['energy'])] },
]
function response(rules = keys.map(key => ({ key, conditions: [] })), configured = false) {
  return { rules: clone(rules), configured, recommended_rules: clone(defaults), activities: [{ key: 'class:读书会', label: '读书会' }], products: ['membership:次卡', 'coarse', 'membership:体验会员', 'energy', 'companion_camp', 'oh'].map(key => ({ key, label: key })) }
}
function harness(api) {
  const slots = []; let index = 0, dirty = false, effects = [], tree
  const react = {
    useState(initial) { const at = index++; if (!slots[at]) slots[at] = { value: initial }; return [slots[at].value, value => { slots[at].value = typeof value === 'function' ? value(slots[at].value) : value; dirty = true }] },
    useRef(initial) { const at = index++; if (!slots[at]) slots[at] = { current: initial }; return slots[at] },
    useEffect(fn, deps) { const at = index++; const old = slots[at]; if (!old || deps.some((d, i) => !Object.is(d, old.deps[i]))) { slots[at] = { deps }; effects.push(fn) } },
  }
  const context = { exports: {}, React: { Fragment: 'Fragment' }, structuredClone, Error, element: (type, props, ...children) => ({ type, props: props || {}, children }),
    require(name) { if (name === 'react') return react; if (name === '@/lib/api') return { upsellConfigApi: api }; return new Proxy({}, { get: (_, key) => key }) },
  }
  vm.runInNewContext(code, context)
  return { flush() { let count = 0; do { dirty = false; index = 0; tree = context.exports.default(); const pending = effects; effects = []; pending.forEach(fn => fn()); assert.ok(++count < 20) } while (dirty || effects.length); return tree } }
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...(tree.children || []).flat(Infinity).flatMap(child => nodes(child, predicate))]
}
const text = tree => typeof tree === 'string' ? tree : (tree?.children || []).flat(Infinity).map(text).join('')
const button = (tree, label) => nodes(tree, n => n.type === 'Button' && text(n) === label)[0]

test('填入完整方案、修改后再次填入、预览、保存与重新加载保持一致', async () => {
  const initial = deferred(); let stored, previewed
  const data = response()
  const api = { get: () => initial.promise, previewRules: async rules => { previewed = clone(rules); return { items: [{ journey: '大单 → 大单', classification: '升单' }] } }, saveRules: async rules => { stored = clone(rules); return response(stored, true) } }
  const h = harness(api)
  assert.equal(button(h.flush(), '填入业务方案').props.disabled, true)
  initial.resolve(data); await tick()
  let tree = h.flush()
  assert.equal(button(tree, '保存规则').props.disabled, true)
  button(tree, '填入业务方案').props.onClick(); tree = h.flush()
  assert.equal(button(tree, '保存规则').props.disabled, false)
  const count = nodes(tree, n => n.props['aria-label'] === '体验条件1购买笔数')[0]
  count.props.onChange({ target: { value: '9' } }); tree = h.flush()
  assert.equal(nodes(tree, n => n.props['aria-label'] === '体验条件1购买笔数')[0].props.value, 9)
  button(tree, '填入业务方案').props.onClick(); tree = h.flush()
  await button(tree, '查看示例').props.onClick(); tree = h.flush()
  assert.deepEqual(previewed, defaults)
  assert.deepEqual(data.recommended_rules, defaults)
  await button(tree, '保存规则').props.onClick(); tree = h.flush()
  assert.deepEqual(stored, defaults)
  assert.equal(button(tree, '保存规则').props.disabled, true)
  const loaded = harness({ ...api, get: async () => response(stored, true) }); loaded.flush(); await tick(); tree = loaded.flush()
  await button(tree, '查看示例').props.onClick()
  assert.deepEqual(previewed, stored)
})

test('填入新方案后，旧预览的迟到结果不会覆盖当前规则', async () => {
  const pending = deferred()
  const h = harness({ get: async () => response(defaults, true), previewRules: () => pending.promise })
  h.flush(); await tick(); let tree = h.flush()
  const preview = button(tree, '查看示例').props.onClick(); tree = h.flush()
  button(tree, '填入业务方案').props.onClick(); h.flush()
  pending.resolve({ items: [{ journey: '过时结果', classification: '错误' }] }); await preview
  assert.ok(!text(h.flush()).includes('过时结果'))
})

test('保存失败保留已填方案，重试成功后才显示生效', async () => {
  let fail = true, saved
  const h = harness({ get: async () => response(), saveRules: async rules => { if (fail) throw new Error('网络失败'); saved = clone(rules); return response(saved, true) } })
  h.flush(); await tick(); button(h.flush(), '填入业务方案').props.onClick()
  await button(h.flush(), '保存规则').props.onClick(); let tree = h.flush()
  assert.equal(button(tree, '保存规则').props.disabled, false)
  assert.ok(text(tree).includes('网络失败'))
  fail = false; await button(tree, '保存规则').props.onClick(); tree = h.flush()
  assert.deepEqual(saved, defaults)
  assert.ok(text(tree).includes('已保存并生效'))
})


test('实际上课条件使用课程选项，并能切换回购买条件', async () => {
  let saved
  const h = harness({ get: async () => response(), saveRules: async rules => { saved = clone(rules); return response(saved, true) } })
  h.flush(); await tick(); button(h.flush(), '填入业务方案').props.onClick(); let tree = h.flush()
  assert.ok(text(tree).includes('仅公益场次'))
  assert.equal(nodes(tree, n => n.props['aria-label'] === '体验条件2参与次数').length, 1)
  const courseSelect = nodes(tree, n => n.type === 'SelectDropdown' && n.props.placeholder === '选择实际参加的课程')[0]
  assert.deepEqual(clone(courseSelect.props.options), [{ value: 'class:读书会', label: '读书会' }])
  const source = nodes(tree, n => n.type === 'SelectDropdown' && n.props.value === 'attendance')[0]
  source.props.onChange('purchase'); tree = h.flush()
  const experience = nodes(tree, n => n.type === 'section')[0]
  const purchaseSelect = nodes(experience, n => n.type === 'SelectDropdown' && n.props.placeholder === '选择付费项目或卡种')[1]
  purchaseSelect.props.onChange(['coarse']); tree = h.flush()
  await button(tree, '保存规则').props.onClick()
  assert.equal(saved[0].conditions[1].event_kind, 'purchase')
  assert.equal(saved[0].conditions[1].public_welfare_only, false)
  assert.deepEqual(saved[0].conditions[1].products, ['coarse'])
})


test('计数起点可保存，取消前置阶段时恢复历史累计', async () => {
  let saved
  const h = harness({ get: async () => response(defaults, true), saveRules: async rules => { saved = clone(rules); return response(saved, true) } })
  h.flush(); await tick(); let tree = h.flush()
  const section = () => nodes(tree, n => n.type === 'section')[3]
  const counter = () => nodes(section(), n => n.type === 'SelectDropdown' && n.props.options.some(o => o.value === 'history'))[0]
  assert.equal(counter().props.value, 'previous_stage')
  counter().props.onChange('history'); tree = h.flush()
  await button(tree, '保存规则').props.onClick(); tree = h.flush()
  assert.equal(saved[3].count_from, 'history')
  const prerequisite = nodes(section(), n => n.type === 'SelectDropdown' && n.props.value === 'conversion')[0]
  prerequisite.props.onChange(''); tree = h.flush()
  assert.equal(counter(), undefined)
  await button(tree, '保存规则').props.onClick(); tree = h.flush()
  assert.equal(saved[3].previous_stage, '')
  assert.equal(saved[3].count_from, 'history')
  nodes(section(), n => n.type === 'SelectDropdown' && n.props.value === '')[0].props.onChange('conversion'); tree = h.flush()
  assert.equal(counter().props.value, 'previous_stage')
})

test('旧配置冲突会提示，填入方案并成功保存后清除提示', async () => {
  const h = harness({ get: async () => ({ ...response(defaults, true), warnings: ['转化与升单条件可能重叠'] }), saveRules: async rules => response(rules, true) })
  h.flush(); await tick(); let tree = h.flush()
  assert.ok(text(tree).includes('已保存规则需调整：转化与升单条件可能重叠'))
  button(tree, '填入业务方案').props.onClick(); tree = h.flush()
  await button(tree, '保存规则').props.onClick(); tree = h.flush()
  assert.ok(!text(tree).includes('已保存规则需调整'))
})


test('新增课程类型可选择保存，使用编号而非显示名称', async () => {
  let saved
  const data = response(defaults, true)
  data.activities.push({ key: 'class:type-new', label: '新课程名称' })
  const h = harness({ get: async () => data, saveRules: async rules => { saved = clone(rules); return response(saved, true) } })
  h.flush(); await tick(); let tree = h.flush()
  const select = nodes(tree, n => n.type === 'SelectDropdown' && n.props.placeholder === '选择实际参加的课程')[0]
  assert.ok(select.props.options.some(o => o.value === 'class:type-new' && o.label === '新课程名称'))
  select.props.onChange(['class:type-new']); tree = h.flush()
  await button(tree, '保存规则').props.onClick()
  assert.deepEqual(saved[0].conditions[1].products, ['class:type-new'])
})

test('默认读书会缺失时，填入方案明确提示补选课程', async () => {
  const data = response()
  data.recommended_warnings = ['未找到读书会课程类型，请补选课程类型。']
  const h = harness({ get: async () => data })
  h.flush(); await tick(); button(h.flush(), '填入业务方案').props.onClick()
  assert.ok(text(h.flush()).includes('未找到读书会课程类型，请补选课程类型。'))
})
