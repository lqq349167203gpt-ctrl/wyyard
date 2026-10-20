const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../..')

function harness() {
  let component
  const requests = []
  const toasts = []
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/components/payment-form/index.js'), 'utf8'), {
    Component(value) { component = value },
    wx: { showToast(value) { toasts.push(value.title) } },
    require(name) {
      if (name === '../../utils/api') return { paymentApi: { courseOptions(date) {
        return new Promise((resolve, reject) => requests.push({ date, resolve, reject }))
      } } }
      if (name === '../../utils/read-scope') return require(path.join(root, 'miniprogram/utils/read-scope.js'))
      if (name === '../../utils/payment-types') return require(path.join(root, 'miniprogram/utils/payment-types.js'))
      if (name === '../../utils/learning-course-types') return { LEARNING_PAYMENT_TYPES: [{ key: 'OH卡技能梳理', label: 'OH卡技能梳理', price: 0, duration_type: 'month', duration_value: 24 }] }
      throw new Error(name)
    },
  })
  const instance = { ...component.methods, data: JSON.parse(JSON.stringify(component.data)), setData(values) {
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith('formData.')) this.data.formData[key.slice(9)] = value
      else this.data[key] = value
    }
  } }
  instance.data.selectedCustomer = { id: 'customer-1', nickname: '客户甲' }
  instance.triggerEvent = () => {}
  return { instance, requests, toasts }
}

test('OH卡新建和编辑都必须选择诊断老师，填写后才能进入确认', () => {
  for (const isEdit of [false, true]) {
    for (const diagnosis_teacher of [undefined, '', '   ']) {
      const { instance, toasts } = harness()
      Object.assign(instance.data, { type: 'oh_card_reading', isEdit, dealCourseChosen: true,
        formData: { reading_type: 'OH卡情感梳理', diagnosis_teacher } })
      instance.onSubmit()
      assert.equal(toasts.at(-1), '请选择诊断老师')
      assert.equal(instance.data.confirmVisible, false)
      instance.data.formData.diagnosis_teacher = '老师甲'
      instance._buildConfirmRows = () => []
      instance.onSubmit()
      assert.equal(instance.data.confirmVisible, true)
    }
  }
})

test('未选择客户时不查询成交课程，避免展示不属于客户的课程', () => {
  const { instance, requests } = harness()
  instance.data.selectedCustomer = null
  instance.data.formData = { deal_date: '2026-10-18' }
  instance._loadDealCourses('2026-10-18')
  assert.equal(requests.length, 0)
  assert.equal(instance.data.dealCourseLoading, false)
  assert.equal(instance.data.dealCourseOptions.length, 1)
  assert.equal(instance.data.dealCourseOptions[0].key, '')
})

test('线下落地课程按类型带出默认月份，编辑已存有效期不被默认值覆盖', () => {
  const { instance } = harness()
  instance.onOfflineCourseTypeChange({ detail: { value: '1' } })
  assert.equal(instance.data.formData.validity_value, '3')
  instance.onOfflineCourseTypeChange({ detail: { value: '2' } })
  assert.equal(instance.data.formData.validity_value, '12')
  instance.onOfflineCourseTypeChange({ detail: { value: '0' } })
  assert.equal(instance.data.formData.validity_value, '3')
  instance.data.formData = { course_type: '主理人训练' }
  instance._applyTypeDefaults('offline_course')
  assert.equal(instance.data.formData.validity_value, '3')
  instance.data.isEdit = true
  instance.data.formData = { course_type: '商业落地一年', validity_value: 6 }
  instance._applyTypeDefaults('offline_course')
  assert.equal(instance.data.formData.validity_value, 6)
})

test('沙龙技能学习默认一年，填写的月数按落地课程同一算法得到结束日', () => {
  const { instance } = harness()
  instance.data.type = 'internal_course'
  instance.onCourseTypeChange({ detail: { value: '0' } })
  assert.equal(instance.data.formData.validity_value, '12')
  instance.data.formData.effective_date = '2026-10-18'
  instance.data.formData.validity_value = '3'
  const rows = instance._buildConfirmRows()
  assert.equal(rows.find(row => row.label === '有效期').value, '3个月')
  assert.equal(rows.find(row => row.label === '结束日期').value, '2027-01-17')
  instance._populateEditData({ course_type: 'OH卡技能梳理', effective_date: '2026-10-18', expiry_date: '2028-10-17', price: 0 })
  assert.equal(instance.data.formData.validity_value, '24')
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
  instance._populateEditData({ customer_id: 'customer-1', nickname: '客户甲', deal_date: '2026-10-18', deal_course_key: 'saved', deal_course_name: '已存课程' })
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

test('深度情绪释放确认页按部位个数显示，原始购买数量字段保持不变', () => {
  const { instance } = harness()
  instance.data.type = 'energy_knot'
  instance.data.formData = { purchase_count: 3, effective_date: '2026-10-19', amount: 600 }
  const rows = instance._buildConfirmRows()
  assert.equal(rows.find(row => row.label === '购买个数（部位）').value, '3 个')
  assert.equal(instance.data.formData.purchase_count, 3)
  instance.data.type = 'emotional_release'
  const emotionalRows = instance._buildConfirmRows()
  assert.equal(emotionalRows.find(row => row.label === '购买场次').value, '3 次')
})
