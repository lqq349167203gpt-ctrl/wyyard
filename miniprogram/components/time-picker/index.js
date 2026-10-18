const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

function timeIndices(time, fallback) {
  const match = /^(\d{2}):([0-5]\d)$/.exec(time || fallback)
  if (!match || Number(match[1]) > 23) return [9, 0]
  // 只初始化选择轮，不改原记录；取消弹窗不改变任何字段。
  return [Number(match[1]), Math.floor(Number(match[2]) / 5)]
}

function validTime(time) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')
}

Component({
  properties: {
    value: { type: String, value: '' },
    start: { type: String, value: '' },
    end: { type: String, value: '' },
    isRange: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
  },
  data: { columns: [], indices: [] },
  observers: {
    'value, start, end, isRange': function () { this.syncSelection() },
  },
  lifetimes: {
    attached() { this.syncSelection() },
  },
  methods: {
    syncSelection() {
      const { value, start, end, isRange } = this.data
      this._originalTimes = isRange
        ? [validTime(start) ? start : '09:00', validTime(end) ? end : '10:00']
        : [validTime(value) ? value : '09:00']
      this._changedEndpoints = []
      this.setData(isRange ? {
        columns: [HOURS.map(hour => `开始${hour}`), MINUTES, HOURS.map(hour => `结束${hour}`), MINUTES],
        indices: [...timeIndices(start, '09:00'), ...timeIndices(end, '10:00')],
      } : {
        columns: [HOURS, MINUTES],
        indices: timeIndices(value, '09:00'),
      })
      this._initialIndices = this.data.indices.slice()
    },
    onColumnChange(event) {
      if (this.data.disabled) return
      const { column, value } = event.detail
      if (!Number.isInteger(column) || column < 0 || column >= this.data.indices.length
        || !Number.isInteger(value) || value < 0 || value >= (column % 2 ? 12 : 24)) return
      this._changedEndpoints[Math.floor(column / 2)] = true
      const indices = this.data.indices.slice()
      indices[column] = value
      this.setData({ indices })
    },
    onConfirm(event) {
      if (this.data.disabled) return
      const indices = event.detail.value
      const expected = this.data.isRange ? 4 : 2
      if (!Array.isArray(indices) || indices.length !== expected || indices.some((value, index) => !Number.isInteger(value) || value < 0 || value >= (index % 2 ? 12 : 24))) return
      // 历史记录可能不是 5 分钟整点；只调整用户实际转动的端点。
      const selectionTime = endpoint => {
        const column = endpoint * 2
        const untouched = !this._changedEndpoints[endpoint]
          && indices[column] === this._initialIndices[column]
          && indices[column + 1] === this._initialIndices[column + 1]
        return untouched ? this._originalTimes[endpoint]
          : `${HOURS[indices[column]]}:${MINUTES[indices[column + 1]]}`
      }
      const first = selectionTime(0)
      if (this.data.isRange) {
        const end = selectionTime(1)
        if (end <= first) {
          wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' })
          this.syncSelection()
          return
        }
        this.triggerEvent('change', { start: first, end })
      } else {
        this.triggerEvent('change', { value: first })
      }
      this.syncSelection()
    },
    onCancel() { this.syncSelection() },
  },
})
