const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const { dateRange } = require(path.join(root, 'miniprogram/utils/customer-export'))

function fixture() {
  const calls = []
  const columns = [
    { key: 'nickname', label: '客户昵称', group: '基础资料', default: true },
    { key: 'card_status', label: '卡次状态', group: '基础资料', default: true },
    { key: 'referral_date', label: '引流日期', group: '联系来源', default: false },
  ]
  const api = { customerApi: {
    selector: async () => [{ nickname: '客户一', member_type: '会员', card_status: '即将用完', service_teacher: '服务甲', referrers: ['引流甲', '引流乙'], referrer_handler: '承接甲' }],
    exportOptions: async () => columns,
    export: data => { calls.push(data); return '/api/customers/export' },
  }, memberIdentityApi: { list: async () => [] }, downloadFile: async () => '/test/customer.xlsx' }
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/customer-export/index.js'), 'utf8'), {
    require: name => name.endsWith('/api') ? api : require(path.resolve(root, 'miniprogram/pages/customer-export', name)),
    Page: page => { definition = page }, getApp: () => ({ checkLogin: () => true, checkPagePermission: () => true }),
    wx: { openDocument: options => { calls.push('opened'); options.success() } }, Date, console,
  })
  const page = { ...definition, data: structuredClone(definition.data), setData(values) {
    Object.entries(values).forEach(([key, value]) => {
      const parts = key.split('.')
      let target = this.data
      parts.slice(0, -1).forEach(part => { target = target[part] })
      target[parts.at(-1)] = value
    })
  } }
  return { page, calls }
}

test('日期按月包含闰年月底，按年包含12月31日，全部不加日期', () => {
  assert.deepEqual(dateRange('month', { month: '2024-02' }), { date_from: '2024-02-01', date_to: '2024-02-29' })
  assert.deepEqual(dateRange('year', { year: '2026' }), { date_from: '2026-01-01', date_to: '2026-12-31' })
  assert.deepEqual(dateRange('all', {}), {})
})

test('选项来自完整可见目录，包含多人引流和承接人，默认只勾选服务端推荐列', async () => {
  const { page } = fixture()
  await page.onLoad({})
  assert.equal(page.data.loading, false)
  assert.deepEqual(Array.from(page.data.selectedColumns), ['nickname', 'card_status'])
  assert.deepEqual(Array.from(page.data.filterGroups.find(group => group.key === 'referrers').options, item => item.name), ['引流乙', '引流甲'].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  assert.equal(page.data.filterGroups.find(group => group.key === 'referrer_handlers').options[0].name, '承接甲')
})

test('从工作视图进入导出页，导出请求保留归属和承接状态', async () => {
  const { page, calls } = fixture()
  await page.onLoad({ filters: encodeURIComponent(JSON.stringify({ workspace: 'handoff', handoff_status: 'pending' })) })
  await page.onExport()
  assert.equal(calls[0].workspace, 'handoff')
  assert.equal(calls[0].handoff_status, 'pending')
})

test('跨组勾选保持已有选择，导出只发送已勾选字段和所选日期', async () => {
  const { page, calls } = fixture()
  await page.onLoad({})
  page.onColumnsChange({ currentTarget: { dataset: { title: '基础资料' } }, detail: { value: ['nickname'] } })
  page.onColumnsChange({ currentTarget: { dataset: { title: '联系来源' } }, detail: { value: ['referral_date'] } })
  page.setData({ mode: 'month', month: '2024-02' })
  await page.onExport()
  assert.deepEqual(Array.from(calls[0].columns), ['nickname', 'referral_date'])
  assert.equal(calls[0].date_to, '2024-02-29')
  assert.equal(calls[1], 'opened')
  assert.equal(page.data.exporting, false)
})

test('无导出列或日期逆序时不下载，已折叠分组不会被重新展开', async () => {
  const { page, calls } = fixture()
  await page.onLoad({})
  page.onGroupExpand({ currentTarget: { dataset: { title: '基础资料' } } })
  page.onColumnsAll({ currentTarget: { dataset: { mode: 'clear' } } })
  assert.equal(page.data.columnGroups[0].expanded, false)
  await page.onExport()
  assert.match(page.data.error, /至少勾选/)
  page.onColumnsAll({ currentTarget: { dataset: { mode: 'all' } } })
  page.setData({ mode: 'custom', dateFrom: '2026-10-20', dateTo: '2026-10-01' })
  await page.onExport()
  assert.match(page.data.error, /日期范围/)
  assert.equal(calls.length, 0)
})
