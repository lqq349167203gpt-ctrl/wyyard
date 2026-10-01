const { visitNoteApi, customerApi } = require('../../utils/api')
const { pickerData, attributionFromPicker } = require('../../utils/feedback-person')
const { beginRead, invalidateRead, disposeReads } = require('../../utils/read-scope')

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (number) => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Component({
  properties: {
    visitId: { type: String, value: '' },
    customerId: { type: String, value: '' },
    visitDate: { type: String, value: '' },
    category: { type: String, value: '' },
    title: { type: String, value: '' },
    privateToCreator: { type: Boolean, value: false },
    readOnly: { type: Boolean, value: false },
  },

  data: {
    myNote: null,        // 我填写的那条（每人一条）
    otherNotes: [],      // 别人填写的（按人归并，每人一条）
    personCount: 0,      // 已填写人数
    editorOpen: false,
    editorValue: '',
    feedbackOptions: [],
    feedbackIndex: 0,
    saving: false,
    loading: false,
    previousNeed: null,
    previousOpen: false,
    previousLoading: false,
    previousError: '',
    visitPurpose: null,
    visitPurposeOpen: false,
    visitPurposeLoading: false,
    visitPurposeError: '',
  },

  observers: {
    'visitId, category': function onSourceChange(visitId, category) {
      invalidateRead(this, 'notes')
      invalidateRead(this, 'previousNeed')
      invalidateRead(this, 'visitPurpose')
      invalidateRead(this, 'feedbackPeople')
      this.setData({ myNote: null, otherNotes: [], personCount: 0, loading: false, loadError: '', editorOpen: false, editorValue: '', previousNeed: null, previousOpen: false, previousError: '', previousLoading: false, visitPurpose: null, visitPurposeOpen: false, visitPurposeError: '', visitPurposeLoading: false })
      if (visitId && category) this.loadNotes()
    },
  },

  lifetimes: { detached() { disposeReads(this) } },

  methods: {
    async loadNotes() {
      if (!this.properties.visitId) return
      const visitId = this.properties.visitId
      const category = this.properties.category
      const isCurrent = beginRead(this, 'notes', () => this.properties.visitId === visitId && this.properties.category === category)
      this.setData({ loading: true, loadError: '' })
      try {
        const notes = await visitNoteApi.list(this.properties.visitId)
        if (!isCurrent()) return
        const categoryNotes = (notes || [])
          .filter((note) => note.category === this.properties.category)
          .filter((note) => !this.properties.privateToCreator || note.can_edit)
          .map((note) => {
            const creator = String(note.created_by || '').trim()
            return Object.assign({}, note, {
              timeText: formatTime(note.created_at),
              creatorText: creator && creator !== '历史记录' ? creator : '未知',
              feedbackText: String(note.feedback_person || '').trim() || creator || '未知',
            })
          })
        // 每人一条：按创建人归并取最新；可编辑的那条视为"我填写的"
        const byCreator = new Map()
        for (const note of categoryNotes) {
          const key = note.created_by_id || note.created_by || 'unknown'
          const existing = byCreator.get(key)
          if (!existing || String(note.created_at) > String(existing.created_at)) {
            byCreator.set(key, note)
          }
        }
        const merged = Array.from(byCreator.values())
        const myNote = merged.find((note) => note.can_edit) || null
        const otherNotes = (this.properties.privateToCreator ? [] : merged)
          .filter((note) => note !== myNote)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        this.setData({
          myNote,
          otherNotes,
          personCount: merged.length,
        })
      } catch (error) {
        if (isCurrent()) this.setData({ loadError: error.message || '记录加载失败，请重试' })
      } finally {
        if (isCurrent()) this.setData({ loading: false })
      }
    },

    onAdd() {
      if (this.properties.readOnly) return
      if (this.data.loading || this.data.loadError) {
        wx.showToast({ title: '请先完成记录读取，失败时可点击重试', icon: 'none' })
        return
      }
      this.setData({
        editorOpen: true,
        editorValue: this.data.myNote ? this.data.myNote.content : '',
        previousOpen: false,
        previousNeed: null,
        previousError: '',
        visitPurpose: null,
        visitPurposeOpen: false,
        visitPurposeError: '',
      })
      this.loadFeedbackPeople()
    },

    async loadFeedbackPeople() {
      const isCurrent = beginRead(this, 'feedbackPeople', () => this.data.editorOpen)
      try {
        const response = await visitNoteApi.feedbackPeople()
        if (!isCurrent()) return
        const picked = pickerData(response, this.data.myNote)
        this.setData({ feedbackOptions: picked.options, feedbackIndex: picked.index })
      } catch (error) {
        if (isCurrent()) wx.showToast({ title: '反馈人加载失败', icon: 'none' })
      }
    },

    onFeedbackChange(event) {
      this.setData({ feedbackIndex: Number(event.detail.value) })
    },

    async onTogglePrevious() {
      if (this.data.previousOpen) {
        this.setData({ previousOpen: false })
        return
      }
      this.setData({ previousOpen: true })
      if (this.data.previousNeed || !this.properties.customerId || this.data.previousLoading) return
      await this.loadPreviousNeed()
    },

    async loadPreviousNeed() {
      if (!this.properties.customerId) return
      const customerId = this.properties.customerId
      const visitId = this.properties.visitId
      const date = this.properties.visitDate
      const isCurrent = beginRead(this, 'previousNeed', () => this.data.editorOpen && this.properties.customerId === customerId && this.properties.visitId === visitId && this.properties.visitDate === date)
      this.setData({ previousLoading: true, previousError: '' })
      try {
        const previousNeed = await visitNoteApi.previousVisitNeed(
          this.properties.customerId,
          this.properties.visitDate,
          this.properties.visitId,
        )
        if (!isCurrent()) return
        this.setData({ previousNeed, previousError: '' })
      } catch (error) {
        if (!isCurrent()) return
        this.setData({ previousNeed: null, previousError: error.message || '加载上次需求失败' })
      } finally {
        if (isCurrent()) this.setData({ previousLoading: false })
      }
    },

    onAppendPrevious() {
      const previousContent = this.data.previousNeed && this.data.previousNeed.content
      if (!previousContent) return
      const current = (this.data.editorValue || '').trim()
      if (current.includes(previousContent.trim())) {
        wx.showToast({ title: '已带入', icon: 'none' })
        return
      }
      this.setData({ editorValue: current ? `${current}\n${previousContent}` : previousContent })
    },

    async onToggleVisitPurpose() {
      if (this.data.visitPurposeOpen) {
        this.setData({ visitPurposeOpen: false })
        return
      }
      this.setData({ visitPurposeOpen: true })
      if (this.data.visitPurpose !== null || !this.properties.customerId || this.data.visitPurposeLoading) return
      await this.loadVisitPurpose()
    },

    async loadVisitPurpose() {
      if (!this.properties.customerId) return
      const customerId = this.properties.customerId
      const isCurrent = beginRead(this, 'visitPurpose', () => this.data.editorOpen && this.properties.customerId === customerId)
      this.setData({ visitPurposeLoading: true, visitPurposeError: '' })
      try {
        const detail = await customerApi.detail(this.properties.customerId)
        if (!isCurrent()) return
        const visitPurpose = String(detail && detail.customer && detail.customer.tags || '').trim()
        this.setData({ visitPurpose, visitPurposeError: '' })
      } catch (error) {
        if (!isCurrent()) return
        this.setData({ visitPurpose: null, visitPurposeError: error.message || '加载到访目的失败' })
      } finally {
        if (isCurrent()) this.setData({ visitPurposeLoading: false })
      }
    },

    onAppendVisitPurpose() {
      const visitPurpose = this.data.visitPurpose
      if (!visitPurpose) return
      const current = (this.data.editorValue || '').trim()
      if (current.includes(visitPurpose)) {
        wx.showToast({ title: '已带入', icon: 'none' })
        return
      }
      this.setData({ editorValue: current ? `${current}\n${visitPurpose}` : visitPurpose })
    },

    onEditorInput(event) {
      this.setData({ editorValue: event.detail.value })
    },

    onEditorClose() {
      if (this.data.saving) return
      ;['previousNeed', 'visitPurpose', 'feedbackPeople'].forEach(key => invalidateRead(this, key))
      this.setData({
        editorOpen: false,
        editorValue: '',
        previousOpen: false,
        previousLoading: false,
        visitPurposeLoading: false,
        previousNeed: null,
        previousError: '',
        visitPurpose: null,
        visitPurposeOpen: false,
        visitPurposeError: '',
      })
    },

    async onSubmit() {
      if (this.properties.readOnly) return
      const content = (this.data.editorValue || '').trim()
      if (!content || this.data.saving) return
      const wasEditing = !!this.data.myNote
      const attribution = attributionFromPicker(this.data.feedbackOptions, this.data.feedbackIndex)
      this.setData({ saving: true })
      try {
        if (this.data.myNote) {
          await visitNoteApi.update(this.data.myNote.id, content, attribution)
        } else {
          await visitNoteApi.create({
            visit_id: this.properties.visitId,
            category: this.properties.category,
            content,
            ...attribution,
          })
        }
        this.setData({ editorOpen: false, editorValue: '' })
        await this.loadNotes()
        wx.showToast({ title: '已保存' })
      } catch (error) {
        wx.showToast({ title: error.message || '保存失败', icon: 'none' })
      } finally {
        this.setData({ saving: false })
      }
    },

    noop() {},

    onClearMine() {
      if (this.properties.readOnly) return
      if (!this.data.myNote) return
      wx.showModal({
        title: '确认清空',
        content: `清空后将从${this.properties.title}中移除你填写的内容，操作日志仍会保留完整内容。`,
        success: async (result) => {
          if (!result.confirm) return
          try {
            await visitNoteApi.delete(this.data.myNote.id)
            await this.loadNotes()
            wx.showToast({ title: '已清空' })
          } catch (error) {
            wx.showToast({ title: error.message || '清空失败', icon: 'none' })
          }
        },
      })
    },
  },
})
