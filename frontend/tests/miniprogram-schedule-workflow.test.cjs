const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

function setup(route, allowed = true) {
  const calls = [], app = { globalData: {}, checkPagePermission: () => allowed }
  const context = { module: { exports: {} }, getApp: () => app, getCurrentPages: () => [{ route }],
    wx: { switchTab: e => calls.push(e.url), setNavigationBarTitle: e => calls.push(e.title), pageScrollTo() {} } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/schedule-workflow.js'), 'utf8'), context)
  const page = { data: { courseMode: 'schedule' }, setData(values) { Object.assign(this.data, values) } }
  return { ...context.module.exports, page, app, calls }
}

test('邀约进入完课传递模式，课表接收后消费一次，不修改日期或业务记录', () => {
  const h = setup('pages/visits/index')
  h.onWorkflowTap.call(h.page, { currentTarget: { dataset: { action: 'completion' } } })
  assert.equal(h.calls[0], '/pages/activities/index')
  assert.equal(h.app.globalData._courseWorkflowMode, 'completion')
  h.applyCourseWorkflow.call(h.page)
  assert.equal(h.page.data.courseMode, 'completion')
  assert.equal(h.app.globalData._courseWorkflowMode, undefined)
  assert.equal(h.calls.at(-1), '完课')
})

test('同一课表切换排课和完课，无需重新导航；没有目标权限时不跳转', () => {
  const h = setup('pages/activities/index')
  for (const action of ['completion', 'schedule']) {
    h.onWorkflowTap.call(h.page, { currentTarget: { dataset: { action } } })
    assert.equal(h.page.data.courseMode, action)
  }
  assert.deepEqual(h.calls, ['完课', '课表'])
  const denied = setup('pages/visits/index', false)
  denied.onWorkflowTap.call(denied.page, { currentTarget: { dataset: { action: 'completion' } } })
  assert.equal(denied.calls.length, 0)
  assert.equal(denied.app.globalData._courseWorkflowMode, undefined)
})
