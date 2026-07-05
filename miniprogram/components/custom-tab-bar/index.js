const staffTabs = [
  { pagePath: '/pages/customers/index', text: '客户', icon: 'tab-customers' },
  { pagePath: '/pages/visits/index', text: '邀约', icon: 'tab-invite' },
  { pagePath: '/pages/activities/index', text: '课表', icon: 'tab-schedule' },
  { pagePath: '/pages/me/index', text: '我的', icon: 'tab-me' },
]

Component({
  data: {
    tabs: staffTabs,
    current: 0,
  },

  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index
      const tab = this.data.tabs[idx]
      wx.switchTab({ url: tab.pagePath })
    },

    updateTabs() {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      const currentPath = '/' + (page ? page.route : '')
      const current = staffTabs.findIndex(t => t.pagePath === currentPath)
      this.setData({ tabs: staffTabs, current: current >= 0 ? current : 0 })
    },
  },
})
