const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const settle = () => new Promise(resolve => setImmediate(resolve))
const event = data => ({ currentTarget: { dataset: data } })

function fixture(overrides = {}) {
  const calls = [], routes = []
  const api = { customerApi: {
    workspaces: async () => [{ key: 'handoff', label: '承接端' }, { key: 'sales', label: 'sales端' }],
    workspaceSettings: async () => {
      const options = await api.customerApi.workspaces()
      return { is_admin: false, options, visible_workspaces: options.map(item => item.key), default_workspace: options[0]?.key || '' }
    },
    selector: async params => { calls.push(['selector', params]); return [] },
    list: async params => { calls.push(['list', params]); return { items: [], total: 0 } },
    acceptHandoff: async (...args) => calls.push(['accept', ...args]),
    ...overrides,
  }, customerTagApi: { list: async () => [] }, memberIdentityApi: { list: async () => [] } }
  let definition
  const file = path.join(root, 'miniprogram/pages/customers/index.js')
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name.endsWith('/api') ? api : name.endsWith('/record-ownership') ? { isAreaViewOnly: () => false } : require(path.resolve(path.dirname(file), name)),
    Page: value => { definition = value },
    getApp: () => ({ checkLogin: () => true, checkPagePermission: () => true }),
    wx: { navigateTo: value => routes.push(value.url), showToast() {} },
    console: { error() {} }, setTimeout, clearTimeout,
  })
  const page = { ...definition, data: structuredClone(definition.data),
    setData(values, callback) { Object.assign(this.data, values); callback?.() } }
  return { page, calls, routes }
}

test('承接首页默认待承接，搜索与导出保留同一范围', async () => {
  const { page, calls, routes } = fixture()
  await page.onLoad()
  const request = calls.find(([name]) => name === 'list')[1]
  assert.equal(request.workspace, 'handoff')
  assert.equal(request.handoff_status, 'pending')
  page.onSearchTap()
  page.onExportTap()
  assert.match(routes[0], /workspace=handoff&handoff_status=pending/)
  const filters = JSON.parse(decodeURIComponent(routes[1].split('filters=')[1]))
  assert.equal(filters.workspace, 'handoff')
  assert.equal(filters.handoff_status, 'pending')
})

test('配置失败时不退回全部客户；重试成功后才查询', async () => {
  let fail = true
  const { page, calls } = fixture({ workspaces: async () => {
    if (fail) throw new Error('权限加载失败')
    return []
  } })
  await page.onLoad()
  assert.equal(page.data.scopeReady, false)
  assert.match(page.data.workspaceError, /权限加载失败/)
  assert.equal(calls.filter(([name]) => name === 'list').length, 0)
  fail = false
  await page.loadWorkspaces()
  assert.equal(page.data.scopeReady, true)
  assert.equal(page.data.workspace, '')
  assert.equal(calls.filter(([name]) => name === 'list').length, 1)
})

test('切换视图清空筛选与旧列表，迟到响应不能覆盖 Sales 客户', async () => {
  const pending = []
  const { page } = fixture({ list: params => new Promise(resolve => pending.push({ params, resolve })) })
  const loading = page.onLoad()
  await settle()
  page.setData({ selectedMemberTypes: ['旧筛选'], filterCount: 1 })
  page.onWorkspaceTap(event({ key: 'sales' }))
  assert.equal(pending.length, 2)
  pending[1].resolve({ items: [{ id: 'sales', nickname: 'Sales 客户' }], total: 1 })
  await settle()
  pending[0].resolve({ items: [{ id: 'old', nickname: '旧客户' }], total: 1 })
  await loading
  assert.equal(page.data.customers[0].id, 'sales')
  assert.equal(page.data.groupedCustomers[0].type, 'sales端')
  assert.equal(page.data.selectedMemberTypes.length, 0)
  assert.equal(page.data.filterCount, 0)
  assert.equal(pending[1].params.workspace, 'sales')
})

test('确认承接携带当前交接版本，成功后刷新待办，重复点击不重复提交', async () => {
  let finish
  const { page, calls } = fixture({ acceptHandoff: (...args) => {
    calls.push(['accept', ...args])
    return new Promise(resolve => { finish = resolve })
  } })
  await page.onLoad()
  const accepting = page.onAcceptHandoff(event({ id: 'customer', assignment: 'version-1' }))
  await page.onAcceptHandoff(event({ id: 'customer', assignment: 'version-1' }))
  assert.equal(calls.filter(([name]) => name === 'accept').length, 1)
  assert.deepEqual(calls.find(([name]) => name === 'accept'), ['accept', 'customer', 'version-1'])
  finish()
  await accepting
  assert.equal(page.data.acceptingId, '')
  assert.equal(calls.filter(([name]) => name === 'list').length, 2)
})

