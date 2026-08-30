const { customerApi, customerTagApi, communicationRecordApi } = require('../../utils/api')
const { isAreaViewOnly } = require('../../utils/record-ownership')

function formatMoney(value) {
  return '¥' + String(Math.round(value || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const ACTIVITY_SUMMARY_TYPES = [
  { key: 'class', label: '沙龙活动' },
  { key: 'gcs', label: '觉醒游戏' },
  { key: 'ers', label: '情绪释放' },
  { key: 'eks', label: '能量结' },
  { key: 'ics', label: '内部课程' },
]

function buildActivitySummary(activities, serverSummary) {
  const serverItems = Array.isArray(serverSummary) ? serverSummary : []
  const items = ACTIVITY_SUMMARY_TYPES.map(item => {
    const serverItem = serverItems.find(summary => summary.key === item.key)
    const count = serverItem
      ? Number(serverItem.count || 0)
      : activities.filter(activity => (
        activity.activity_type === item.key
        && activity.participated === true
        && !activity.withdrawn
      )).length
    return Object.assign({}, item, { count })
  })
  const serverWithdrawn = serverItems.find(summary => summary.key === 'withdrawn')
  items.push({
    key: 'withdrawn',
    label: '退课',
    count: serverWithdrawn
      ? Number(serverWithdrawn.count || 0)
      : activities.filter(activity => activity.withdrawn).length,
  })
  return items.filter(item => item.count > 0)
}

function normalizePurchaseItem(item, key) {
  const isOfflineCourse = item.type === '线下落地课程'
  const remaining = item.remaining
  const total = item.total_purchased
  const voided = !!item.voided

  let _remainingNum = ''
  let _totalText = ''
  let _specialText = ''
  let _specialCls = ''

  if (isOfflineCourse) {
    _specialText = `已上课 ${item.attended_count || 0} 次`
    _specialCls = 'remain-used'
  } else if (voided || remaining === '已退费') {
    _specialText = '已退费'
    _specialCls = 'remain-used'
  } else if (remaining === '不限' || remaining === undefined || remaining === null) {
    _specialText = '不限次'
    _specialCls = 'remain'
  } else if (typeof remaining === 'number' && remaining <= 0) {
    _specialText = '已用完'
    _specialCls = 'remain-used'
  } else {
    _remainingNum = remaining
    _totalText = (total === '不限' || total === undefined || total === null) ? '不限' : (total + ' 次')
  }

  const dateRange = [item.effective_date, item.expiry_date].filter(Boolean).join(' ~ ')

  return Object.assign({}, item, {
    _key: key,
    _isOfflineCourse: isOfflineCourse,
    _displayName: item.name || item.type,
    _remainingNum,
    _totalText,
    _specialText,
    _specialCls,
    _dateRange: dateRange,
    _debtCount: item.debt_count || 0,
    _debtActivities: item.debt_activities || [],
  })
}

// 扁平化卡次条目：每张会员卡/每个项目各占一行，历史欠卡只挂在首张会员卡上
function buildPurchaseSummary(items) {
  const result = []
  let debtShown = false

  items.forEach((item, index) => {
    const normalized = normalizePurchaseItem(item, `${item.type}-${index}`)
    if (item.type === '会员卡' && (item.debt_count || 0) > 0) {
      if (!debtShown) {
        normalized._showDebt = true
        debtShown = true
      }
    }
    result.push(normalized)
  })

  return result
}

Page({
  data: {
    customerId: '',
    customer: null,
    customerAccessPermissions: null,
    revealedContacts: { phone: false, wechat: false },
    customerTags: [],
    heroTag: '',
    loading: true,
    loadError: '',
    healerText: '',
    firstVisit: '',
    totalPayment: 0,
    totalPaymentText: '¥0',
    genderAgeText: '',
    workText: '',
    activities: [],
    activitySummary: buildActivitySummary([], []),
    commRecords: [],
    commContent: '',
    commSaving: false,
    healingRecords: [],
    arrivedCount: 0,
    cancelledCount: 0,
    absentCount: 0,
    purchaseSummary: [],
    paymentRecords: [],
    activityFollowups: [],
    offlineCourseRecords: [],
    trafficDetailLabel: '流量链接',
    activeTab: 'healing',
    tabs: [
      { key: 'healing', label: '跟进', count: 0 },
      { key: 'communication', label: '沟通', count: 0 },
      { key: 'activities', label: '活动', count: 0 },
      { key: 'purchase', label: '卡次', count: 0 },
      { key: 'offline_course', label: '课程', count: 0 },
      { key: 'payment', label: '交易', count: 0 },
    ],
    isViewOnly: false,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    this.setData({ isViewOnly: isAreaViewOnly('customers') })
    if (options.id) {
      this.setData({ customerId: options.id })
      this.loadData(options.id)
    } else {
      this.setData({ loading: false, loadError: '缺少客户信息，请返回后重试' })
    }
  },

  onShow() {
    if (!getApp().checkLogin()) return
    if (this._needRefresh && this.data.customerId) {
      this._needRefresh = false
      this.loadData(this.data.customerId)
    }
  },

  async loadData(id) {
    this.setData({
      loading: true,
      loadError: '',
      commRecords: [],
      revealedContacts: { phone: false, wechat: false },
    })
    try {
      const [detail, customerTags] = await Promise.all([
        customerApi.detail(id),
        customerTagApi.listForCustomer(id).catch(() => []),
      ])
      const c = detail.customer

      // 疗愈老师
      const healerIdentityText = (c.positions || [])
        .filter(p => ['成就君', '能量结老师', '课程老师'].includes(p))
        .join('、')
      const healerText = c.service_teacher || healerIdentityText

      const visitRecords = detail.visit_records || []
      const arrived = visitRecords.filter(v => v.arrived).sort((a, b) => a.visit_date.localeCompare(b.visit_date))
      const firstVisit = arrived.length > 0 ? arrived[0].visit_date : ''

      // 基本信息合并字段
      const gender = c.gender || ''
      const age = c.age ? (c.age + ' 岁') : ''
      const genderAgeText = gender && age ? (gender + ' · ' + age) : (gender || age)
      const workText = [c.work_status, c.work_description].filter(Boolean).join(' · ')

      const customerAccessPermissions = c.customer_access_permissions || null
      const totalPayment = c.total_payment == null
        ? null
        : Number(c.total_payment || 0)
      // 活动记录
      const activities = (detail.activities || []).map(function(a) {
        return Object.assign({}, a, {
          notArrived: a.participated === undefined ? !arrived.some(v => v.visit_date === a.date) : !a.participated,
        })
      })
      const activitySummary = buildActivitySummary(activities, detail.activity_summary)

      // 跟进点
      const healingRecords = visitRecords.map(v => {
        const hr = (detail.healing_records || []).find(r => r.date === v.visit_date)
        const ownVisitNeed = (v.visit_notes || []).find(note => note.category === 'visit_need')
        return Object.assign({}, v, {
          needs: ownVisitNeed ? ownVisitNeed.content : '',
          growth_record: (hr && hr.growth_record) || v.healing_notes || '',
        })
      })
      const arrivedCount = visitRecords.filter(v => v.arrived).length
      const cancelledCount = visitRecords.filter(v => v.cancelled).length
      const absentCount = visitRecords.length - arrivedCount - cancelledCount

      // 卡次统计：扁平化，每张卡/项目一行
      const purchaseSummary = buildPurchaseSummary(detail.purchase_summary || [])

      // 交易记录
      const paymentRecords = (detail.payment_records || []).sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))

      // 线下落地课程记录
      const offlineCourseRecords = detail.offline_course_records || []
      const activityFollowups = detail.activity_followups || []

      // 流量来源对应的详情标签
      const ts = c.traffic_source || ''
      let trafficDetailLabel = '流量链接'
      if (ts === '好友推荐') trafficDetailLabel = '推荐好友'
      else if (ts === '朋友圈') trafficDetailLabel = '所属人'
      else if (['小红书', '抖音', '公众号', '视频号'].includes(ts)) trafficDetailLabel = '内容链接'

      this.setData({
        customer: c,
        customerAccessPermissions,
        customerTags,
        heroTag: (customerTags[0] && customerTags[0].name) || '',
        healerText,
        firstVisit,
        totalPayment,
        totalPaymentText: totalPayment == null ? '—' : formatMoney(totalPayment),
        genderAgeText,
        workText,
        activities,
        activitySummary,
        healingRecords,
        arrivedCount,
        cancelledCount,
        absentCount,
        purchaseSummary,
        paymentRecords,
        activityFollowups,
        offlineCourseRecords,
        trafficDetailLabel,
        loading: false,
      })
      this.updateTabCounts()

      // 加载沟通记录
      if (c.nickname && (!customerAccessPermissions || customerAccessPermissions.detail_tabs.communication)) {
        this.loadCommunicationRecords(c.nickname)
      }
    } catch (e) {
      console.error('加载客户资料失败:', e)
      this.setData({
        loading: false,
        loadError: (e && e.message) || '客户资料加载失败',
      })
    }
  },

  updateTabCounts() {
    const { healingRecords, commRecords, activities, activityFollowups, purchaseSummary, offlineCourseRecords, paymentRecords, customerAccessPermissions } = this.data
    const access = customerAccessPermissions
    const tabs = [
      (!access || access.detail_tabs.follow_up) && { key: 'healing', label: '跟进', count: healingRecords.length },
      (!access || access.detail_tabs.communication) && { key: 'communication', label: '沟通', count: commRecords.length },
      (!access || access.detail_tabs.activities) && { key: 'activities', label: '活动', count: activities.length },
      (!access || access.detail_tabs.customer_followups) && { key: 'followups', label: '回访', count: activityFollowups.length },
      (!access || access.detail_tabs.card_statistics) && { key: 'purchase', label: '卡次', count: purchaseSummary.length },
      (!access || access.detail_tabs.offline_courses) && { key: 'offline_course', label: '课程', count: offlineCourseRecords.length },
      (!access || access.transaction_access === 'detail') && { key: 'payment', label: '交易', count: paymentRecords.length },
    ].filter(Boolean)
    const activeTab = tabs.some(tab => tab.key === this.data.activeTab)
      ? this.data.activeTab
      : ((tabs[0] && tabs[0].key) || '')
    this.setData({
      tabs,
      activeTab,
    })
  },

  onRetry() {
    if (this.data.customerId) this.loadData(this.data.customerId)
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.activeTab || this._tabSwitching) return

    const targetTab = this.data.tabs.find(tab => tab.key === key)
    const currentTab = this.data.tabs.find(tab => tab.key === this.data.activeTab)
    const shouldStabilize = targetTab && currentTab && targetTab.count === 0 && currentTab.count > 0
    const applyTab = () => {
      this.setData({ activeTab: key })
      this._tabSwitching = false
    }

    if (!shouldStabilize) {
      applyTab()
      return
    }

    this._tabSwitching = true
    const query = wx.createSelectorQuery()
    query.select('#record-tabs-anchor').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(result => {
      const anchorRect = result && result[0]
      const viewport = result && result[1]
      if (!anchorRect || !viewport || anchorRect.top >= -2) {
        applyTab()
        return
      }
      wx.pageScrollTo({
        scrollTop: Math.max(0, viewport.scrollTop + anchorRect.top),
        duration: 120,
        complete: applyTab,
      })
    })
  },

  onEditTap() {
    wx.navigateTo({ url: `/pages/customer-form/index?id=${this.data.customerId}` })
  },

  async onContactView(e) {
    const field = e.currentTarget.dataset.field
    try {
      const result = await customerApi.accessContact(this.data.customerId, field, 'view')
      this.setData({
        [`customer.${field}`]: result.value,
        [`revealedContacts.${field}`]: true,
      })
    } catch (error) {
      wx.showToast({ title: error.message || '查看失败', icon: 'none' })
    }
  },

  async onContactCopy(e) {
    const field = e.currentTarget.dataset.field
    try {
      const result = await customerApi.accessContact(this.data.customerId, field, 'copy')
      await new Promise((resolve, reject) => {
        wx.setClipboardData({ data: result.value, success: resolve, fail: reject })
      })
    } catch (error) {
      wx.showToast({ title: error.message || '复制失败', icon: 'none' })
    }
  },

  async loadCommunicationRecords(nickname) {
    try {
      const res = await communicationRecordApi.list(nickname)
      const list = Array.isArray(res) ? res : []
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      list.forEach(item => {
        if (item.created_at) {
          const d = new Date(item.created_at)
          item._dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        } else {
          item._dateStr = ''
        }
      })
      this.setData({ commRecords: list })
      this.updateTabCounts()
    } catch (e) {
      this.setData({ commRecords: [] })
      this.updateTabCounts()
    }
  },

  onCommunicationInput(e) {
    this.setData({ commContent: e.detail.value })
  },

  async onAddCommunication() {
    const nickname = this.data.customer && this.data.customer.nickname
    if (!nickname) {
      wx.showToast({ title: '客户昵称为空，无法新增', icon: 'none' })
      return
    }
    const content = this.data.commContent.trim()
    if (!content || this.data.commSaving) return
    this.setData({ commSaving: true })
    try {
      await communicationRecordApi.create({ customer_nickname: nickname, content })
      this.setData({ commContent: '' })
      wx.showToast({ title: '已新增', icon: 'success' })
      await this.loadCommunicationRecords(nickname)
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '新增失败', icon: 'none' })
    } finally {
      this.setData({ commSaving: false })
    }
  },

  onDeleteCommunication(e) {
    const id = e.currentTarget.dataset.id
    const record = this.data.commRecords.find(item => item.id === id)
    if (!record || !record.can_delete) return
    wx.showModal({
      title: '删除沟通记录',
      content: '确定删除这条由你新增的沟通记录吗？删除后可在操作日志中查看完整内容。',
      confirmColor: '#f54a45',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await communicationRecordApi.delete(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.loadCommunicationRecords(this.data.customer.nickname)
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '删除失败', icon: 'none' })
        }
      },
    })
  },
})
