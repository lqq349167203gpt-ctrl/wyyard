const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const moduleContext = { exports: {} }
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/lib/payment-status.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, moduleContext)
const pcStatus = moduleContext.exports.getPaymentStatus
const miniContext = { require: () => ({ PAYMENT_PROJECT_TYPES: [] }) }
const miniSource = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/payment/index.js'), 'utf8')
vm.runInNewContext(miniSource.slice(0, miniSource.indexOf('function formatDuration')), miniContext)
const today = new Date().toLocaleDateString('sv-SE')

for (const [platform, getStatus] of [
  ['PC', item => pcStatus(item, today)],
  ['小程序', item => miniContext.calcStatus(item, item.type, item.expiry_date).text],
]) {
  test(`${platform}：次数归零优先显示已用完，含日期已过期的记录`, () => {
    for (const type of ['membership_card', 'group_case', 'emotional_release', 'energy_knot', 'other']) {
      assert.equal(getStatus({ type, effective_remaining: 0, remaining_count: 3, expiry_date: '2000-01-01' }), '已用完')
      assert.equal(getStatus({ type, remaining_count: 0, expiry_date: '2999-01-01' }), '已用完')
    }
  })

  test(`${platform}：不限次和次数未知不误判，仍有次数的到期项目显示已过期`, () => {
    assert.equal(getStatus({ type: 'membership_card', effective_remaining: null, remaining_count: 0, expiry_date: '2999-01-01' }), '生效中')
    assert.equal(getStatus({ type: 'other', remaining_count: null, expiry_date: '2999-01-01' }), '生效中')
    assert.equal(getStatus({ type: 'group_case', effective_remaining: 2, expiry_date: '2000-01-01' }), '已过期')
    assert.equal(getStatus({ type: 'energy_knot', expiry_date: '2999-01-01' }), '生效中')
  })

  test(`${platform}：按有效期或单次结算的项目不套用次数状态`, () => {
    for (const type of ['online_tea', 'offline_course', 'internal_course']) {
      assert.equal(getStatus({ type, remaining_count: 0, expiry_date: '2999-01-01' }), '生效中')
      assert.equal(getStatus({ type, remaining_count: 0, effective_date: '2999-01-01' }), '未开始')
    }
    for (const type of ['oh_card_reading', 'tea_seat_fee']) {
      assert.equal(getStatus({ type, remaining_count: 0 }), '已完结')
    }
  })
}
