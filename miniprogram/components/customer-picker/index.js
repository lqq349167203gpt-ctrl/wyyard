const { visitApi } = require('../../utils/api')
const { debounce } = require('../../utils/util')
const { beginRead, invalidateRead, disposeReads } = require('../../utils/read-scope')

Component({
  properties: {
    value: { type: Object, value: null },
  },

  data: {
    keyword: '',
    results: [],
    showDropdown: false,
    searching: false,
  },

  lifetimes: {
    attached() {
      this._search = debounce(this.doSearch.bind(this), 300)
    },
    detached() { disposeReads(this) },
  },

  methods: {
    onInput(e) {
      invalidateRead(this, 'search')
      const keyword = e.detail.value
      this.setData({ keyword, searchError: '' })
      if (keyword.trim()) {
        this.setData({ searching: true, showDropdown: true })
        this._search(keyword.trim())
      } else {
        this.setData({ results: [], showDropdown: false, searching: false })
      }
    },

    onFocus() {
      if (this.data.keyword.trim() && this.data.results.length > 0) {
        this.setData({ showDropdown: true })
      }
    },

    onBlur() {
      setTimeout(() => {
        this.setData({ showDropdown: false })
      }, 200)
    },

    async doSearch(keyword) {
      if (this._readsDisposed || keyword !== this.data.keyword.trim()) return
      const isCurrent = beginRead(this, 'search', () => keyword === this.data.keyword.trim())
      try {
        const results = await visitApi.searchCustomers(keyword)
        if (!isCurrent()) return
        this.setData({ results: results || [], searching: false })
      } catch (e) {
        if (!isCurrent()) return
        this.setData({ results: [], searching: false, searchError: e.message || '搜索失败，点击重试' })
      }
    },

    onSelect(e) {
      invalidateRead(this, 'search')
      const customer = e.currentTarget.dataset.customer
      this.setData({
        keyword: '',
        results: [],
        showDropdown: false,
        searching: false,
      })
      this.triggerEvent('select', { customer })
    },

    onClear() {
      invalidateRead(this, 'search')
      this.setData({ keyword: '', results: [], searching: false, showDropdown: false })
      this.triggerEvent('clear')
    },

    retrySearch() {
      this.setData({ searching: true, searchError: '' })
      return this.doSearch(this.data.keyword.trim())
    },
  },
})
