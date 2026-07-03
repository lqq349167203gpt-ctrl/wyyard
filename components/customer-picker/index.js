const { visitApi } = require('../../utils/api')
const { debounce } = require('../../utils/util')

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
  },

  methods: {
    onInput(e) {
      const keyword = e.detail.value
      this.setData({ keyword })
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
      try {
        const results = await visitApi.searchCustomers(keyword)
        this.setData({ results: results || [], searching: false })
      } catch (e) {
        this.setData({ results: [], searching: false })
      }
    },

    onSelect(e) {
      const customer = e.currentTarget.dataset.customer
      this.setData({
        keyword: '',
        results: [],
        showDropdown: false,
      })
      this.triggerEvent('select', { customer })
    },

    onClear() {
      this.setData({ keyword: '' })
      this.triggerEvent('clear')
    },
  },
})
