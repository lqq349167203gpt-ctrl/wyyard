const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '../../miniprogram')

function loadModule(file, dependencies, extra = {}) {
  const context = { module: { exports: {} }, require: key => dependencies[key], Date, ...extra }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context)
  return context.module.exports
}

test('一页多个图标共享读取，只采用服务器上传地址，默认资源保持本地可用', async () => {
  let calls = 0; let complete
  const api = { list: () => { calls++; return new Promise(resolve => { complete = resolve }) } }
  const icons = loadModule('utils/activity-icons.js', { './api': { activityIconApi: api }, './config': { BASE_URL: 'http://local' } })
  const reads = Array.from({ length: 40 }, () => icons.loadIcons())
  assert.equal(calls, 1)
  complete({ items: [{ key: 'gcs', custom: true, url: '/api/uploads/public-images/new.png' }, { key: 'ers', custom: false }, { key: 'eks', custom: true, url: 'https://untrusted/image.png' }] })
  const results = await Promise.all(reads)
  assert.equal(results[0].gcs, 'http://local/api/uploads/public-images/new.png')
  assert.equal(results[0].eks, undefined)
  for (const source of ['class_record', 'group_case', 'emotional_release', 'energy_knot', 'internal_course']) {
    assert.ok(fs.existsSync(path.join(root, icons.defaultIcon(source))))
  }
})

test('类型切换时旧响应不覆盖新图标，远程图片失败可回到默认图标', async () => {
  let definition; const waits = []
  const helpers = { TYPES: { gcs: 'gcs', ers: 'ers' }, defaultIcon: source => `/local/${source}.png`, loadIcons: () => new Promise(resolve => waits.push(resolve)) }
  loadModule('components/activity-type-icon/index.js', { '../../utils/activity-icons': helpers }, { Component: value => { definition = value } })
  const component = { properties: { source: 'gcs' }, data: {}, setData(value) { Object.assign(this.data, value) }, ...definition.methods }
  definition.lifetimes.attached.call(component)
  component.properties.source = 'ers'; component.refresh()
  waits[0]({ gcs: '/old.png' }); await Promise.resolve()
  assert.equal(component.data.src, '/local/ers.png')
  waits[1]({ ers: '/new.png' }); await Promise.resolve()
  assert.equal(component.data.src, '/new.png')
  component.onError()
  assert.equal(component.data.src, '/local/ers.png')
  definition.lifetimes.detached.call(component)
})
