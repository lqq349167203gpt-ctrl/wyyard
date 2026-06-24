Component({
  properties: {
    visit: { type: Object, value: {} },
  },

  data: {
    remainingText: '',
    showArrivalDialog: false,
    arrivalTime: '',
  },

  observers: {
    'visit': function (visit) {
      if (!visit) return
      // 剩余次数
      const count = visit.remaining_count
      let remainingText = '-'
      if (count === -999) {
        remainingText = '不限次'
      } else if (count !== null && count !== undefined) {
        remainingText = '剩余' + count + '次'
      }
      this.setData({ remainingText })
    },
  },

  methods: {
    onCardTap() {
      this.triggerEvent('tap', { visit: this.data.visit })
    },

    onEditTap(e) {
      this.triggerEvent('edit', { visit: this.data.visit })
    },

    onProfileTap(e) {
      this.triggerEvent('profile', { visit: this.data.visit })
    },

    onDeleteTap(e) {
      this.triggerEvent('delete', { visit: this.data.visit })
    },

    onArrivalTap(e) {
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      this.setData({ showArrivalDialog: true, arrivalTime: time })
    },

    onArrivalTimeChange(e) {
      this.setData({ arrivalTime: e.detail.value })
    },

    onCloseArrivalDialog() {
      this.setData({ showArrivalDialog: false })
    },

    onConfirmArrival() {
      this.setData({ showArrivalDialog: false })
      this.triggerEvent('arrival', { visit: this.data.visit, arrivalTime: this.data.arrivalTime })
    },

    onCancelArrival(e) {
      this.triggerEvent('arrival', { visit: this.data.visit, arrivalTime: '' })
    },
  },
})
