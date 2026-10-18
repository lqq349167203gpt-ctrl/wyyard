const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../..')

function harness() {
  let component
  const requests = []
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/components/payment-form/index.js'), 'utf8'), {
    Component(value) { component = value },
    require(name) {
      if (name === '../../utils/api') return { paymentApi: { courseOptions(date) {
        return new Promise((resolve, reject) => requests.push({ date, resolve, reject }))
      } } }
      if (name === '../../utils/read-scope') return require(path.join(root, 'miniprogram/utils/read-scope.js'))
      if (name === '../../utils/payment-types') return { CARD_TYPES: [], OFFLINE_COURSE_TYPES: ['主理人训练', '商业落地三个月', '商业落地一年'], OH_READING_TYPES: [] }
      if (name === '../../utils/learning-course-types') return { LEARNING_PAYMENT_TYPES: [] }
      throw new Error(name)
    },
  })
  const instance = { ...component.methods, data: JSON.parse(JSON.stringify(component.data)), setData(values) {
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith('formData.')) this.data.formData[key.slice(9)] = value
      else this.data[key] = value
    }
  } }
  return { instance, requests }
}

test('线下落地课程按类型带出默认月份，编辑已存有效期不被默认值覆盖', () => {
  const { instance } = harness()
  instance.onOfflineCourseTypeChange({ detail: { value: '1' } })
  assert.equal(instance.data.formData.validity_value, '3')
  instance.onOfflineCourseTypeChange({ detail: { value: '2' } })
  assert.equal(instance.data.formData.validity_value, '12')
  instance.onOfflineCourseTypeChange({ detail: { value: '0' } })
  assert.equal(instance.data.formData.validity_value, '1')
  instance.data.isEdit = true
  instance.data.formData = { course_type: '商业落地一年', validity_value: 6 }
  instance._applyTypeDefaults('offline_course')
  assert.equal(instance.data.formData.validity_value, 6)
})

test('成交日期切换会清空旧选择；旧课程请求不能覆盖新日期', async () => {
  const { instance, requests } = harness()
  instance.data.formData = { deal_date: '2026-10-18', deal_course_key: 'old', deal_course_name: '旧课' }
  const old = instance._loadDealCourses('2026-10-18')
  instance.onFieldChange({ currentTarget: { dataset: { field: 'deal_date' } }, detail: { value: '2026-10-19' } })
  assert.equal(instance.data.formData.deal_course_key, '')
  assert.equal(instance.data.formData.deal_course_name, '')
  const latest = instance._loadDealCourses('2026-10-19')
  requests[1].resolve([{ key: 'new', name: '新课' }])
  await latest
  requests[0].resolve([{ key: 'old', name: '旧课' }])
  await old
  assert.equal(instance.data.dealCourseOptions[1].key, 'new')
  instance.onDealCourseChange({ detail: { value: 1 } })
  assert.equal(instance.data.formData.deal_course_key, 'new')
  instance.onDealCourseChange({ detail: { value: 0 } })
  assert.equal(instance.data.formData.deal_course_key, '')
  assert.equal(instance.data.formData.deal_course_name, '')
})

test('编辑保留已保存课程；读取失败可以重试', async () => {
  const { instance, requests } = harness()
  instance.data.formData = { deal_date: '2026-10-18', deal_course_key: 'saved', deal_course_name: '已存课程' }
  const failed = instance._loadDealCourses('2026-10-18')
  requests[0].reject(new Error('网络失败'))
  await failed
  assert.equal(instance.data.formData.deal_course_key, 'saved')
  assert.equal(instance.data.dealCourseError, '网络失败')
  const retry = instance.onDealCourseRetry()
  requests[1].resolve([{ key: 'saved', name: '已存课程' }])
  await retry
  assert.equal(instance.data.dealCourseError, '')
  assert.equal(instance.data.dealCourseIndex, 1)
})
