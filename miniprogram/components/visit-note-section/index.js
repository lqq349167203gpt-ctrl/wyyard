const { visitNoteApi, customerApi, customerTagApi } = require('../../utils/api')
const { pickerData, attributionFromPicker } = require('../../utils/feedback-person')
const { beginRead, invalidateRead, disposeReads } = require('../../utils/read-scope')
const { formatNoteTime } = require('../../utils/note-feedback-meta')
const { noteVisibility } = require('../../utils/note-permissions')

function formatPlanDate(value) {
  return String(value || '').replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1/$2')
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
    enlargedMeta: { type: Boolean, value: false },
  },

  data: {
    myNote: null,        // 我填写的那条（每人一条）
    otherNotes: [],      // 别人填写的（按人归并，每人一条）
    personCount: 0,      // 已填写人数
    editorOpen: false,
    editorValue: '',
    needTagOptions: [],
    needTagIds: [],
    needTagsLoading: false,
    needTagsError: '',
    feedbackOptions: [],
    feedbackIndex: 0,
    nextFollowUpPersonId: '',
    nextFollowUpPerson: '',
    nextFollowUpDate: '',
    nextFollowUpDateText: '',
    followUpPeople: [],
    followUpMatches: [],
    followUpMatchCount: 0,
    followUpSearch: '',
    followUpSearchOpen: false,
    followUpPeopleLoading: false,
    followUpPeopleError: '',
    datePickerToday: '',
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
      const visibility = noteVisibility()
      this.setData({ canView: !!visibility[category], showNeedTags: visibility.visit_need_tags,
        showDetail: category !== 'visit_need' || visibility.visit_need_detail })
      invalidateRead(this, 'notes')
      invalidateRead(this, 'previousNeed')
      invalidateRead(this, 'visitPurpose')
      invalidateRead(this, 'feedbackPeople')
      invalidateRead(this, 'followUpPeople')
      this.setData({ myNote: null, otherNotes: [], personCount: 0, loading: false, loadError: '', editorOpen: false, editorValue: '', previousNeed: null, previousOpen: false, previousError: '', previousLoading: false, visitPurpose: null, visitPurposeOpen: false, visitPurposeError: '', visitPurposeLoading: false })
      this.setData({ nextFollowUpPersonId: '', nextFollowUpPerson: '', nextFollowUpDate: '', nextFollowUpDateText: '', followUpPeople: [],
        followUpMatches: [], followUpMatchCount: 0, followUpSearch: '', followUpSearchOpen: false,
        followUpPeopleLoading: false, followUpPeopleError: '' })
      if (visitId && category && visibility[category]) this.loadNotes()
    },
  },

  lifetimes: { detached() { disposeReads(this) } },

  methods: {
    async loadNeedTags() {
      const visitId = this.properties.visitId
      const isCurrent = beginRead(this, 'needTags', () => this.properties.visitId === visitId && this.data.editorOpen)
      this.setData({ needTagsLoading: true, needTagsError: '' })
      try {
        const tags = await customerTagApi.list('visit_need')
        if (!isCurrent()) return
        const options = (tags || []).concat((this.data.myNote && this.data.myNote.need_tags || [])
          .filter(tag => !(tags || []).some(item => item.id === tag.id)))
        this.setData({ needTagOptions: options.map(tag => ({ ...tag, selected: this.data.needTagIds.includes(tag.id) })), needTagsLoading: false })
      } catch (error) {
        if (isCurrent()) this.setData({ needTagsLoading: false, needTagsError: error.message || '需求标签加载失败' })
      }
    },
    onToggleNeedTag(e) {
      if (this.data.saving) return
      const id = e.currentTarget.dataset.id
      if (!this.data.needTagOptions.some(tag => tag.id === id)) return
      const ids = this.data.needTagIds.includes(id) ? this.data.needTagIds.filter(value => value !== id) : this.data.needTagIds.concat(id)
      this.setData({ needTagIds: ids, needTagOptions: this.data.needTagOptions.map(tag => ({ ...tag, selected: ids.includes(tag.id) })) })
    },
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
              timeText: formatNoteTime(note.updated_at || note.created_at),
              followUpDateText: formatPlanDate(note.next_follow_up_date),
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
      const user = getApp().globalData.currentUser || {}
      const mine = this.data.myNote
      const now = new Date()
      this.setData({
        editorOpen: true,
        editorValue: mine ? mine.content : '',
        needTagIds: (mine && mine.need_tags || []).map(tag => tag.id),
        needTagOptions: [],
        needTagsError: '',
        nextFollowUpPersonId: mine ? mine.next_follow_up_person_id || '' : '',
        // 已保存的空值必须保持为空；仅首次新建默认当前账号本人。
        nextFollowUpPerson: mine ? mine.next_follow_up_person || '' : user.owner || user.username || '',
        nextFollowUpDate: mine ? mine.next_follow_up_date || '' : '',
        nextFollowUpDateText: formatPlanDate(mine && mine.next_follow_up_date),
        datePickerToday: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        followUpSearch: '', followUpSearchOpen: false,
        previousOpen: false,
        previousNeed: null,
        previousError: '',
        visitPurpose: null,
        visitPurposeOpen: false,
        visitPurposeError: '',
      })
      this.loadFeedbackPeople()
      if (this.properties.category === 'visit_need' && this.data.showNeedTags) this.loadNeedTags()
      if (this.properties.category === 'follow_up') this.loadFollowUpPeople()
    },

    async loadFollowUpPeople() {
      const isCurrent = beginRead(this, 'followUpPeople', () => this.data.editorOpen && this.properties.category === 'follow_up')
      this.setData({ followUpPeopleLoading: true, followUpPeopleError: '' })
      try {
        const people = await visitNoteApi.followUpPeople()
        if (!isCurrent()) return
        this.setData({ followUpPeople: people || [] })
        this.filterFollowUpPeople()
      } catch (error) {
        if (isCurrent()) this.setData({ followUpPeopleError: error.message || '人员加载失败，点击重试' })
      } finally {
        if (isCurrent()) this.setData({ followUpPeopleLoading: false })
      }
    },

    filterFollowUpPeople() {
      const query = this.data.followUpSearch.trim().toLowerCase()
      const matches = this.data.followUpPeople.filter(person => !query
        || (person.nickname || '').toLowerCase().includes(query)
        || (person.name || '').toLowerCase().includes(query))
      this.setData({ followUpMatches: matches.slice(0, 50), followUpMatchCount: matches.length })
    },

    onFollowUpSearchFocus() {
      this.setData({ followUpSearchOpen: true, followUpSearch: this.data.nextFollowUpPerson })
      this.filterFollowUpPeople()
    },

    onFollowUpSearchInput(event) {
      const value = event.detail.value
      this.setData({ followUpSearch: value })
      if (!value.trim()) this.setData({ nextFollowUpPersonId: '', nextFollowUpPerson: '' })
      this.filterFollowUpPeople()
    },

    onFollowUpSearchConfirm() {
      const query = this.data.followUpSearch.trim().toLowerCase()
      if (!query) return this.onCloseFollowUpSearch()
      const matches = this.data.followUpPeople.filter(person => (person.nickname || '').toLowerCase() === query
        || (person.name || '').toLowerCase() === query)
      if (matches.length !== 1) {
        wx.showToast({ title: '请从搜索结果中选择人员', icon: 'none' })
        return
      }
      this.selectFollowUpPerson(matches[0])
    },

    onSelectFollowUpPerson(event) {
      const person = this.data.followUpPeople.find(person => person.id === event.currentTarget.dataset.id)
      if (person) this.selectFollowUpPerson(person)
    },

    selectFollowUpPerson(person) {
      this.setData({ nextFollowUpPersonId: person.id, nextFollowUpPerson: person.nickname || person.name,
        followUpSearchOpen: false, followUpSearch: '' })
    },

    onClearFollowUpPerson() {
      this.setData({ nextFollowUpPersonId: '', nextFollowUpPerson: '', followUpSearch: '', followUpSearchOpen: false })
    },

    onCloseFollowUpSearch() {
      this.setData({ followUpSearchOpen: false, followUpSearch: '' })
    },

    onFollowUpDateChange(event) { this.setData({ nextFollowUpDate: event.detail.value, nextFollowUpDateText: formatPlanDate(event.detail.value) }) },
    onClearFollowUpDate() { this.setData({ nextFollowUpDate: '', nextFollowUpDateText: '' }) },

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
      ;['previousNeed', 'visitPurpose', 'feedbackPeople', 'followUpPeople', 'needTags'].forEach(key => invalidateRead(this, key))
      this.setData({
        editorOpen: false,
        editorValue: '',
        followUpSearchOpen: false,
        followUpPeopleLoading: false,
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
      const clearingNeed = this.properties.category === 'visit_need' && this.data.myNote && !content && !this.data.needTagIds.length
      if ((!content && !(this.properties.category === 'visit_need' && this.data.needTagIds.length) && !clearingNeed) || this.data.saving) return
      if (this.properties.category === 'follow_up' && this.data.followUpSearchOpen) {
        const query = this.data.followUpSearch.trim()
        if (query && query !== this.data.nextFollowUpPerson) {
          const matches = this.data.followUpPeople.filter(person => person.nickname === query || person.name === query)
          if (matches.length !== 1) {
            wx.showToast({ title: '请从搜索结果中选择人员', icon: 'none' })
            return
          }
          this.selectFollowUpPerson(matches[0])
        }
      }
      const attribution = attributionFromPicker(this.data.feedbackOptions, this.data.feedbackIndex)
      if (this.properties.category === 'visit_need') attribution.need_tag_ids = this.data.needTagIds.slice()
      if (this.properties.category === 'follow_up') Object.assign(attribution, {
        next_follow_up_person_id: this.data.nextFollowUpPersonId,
        next_follow_up_person: this.data.nextFollowUpPerson,
        next_follow_up_date: this.data.nextFollowUpDate,
      })
      this.setData({ saving: true })
      try {
        if (clearingNeed) {
          await visitNoteApi.delete(this.data.myNote.id)
        } else if (this.data.myNote) {
          await visitNoteApi.update(this.data.myNote.id, content, attribution)
        } else {
          await visitNoteApi.create({
            visit_id: this.properties.visitId,
            category: this.properties.category,
            content,
            ...attribution,
          })
        }
        invalidateRead(this, 'followUpPeople')
        this.setData({ editorOpen: false, editorValue: '', followUpSearchOpen: false, followUpPeopleLoading: false })
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
