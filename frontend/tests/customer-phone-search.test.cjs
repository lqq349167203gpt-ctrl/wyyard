const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const mini = require(path.join(root, 'miniprogram/utils/customer-search'))
const pc = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'frontend/src/lib/customer-search.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: pc })
for (const [query, expected] of [['0017', true], ['17', true], [' 0017 ', true], ['138', false], ['5555', false],
  ['55550017', false], ['ALICE', true], ['小林', true], ['其他人', false], ['', true], ['0017x', false]]) {
  test(`PC 与小程序手机尾号、昵称和姓名一致匹配：${JSON.stringify(query)}`, () => {
    for (const helper of [pc, mini]) {
      assert.equal(helper.matchesCustomerSearch({ nickname: 'Alice', name: '小林', phone: '+86 138-5555-0017' }, query), expected)
      assert.equal(helper.matchesCustomerSearch({ nickname: 'Alice', name: '小林', phone_suffix: '0017' }, query), expected)
    }
  })
}
test('同一尾号保留全部候选人，不将手机号中段、空手机号误匹配', () => {
  const people = [{ id: 'a', nickname: '甲', phone_suffix: '0017' }, { id: 'b', nickname: '乙', phone_suffix: '0017' },
    { id: 'middle', nickname: '丙', phone: '13800179999' }, { id: 'empty', nickname: '无手机' }]
  for (const helper of [pc, mini]) {
    assert.deepEqual(people.filter(person => helper.matchesCustomerSearch(person, '0017')).map(p => p.id), ['a', 'b'])
    assert.equal(helper.customerPhoneSuffix({ phone_suffix: '0017' }), '0017')
  }
})

test('候选号码展示隐藏中间四位，旧尾号数据不伪造前三位', () => {
  const cases = [
    [{ phone: '13855550017' }, '138****0017'],
    [{ phone: '+86 138-5555-0017' }, '138****0017'],
    [{ phone_masked: '138****0017' }, '138****0017'],
    [{ phone_masked: '13855550017' }, '138****0017'],
    [{ phone_suffix: '0017' }, '****0017'], [{}, ''], [{ phone: '12' }, '**'],
  ]
  for (const helper of [pc, mini]) for (const [person, expected] of cases) {
    assert.equal(helper.customerMaskedPhone(person), expected)
  }
})