test('承接状态切换在服务端筛选；历史客户不会混进待办', async () => {
  const { page, calls } = fixture()
  await page.onLoad()
  page.onHandoffStatusTap(event({ key: 'history' }))
  await settle()
  const request = calls.filter(([name]) => name === 'list').at(-1)[1]
  assert.equal(request.workspace, 'handoff')
  assert.equal(request.handoff_status, 'history')
  assert.equal(request.page, 1)
})

const adminSettings = () => ({ is_admin: true,
  options: [{ key: 'all', label: '全部客户' }, { key: 'referral', label: '引流端' }, { key: 'handoff', label: '承接端' }, { key: 'sales', label: 'sales端' }],
  visible_workspaces: ['all', 'referral', 'handoff', 'sales'], default_workspace: 'all' })

test('超级管理员默认全部客户，四个入口均显示；指定 Sales 后搜索和导出保持负责人', async () => {
  const { page, calls, routes } = fixture({ workspaceSettings: async () => adminSettings(),
    selector: async () => [{ service_teacher: '甲' }, { service_teacher: '乙' }] })
  await page.onLoad()
  assert.equal(page.data.workspace, 'all')
  assert.equal(page.data.workspaces.length, 4)
  assert.equal(calls.find(([name]) => name === 'list')[1].workspace, 'all')
  page.onWorkspaceTap(event({ key: 'sales' }))
  await settle()
  page.onOwnerChange({ detail: { value: page.data.ownerOptions.indexOf('乙') } })
  await settle()
  assert.equal(calls.filter(([name]) => name === 'list').at(-1)[1].workspace_owner, '乙')
  page.onSearchTap()
  page.onExportTap()
  assert.match(routes[0], /workspace_owner=%E4%B9%99/)
  assert.equal(JSON.parse(decodeURIComponent(routes[1].split('filters=')[1])).workspace_owner, '乙')
  page.onWorkspaceTap(event({ key: 'referral' }))
  assert.equal(page.data.workspaceOwner, '')
})

test('界面设置取消不生效，保存个人入口和默认项后重新进入仍使用已保存设置', async () => {
  let saved = adminSettings(), writes = 0
  const overrides = { workspaceSettings: async () => saved,
    saveWorkspaceSettings: async payload => { writes++; saved = { ...saved, ...payload }; return saved } }
  const { page } = fixture(overrides)
  await page.onLoad()
  page.onOpenWorkspaceSettings()
  page.onToggleWorkspaceSetting(event({ key: 'handoff' }))
  page.onCloseWorkspaceSettings()
  assert.equal(writes, 0)
  assert.equal(page.data.workspaces.length, 4)
  page.onOpenWorkspaceSettings()
  page.onToggleWorkspaceSetting(event({ key: 'handoff' }))
  page.onToggleWorkspaceSetting(event({ key: 'all' }))
  assert.equal(page.data.settingsOptions[0].selected, true)
  page.onDefaultWorkspaceChange({ detail: { value: page.data.defaultOptions.findIndex(item => item.key === 'sales') } })
  await page.onSaveWorkspaceSettings()
  assert.equal(writes, 1)
  assert.equal(page.data.workspace, 'sales')
  assert.equal(page.data.workspaces.some(item => item.key === 'handoff'), false)
  const reopened = fixture(overrides).page
  await reopened.onLoad()
  assert.equal(reopened.data.workspace, 'sales')
  assert.equal(reopened.data.workspaces.length, 3)
})

test('个人设置保存失败保留草稿，隐藏默认入口时回到全部客户', async () => {
  const { page } = fixture({ workspaceSettings: async () => ({ ...adminSettings(), default_workspace: 'sales' }),
    saveWorkspaceSettings: async () => { throw new Error('保存失败') } })
  await page.onLoad()
  page.onOpenWorkspaceSettings()
  page.onToggleWorkspaceSetting(event({ key: 'sales' }))
  assert.equal(page.data.draftDefault, 'all')
  await page.onSaveWorkspaceSettings()
  assert.equal(page.data.showWorkspaceSettings, true)
  assert.equal(page.data.workspace, 'sales')
  assert.equal(page.data.settingsError, '保存失败')
  assert.equal(page.data.settingsSaving, false)
})
