const { courseRosterApi, PAYMENT_PROJECT_TYPES } = require('../../utils/api')
const { CATEGORIES, decorateRoster, markCoursePagesDirty } = require('../../utils/course-roster')
const { noteVisibility } = require('../../utils/note-permissions')
const { attributionFromPicker } = require('../../utils/feedback-person')

Page({
  data: { loading: true, error: '', course: null, person: null, fields: [], saving: false,
    feedbackOptions: [], followUpPeople: [], planPersonIndex: 0, planDate: '',
    paymentTypes: PAYMENT_PROJECT_TYPES, canCreatePayment: false },
  onLoad(options) {
    if (!getApp().checkLogin()) return
    if (!getApp().checkPagePermission('daily-activities')) { this.setData({ loading: false, error: '没有课表页面权限' }); return }
    this.source = options.source; this.sessionId = options.id; this.customerId = options.customerId
    if (!this.source || !this.sessionId || !this.customerId) { this.setData({ loading: false, error: '课程或学员参数不完整，请返回重试' }); return }
    const app = getApp()
    const user = app.globalData.currentUser || wx.getStorageSync('currentUser') || {}
    const pages = app.globalData.userPermissions || wx.getStorageSync('userPermissions') || []
    const edit = app.globalData.editPermissions || wx.getStorageSync('userEditPermissions') || {}
    this.setData({ canCreatePayment: user.role === '超级管理员' || pages.includes('payment') && edit.payments !== 'view' })
    this.load()
  },
  onUnload() { this._disposed = true },
  async load() {
    if (!this.sessionId) return
    this.setData({ loading: true, error: '' })
    try {
      const [course, notes] = await Promise.all([courseRosterApi.get(this.source, this.sessionId), courseRosterApi.notes(this.source, this.sessionId)])
      if (this._disposed) return
      this._course = course; this._notes = notes
      this._people = decorateRoster(course, notes).filter(person => !person.withdrawn)
      if (!this._people.some(person => person.id === this.customerId)) throw new Error('该学员不在本场有效名单中，或已退课')
      this.showPerson(this.customerId)
    } catch (error) { if (!this._disposed) this.setData({ loading: false, error: error.message || '记录读取失败，请重试' }) }
  },
  showPerson(id) {
    const course = this._course, visibility = noteVisibility()
    const person = this._people.find(p => p.id === id)
    if (!person) return
    this.customerId = id
    const response = course.feedback_people || {}, current = response.current_person || {}
    const feedbackOptions = (response.options || []).slice()
    if (current.name && !feedbackOptions.some(p => p.name === current.name)) feedbackOptions.unshift(current)
    const personNotes = this._notes.filter(note => note.customer_id === id)
    personNotes.forEach(note => {
      const name = note.feedback_person || note.created_by
      if (name && !feedbackOptions.some(p => note.feedback_person_id ? p.customer_id === note.feedback_person_id : p.name === name)) feedbackOptions.push({ name, customer_id: note.feedback_person_id || '' })
    })
    const followUpPeople = [{ id: '', nickname: '不指定' }].concat(course.follow_up_people || [])
    const ownPlan = personNotes.find(n => n.category === 'follow_up' && n.can_edit)
    const planId = ownPlan ? ownPlan.next_follow_up_person_id : current.customer_id
    const planName = ownPlan ? ownPlan.next_follow_up_person : current.name
    let planPersonIndex = followUpPeople.findIndex(p => planId ? p.id === planId : p.nickname === planName)
    if (planPersonIndex < 0 && planName) { followUpPeople.push({ id: planId || '', nickname: planName }); planPersonIndex = followUpPeople.length - 1 }
    const fields = CATEGORIES.filter(field => visibility[field.category]).map(field => {
      const entries = personNotes.filter(n => n.category === field.category)
      const own = entries.find(n => n.can_edit)
      const author = own ? own.feedback_person || own.created_by : current.name
      const feedbackIndex = Math.max(0, feedbackOptions.findIndex(p => own && own.feedback_person_id ? p.customer_id === own.feedback_person_id : p.name === author))
      return { ...field, value: own ? own.content : '', original: own ? own.content : '', noteId: own ? own.id : '',
        feedbackIndex, originalFeedback: own ? own.feedback_person_id || own.feedback_person || own.created_by : '',
        feedbackName: (feedbackOptions[feedbackIndex] || {}).name || current.name || '本人',
        others: entries.filter(n => !n.can_edit).map(n => ({ ...n, author: n.feedback_person || n.created_by || '未记录' })),
      }
    })
    this._planOriginal = ownPlan ? {
      person: ownPlan.next_follow_up_person_id || ownPlan.next_follow_up_person || '', date: ownPlan.next_follow_up_date || '',
    } : { person: (followUpPeople[Math.max(0, planPersonIndex)] || {}).id || (planPersonIndex > 0 ? followUpPeople[planPersonIndex].nickname : ''), date: '' }
    this._dirty = false
    if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
    this.setData({ course, person, fields, feedbackOptions, followUpPeople,
      planPersonIndex: Math.max(0, planPersonIndex), planDate: ownPlan ? ownPlan.next_follow_up_date || '' : '',
      position: this._people.findIndex(p => p.id === id) + 1, total: this._people.length,
      loading: false, error: '', canEdit: course.can_edit_notes && !person.withdrawn })
  },
  dirty() {
    this._dirty = true
    if (wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '本场记录尚未保存，确认离开？' })
  },
  onInput(e) {
    if (!this.data.canEdit || this.data.saving) return
    this.setData({ [`fields[${Number(e.currentTarget.dataset.index)}].value`]: e.detail.value }); this.dirty()
  },
  onFeedback(e) {
    if (!this.data.canEdit || this.data.saving) return
    const index = Number(e.currentTarget.dataset.index), value = Number(e.detail.value)
    this.setData({ [`fields[${index}].feedbackIndex`]: value, [`fields[${index}].feedbackName`]: (this.data.feedbackOptions[value] || {}).name || '本人' }); this.dirty()
  },
  onPlanPerson(e) { if (this.data.canEdit && !this.data.saving) { this.setData({ planPersonIndex: Number(e.detail.value) }); this.dirty() } },
  onPlanDate(e) { if (this.data.canEdit && !this.data.saving) { this.setData({ planDate: e.detail.value }); this.dirty() } },
  onClearPlanDate() { if (this.data.canEdit && !this.data.saving) { this.setData({ planDate: '' }); this.dirty() } },
  onProfile() { wx.navigateTo({ url: `/pages/customer-profile/index?id=${encodeURIComponent(this.customerId)}` }) },
  onPayment(e) {
    if (!this.data.canCreatePayment || this.data.saving) return
    const type = this.data.paymentTypes[Number(e.detail.value)]
    if (!type) return
    wx.navigateTo({ url: `/pages/payment-create/index?type=${encodeURIComponent(type.key)}&customerId=${encodeURIComponent(this.customerId)}&nickname=${encodeURIComponent(this.data.person.nickname)}` })
  },
  async onSave(e) {
    if (!this.data.canEdit || this.data.saving || this.data.error) return
    const next = e.currentTarget.dataset.next === 'true' || e.currentTarget.dataset.next === true
    const personId = this.customerId
    const fields = this.data.fields.map(field => ({ ...field }))
    const planPerson = this.data.followUpPeople[this.data.planPersonIndex] || {}
    const plan = { next_follow_up_person_id: planPerson.id || '', next_follow_up_person: this.data.planPersonIndex ? planPerson.nickname : '', next_follow_up_date: this.data.planDate || '' }
    const planChanged = (plan.next_follow_up_person_id || plan.next_follow_up_person) !== this._planOriginal.person || plan.next_follow_up_date !== this._planOriginal.date
    const follow = fields.find(f => f.category === 'follow_up')
    if (follow && !follow.value.trim() && (plan.next_follow_up_person_id || plan.next_follow_up_date) && planChanged && this._dirty) {
      wx.showToast({ title: '请填写跟进点后再设置跟进安排', icon: 'none' }); return
    }
    this.setData({ saving: true })
    try {
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i], content = field.value.trim()
        const feedback = attributionFromPicker(this.data.feedbackOptions, field.feedbackIndex)
        const changed = content !== field.original.trim() || (feedback.feedback_person_id || feedback.feedback_person) !== field.originalFeedback || field.category === 'follow_up' && planChanged
        if (!changed || !content && !field.noteId) continue
        let saved
        if (!content) await courseRosterApi.deleteNote(field.noteId, this.source, this.sessionId)
        else saved = await courseRosterApi.saveNote({ activity_source: this.source, session_id: this.sessionId,
          customer_id: personId, category: field.category, content, ...feedback, ...(field.category === 'follow_up' ? plan : {}) })
        this._notes = this._notes.filter(n => n.id !== field.noteId)
        if (saved) this._notes.push(saved)
        field.noteId = saved ? saved.id : ''; field.original = content; field.originalFeedback = feedback.feedback_person_id || feedback.feedback_person
        this.setData({ [`fields[${i}]`]: field })
        if (field.category === 'follow_up') this._planOriginal = { person: plan.next_follow_up_person_id || plan.next_follow_up_person, date: plan.next_follow_up_date }
        markCoursePagesDirty()
      }
      this._dirty = false
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
      if (next) {
        const index = this._people.findIndex(p => p.id === personId)
        const person = this._people[index + 1]
        if (person) { this.showPerson(person.id); wx.pageScrollTo({ scrollTop: 0, duration: 0 }) }
        else { wx.showToast({ title: '本场记录已保存', icon: 'success' }); wx.navigateBack() }
      } else wx.showToast({ title: '已保存', icon: 'success' })
    } catch (_) { /* 保存失败保留草稿；已成功的字段更新原值，重试不会重复造记录。 */ }
    finally { if (!this._disposed) this.setData({ saving: false }) }
  },
})
