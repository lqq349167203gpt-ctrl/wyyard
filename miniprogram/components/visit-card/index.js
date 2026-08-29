Component({
  properties: {
    visit: { type: Object, value: {} },
    leaderName: { type: String, value: '' },
    editMode: { type: Boolean, value: false },
    editable: { type: Boolean, value: true },
    cancelable: { type: Boolean, value: true },
    sortable: { type: Boolean, value: true },
    arrivalEditable: { type: Boolean, value: true },
    canMoveUp: { type: Boolean, value: false },
    canMoveDown: { type: Boolean, value: false },
  },

  data: {
    remainingText: '',
  },

  observers: {
    'visit': function (visit) {
      if (!visit) return
      const count = visit.remaining_count
      let remainingText = ''
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
      if (this.data.editMode || this.data.visit.cancelled) return
      this.triggerEvent('cardtap', { visit: this.data.visit })
    },

    onCardLongPress() {
      this.triggerEvent('longpress', { visit: this.data.visit })
    },

    onMoveUp() {
      if (!this.data.sortable) return
      this.triggerEvent('moveup', { visit: this.data.visit })
    },

    onMoveDown() {
      if (!this.data.sortable) return
      this.triggerEvent('movedown', { visit: this.data.visit })
    },

    onEditTap(e) {
      this.triggerEvent('edit', { visit: this.data.visit })
    },

    onProfileTap(e) {
      this.triggerEvent('profile', { visit: this.data.visit })
    },

    onDeleteTap(e) {
      if (!this.data.editable) return
      this.triggerEvent('delete', { visit: this.data.visit })
    },

    onArrivalToggleTap() {
      const visit = this.data.visit
      if (!visit || visit.cancelled || !this.data.arrivalEditable) return
      this.triggerEvent('arrival', { visit, arrived: !Boolean(visit.arrived) })
    },

    onCancelVisitTap() {
      if (!this.data.cancelable) return
      this.triggerEvent('cancelvisit', { visit: this.data.visit })
    },
  },
})
