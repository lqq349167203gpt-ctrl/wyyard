const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'frontend/src/lib/default-organization.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject })
const organizations = [{ id: 'other', name: '其他组织' }, { id: 'tea', name: '无忧茶院', status: 'active' }]

test('默认核心组织不取第一项，兼容历史名称，缺失时不扩大范围', () => {
  assert.equal(exportsObject.defaultOrganization(organizations).id, 'tea')
  assert.equal(exportsObject.defaultOrganization([{ id: 'legacy', name: '无忧茶苑' }]).id, 'legacy')
  assert.equal(exportsObject.defaultOrganization([{ id: 'tea', name: '无忧茶院', status: 'archived' }]), undefined)
  assert.equal(exportsObject.defaultOrganization([organizations[0]]), undefined)
})

function mini(editing, orgs = organizations, type = 'membership_card') {
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/components/payment-form/index.js'), 'utf8'), {
    Component: value => { definition = value },
    require: name => name === '../../utils/api' ? { organizationApi: { list: async () => orgs } }
      : require(path.resolve(root, 'miniprogram/components/payment-form', name)),
  })
  const instance = { ...definition.methods, data: { ...structuredClone(definition.data), type, isEdit: !!editing,
    editData: editing, formData: { organization_id: editing?.organization_id || '' } },
    setData(values) { for (const [key, value] of Object.entries(values)) {
      if (key === 'formData.organization_id') this.data.formData.organization_id = value
      else this.data[key] = value
    } } }
  return instance
}

test('小程序所有新增付费类型含粗门次卡选择无忧茶院，历史编辑保留原值', async () => {
  for (const type of ['membership_card', 'coarse_door_card', 'online_tea', 'other']) {
    const page = mini(null, organizations, type)
    await page._loadOrganizations()
    assert.equal(page.data.formData.organization_id, 'tea')
  }
  const edit = mini({ organization_id: 'other' })
  await edit._loadOrganizations()
  assert.equal(edit.data.formData.organization_id, 'other')
  const missing = mini(null, [organizations[0]])
  await missing._loadOrganizations()
  assert.equal(missing.data.formData.organization_id, '')
  assert.equal(missing.data.orgIndex, -1)
})
