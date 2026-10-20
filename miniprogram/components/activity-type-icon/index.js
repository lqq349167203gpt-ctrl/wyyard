const { TYPES, defaultIcon, loadIcons } = require('../../utils/activity-icons')
Component({
  properties: { size: { type: Number, value: 56 }, source: { type: String, value: '', observer() { if (this._attached) this.refresh() } } },
  data: { src: '/images/activity-types/class.png' },
  lifetimes: {
    attached() { this._attached = true; this.refresh() },
    detached() { this._attached = false },
  },
  pageLifetimes: { show() { if (this._attached) this.refresh() } },
  methods: {
    refresh() {
      const source = this.properties.source
      this.setData({ src: defaultIcon(source) })
      loadIcons().then(icons => {
        if (this._attached && this.properties.source === source) this.setData({ src: icons[TYPES[source]] || defaultIcon(source) })
      }).catch(() => { /* 网络失败时继续使用随包图标，不影响课程读取。 */ })
    },
    onError() { const src = defaultIcon(this.properties.source); if (this.data.src !== src) this.setData({ src }) },
  },
})
