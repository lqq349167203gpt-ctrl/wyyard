const FAB_SIZE_RPX = 104
const DEFAULT_RIGHT_RPX = 32
const DEFAULT_BOTTOM_RPX = 200
const EDGE_INSET_RPX = 24

Component({
  properties: {
    storageKey: {
      type: String,
      value: 'draggable-fab-position',
    },
  },

  data: {
    x: 0,
    y: 0,
    ready: false,
  },

  lifetimes: {
    attached() {
      this._restorePosition()
    },
    detached() {
      if (this._saveTimer) clearTimeout(this._saveTimer)
    },
  },

  pageLifetimes: {
    show() {
      // tab 页面通常不会销毁；每次重新显示时都重新校正，避免旧坐标落到可视区外。
      this._restorePosition()
    },
  },

  methods: {
    _windowInfo() {
      if (wx.getWindowInfo) return wx.getWindowInfo()
      return wx.getSystemInfoSync()
    },

    _bounds() {
      const info = this._windowInfo()
      const width = Number(info.windowWidth) || 375
      const height = Number(info.windowHeight) || 667
      const rpx = width / 750
      const size = FAB_SIZE_RPX * rpx
      return {
        width,
        height,
        size,
        defaultX: width - size - DEFAULT_RIGHT_RPX * rpx,
        defaultY: height - size - DEFAULT_BOTTOM_RPX * rpx,
      }
    },

    _clampPosition(position) {
      const bounds = this._bounds()
      const edgeInset = EDGE_INSET_RPX * (bounds.width / 750)
      const maxX = Math.max(edgeInset, bounds.width - bounds.size - edgeInset)
      const maxY = Math.max(edgeInset, bounds.height - bounds.size - edgeInset)
      return {
        x: Math.max(edgeInset, Math.min(maxX, Number(position.x) || 0)),
        y: Math.max(edgeInset, Math.min(maxY, Number(position.y) || 0)),
      }
    },

    _restorePosition() {
      const bounds = this._bounds()
      let saved = null
      try {
        saved = wx.getStorageSync(this.properties.storageKey)
      } catch (error) {
        saved = null
      }
      const position = saved && typeof saved === 'object'
        ? this._clampPosition(saved)
        : this._clampPosition({ x: bounds.defaultX, y: bounds.defaultY })
      this.setData({ ...position, ready: true })
    },

    onMove(event) {
      if (event.detail.source !== 'touch') return
      const position = this._clampPosition(event.detail)
      this._lastPosition = position
      if (this._saveTimer) clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(() => {
        try {
          wx.setStorageSync(this.properties.storageKey, this._lastPosition)
        } catch (error) {
          // 存储失败不影响拖动和点击。
        }
      }, 120)
    },

    onTap() {
      this.triggerEvent('tap')
    },

    onLongPress() {
      this.triggerEvent('longpress')
    },
  },
})
