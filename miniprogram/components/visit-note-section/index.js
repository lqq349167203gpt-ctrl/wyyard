const { visitNoteApi } = require('../../utils/api')

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
    category: { type: String, value: '' },
    title: { type: String, value: '' },
  },

  data: {
    myNote: null,        // 我填写的那条（每人一条）
    otherNotes: [],      // 别人填写的（按人归并，每人一条）
    personCount: 0,      // 已填写人数
    editorOpen: false,
    editorValue: '',
    saving: false,
    loading: false,
  },

  observers: {
    'visitId, category': function onSourceChange(visitId, category) {
      if (visitId && category) this.loadNotes()
    },
  },

  methods: {
    async loadNotes() {
      if (!this.properties.visitId || this.data.loading) return
      this.setData({ loading: true })
      try {
        const notes = await visitNoteApi.list(this.properties.visitId)
        const categoryNotes = (notes || [])
          .filter((note) => note.category === this.properties.category)
          .map((note) => Object.assign({}, note, { timeText: formatTime(note.created_at) }))
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
        const otherNotes = merged
          .filter((note) => note !== myNote)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        this.setData({
          myNote,
          otherNotes,
          personCount: merged.length,
        })
      } catch (error) {
        console.error('加载协作记录失败:', error)
      } finally {
        this.setData({ loading: false })
      }
    },

    onAdd() {
      this.setData({ editorOpen: true, editorValue: this.data.myNote ? this.data.myNote.content : '' })
    },

    onEditorInput(event) {
      this.setData({ editorValue: event.detail.value })
    },

    onEditorClose() {
      if (this.data.saving) return
      this.setData({ editorOpen: false, editorValue: '' })
    },

    async onSubmit() {
      const content = (this.data.editorValue || '').trim()
      if (!content || this.data.saving) return
      const wasEditing = !!this.data.myNote
      this.setData({ saving: true })
      try {
        if (this.data.myNote) {
          await visitNoteApi.update(this.data.myNote.id, content)
        } else {
          await visitNoteApi.create({
            visit_id: this.properties.visitId,
            category: this.properties.category,
            content,
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
