const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')

function loadTypescript(relativePath, cache = new Map()) {
  const filename = path.resolve(root, relativePath)
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  cache.set(filename, module.exports)
  const javascript = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(javascript, {
    module, exports: module.exports,
    require(request) { return loadTypescript(path.resolve(path.dirname(filename), `${request}.ts`), cache) },
  }, { filename })
  return module.exports
}

const plain = value => JSON.parse(JSON.stringify(value))

test('已生成的三端目录与唯一源一致', () => {
  execFileSync('python3', ['scripts/generate-business-catalog.py', '--check'], { cwd: root })
})

test('目录拒绝0次固定卡，避免以后默认次数被导入逻辑当成空值', () => {
  execFileSync('python3', ['-c', [
    'import importlib.util,json',
    'spec=importlib.util.spec_from_file_location("catalog","scripts/generate-business-catalog.py")',
    'module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)',
    'data=json.loads(module.SOURCE.read_text());data["membership_cards"][0]["count"]=0',
    'try: module.validate_catalog(data)',
    'except ValueError: pass',
    'else: raise AssertionError("零次固定卡应被拒绝")',
  ].join('\n')], { cwd: root })
})

test('PC和管理端新增会员卡次数、有效期一致，定制化仍由人工填写', () => {
  const pc = loadTypescript('frontend/src/lib/payment-types.ts')
  const mini = require('../../miniprogram/utils/payment-types.js')
  const source = JSON.parse(readFileSync(path.join(root, 'shared/business-catalog.json'), 'utf8'))
  assert.deepEqual(plain(pc.MEMBERSHIP_CARD_NAMES), mini.CARD_TYPES.map(item => item.key))
  for (const item of source.membership_cards) {
    const form = mini.CARD_TYPES.find(card => card.key === item.name)
    const config = pc.MEMBERSHIP_CARD_DEFAULTS[item.name]
    assert.equal(form.price, config.price)
    assert.equal(form.count || null, config.defaultCount ?? null)
    assert.equal(form.duration_value || null, config.duration_value)
  }
  assert.equal(pc.MEMBERSHIP_CARD_DEFAULTS['定制化'].defaultCount, undefined)
  assert.equal(pc.MEMBERSHIP_CARD_DEFAULTS['定制化'].duration_value, null)
})

test('后端有效期目录与PC、小程序录入有效期一致，历史课程不丢名称', () => {
  const pc = loadTypescript('frontend/src/lib/learning-course-types.ts')
  const mini = require('../../miniprogram/utils/learning-course-types.js')
  const backend = JSON.parse(execFileSync('python3', ['-c',
    'import json,sys;sys.path.insert(0,"backend");from app.utils.learning_course_types import COURSE_DURATION_MONTHS;print(json.dumps(COURSE_DURATION_MONTHS))',
  ], { cwd: root, encoding: 'utf8' }))
  assert.deepEqual(Object.keys(pc.LEARNING_PAYMENT_TYPES), mini.LEARNING_PAYMENT_TYPES.map(item => item.key))
  for (const item of mini.LEARNING_PAYMENT_TYPES) {
    assert.equal(item.duration_value, pc.LEARNING_PAYMENT_TYPES[item.key].duration_value)
    assert.equal(item.duration_value, backend[item.key])
  }
  assert.deepEqual(plain(pc.LEARNING_ACTIVITY_OPTIONS.map(item => item.value)),
    mini.LEARNING_COURSE_GROUPS.flatMap(group => group.items))
  assert.ok(Object.hasOwn(backend, '疗愈师课程：自爱力构建'))
})

test('OH及线下课程子类型在PC和小程序顺序一致', () => {
  const pc = loadTypescript('frontend/src/lib/payment-types.ts')
  const mini = require('../../miniprogram/utils/payment-types.js')
  assert.deepEqual(plain(pc.OH_READING_TYPES), mini.OH_READING_TYPES)
  assert.deepEqual(plain(pc.OFFLINE_COURSE_TYPES), mini.OFFLINE_COURSE_TYPES)
})
