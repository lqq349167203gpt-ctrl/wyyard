const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../..')

function picker(properties = {}) {
  let definition
  const events = [], toasts = []
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/components/time-picker/index.js'), 'utf8'), {
    Component(value) { definition = value }, wx: { showToast(value) { toasts.push(value) } },
  })
  const instance = {
    ...definition.methods,
    data: { ...Object.fromEntries(Object.entries(definition.properties).map(([key, value]) => [key, value.value])),
      ...structuredClone(definition.data), ...properties },
    setData(values) { Object.assign(this.data, values) },
    triggerEvent(name, value) { events.push({ name, value: JSON.parse(JSON.stringify(value)) }) },
  }
  instance.syncSelection()
  const move = (column, value) => instance.onColumnChange({ detail: { column, value } })
  const confirm = () => instance.onConfirm({ detail: { value: Array.from(instance.data.indices) } })
  return { instance, events, toasts, move, confirm }
}

test('确认未调整的时间时保留历史非5分钟值，区间的两个端点均不取整', () => {
  const single = picker({ value: '09:03' })
  single.confirm()
  assert.deepEqual(single.events[0].value, { value: '09:03' })
  const range = picker({ isRange: true, start: '09:03', end: '10:07' })
  range.confirm()
  assert.deepEqual(range.events[0].value, { start: '09:03', end: '10:07' })
})

test('只转动一个端点时，另一个历史端点保持原值；主动选择后采用5分钟值', () => {
  const start = picker({ isRange: true, start: '09:03', end: '10:07' })
  start.move(1, 1)
  start.confirm()
  assert.deepEqual(start.events[0].value, { start: '09:05', end: '10:07' })
  const end = picker({ isRange: true, start: '09:03', end: '10:07' })
  end.move(2, 11)
  end.confirm()
  assert.deepEqual(end.events[0].value, { start: '09:03', end: '11:05' })
  const back = picker({ value: '09:03' })
  back.move(1, 1)
  back.move(1, 0)
  back.confirm()
  assert.deepEqual(back.events[0].value, { value: '09:00' })
})

test('取消后清除临时转动，校验使用保留后的真实端点，禁用时不产生修改', () => {
  const cancelled = picker({ value: '09:03' })
  cancelled.move(1, 1)
  cancelled.instance.onCancel()
  cancelled.confirm()
  assert.deepEqual(cancelled.events[0].value, { value: '09:03' })
  const invalid = picker({ isRange: true, start: '09:03', end: '09:04' })
  invalid.move(1, 1)
  invalid.confirm()
  assert.equal(invalid.events.length, 0)
  assert.equal(invalid.toasts.length, 1)
  invalid.confirm()
  assert.deepEqual(invalid.events[0].value, { start: '09:03', end: '09:04' })
  const disabled = picker({ disabled: true, value: '09:03' })
  disabled.move(1, 1)
  disabled.confirm()
  assert.equal(disabled.events.length, 0)
})

test('五分钟选择覆盖全天；新建空值仍使用默认时间', () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const current = picker()
      current.move(0, hour)
      current.move(1, minute / 5)
      current.confirm()
      assert.equal(current.events[0].value.value, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    }
  }
  const empty = picker({ isRange: true })
  empty.confirm()
  assert.deepEqual(empty.events[0].value, { start: '09:00', end: '10:00' })
})

test('每日报表财务和客户成交明细保留OH子类型、时长及历史空子类型', () => {
  let page
  vm.runInNewContext(readFileSync(path.join(root, 'miniprogram/pages/daily-report/index.js'), 'utf8'), {
    Page(value) { page = value }, require() { return {} },
  })
  const date = '2026-10-18'
  const item = { id: 'a', customer_id: 'customer', deal_date: date,
    reading_type: '余老师商业梳理', diagnosis_duration: 3 }
  const payment = { ohs: [item, { ...item, id: 'deleted', is_deleted: true }, { ...item, id: 'voided', voided: true }] }
  page._paymentData = payment
  page._organizations = []
  const finance = page._buildFinance(payment, date, {})
  const detail = page._buildPaymentRecords('customer', date)
  assert.equal(finance.rows.length, 1)
  assert.equal(detail.length, 1)
  assert.equal(finance.rows[0].item_name, '余老师商业梳理 · 1.5小时')
  assert.equal(detail[0].c2, finance.rows[0].item_name)
  delete item.reading_type
  assert.equal(page._buildPaymentRecords('customer', date)[0].c2, '1.5小时')
  delete item.diagnosis_duration
  assert.equal(page._buildPaymentRecords('customer', date)[0].c2, 'OH卡诊断')
})
