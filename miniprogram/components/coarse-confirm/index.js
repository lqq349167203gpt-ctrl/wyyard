// 取消关联抵扣的确认弹窗：比系统 wx.showModal 更清楚（标题 / 说明 / 逐条列出是谁的抵扣）
// 用法：页面里放 <coarse-confirm id="coarseConfirm" />，然后
//   this.selectComponent('#coarseConfirm').open(payload).then(confirmed => ...)
Component({
  data: {
    show: false,
    description: '',
    items: [],
  },

  lifetimes: {
    detached() {
      // 页面销毁时把未决的确认按「取消」处理，避免调用方一直挂着
      this._settle(false)
    },
  },

  methods: {
    open(payload) {
      const rawItems = (payload && payload.coarse_cancellation_items) || []
      if (!rawItems.length) return Promise.reject(new Error('no-items'))
      this._resolve = null
      return new Promise((resolve) => {
        this._resolve = resolve
        this.setData({
          show: true,
          description: (payload && payload.coarse_cancellation_description)
            || '取消参与后，会同时撤销下面这些粗门次卡支付记录。',
          items: rawItems.map((item) => ({
            nickname: item.nickname || '未命名客户',
            meta: [item.activity || '', item.count ? item.count + ' 次' : ''].filter(Boolean).join(' · '),
          })),
        })
      })
    },

    onCancel() {
      this._settle(false)
    },

    onOk() {
      this._settle(true)
    },

    _settle(confirmed) {
      const resolve = this._resolve
      this._resolve = null
      if (this.data.show) this.setData({ show: false, description: '', items: [] })
      if (resolve) resolve(Boolean(confirmed))
    },
  },
})
