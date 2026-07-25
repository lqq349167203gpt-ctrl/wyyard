const { clientApi } = require('../../utils/api')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    activity: {
      type: Object,
      value: null,
    },
  },

  data: {
    content: '',
    contentLength: 0,
    saving: false,
  },

  observers: {
    'visible, activity': function (visible, activity) {
      if (!visible || !activity) return
      const content = activity.followup_content || ''
      this.setData({
        content,
        contentLength: content.length,
        saving: false,
      })
    },
  },

  methods: {
    noop() {},

    onInput(e) {
      const content = e.detail.value || ''
      this.setData({
        content,
        contentLength: content.length,
      })
    },

    onClose() {
      if (this.data.saving) return
      this.triggerEvent('close')
    },

    async onSave() {
      if (this.data.saving) return
      const activity = this.properties.activity
      const content = (this.data.content || '').trim()
      if (!content) {
        wx.showToast({ title: '请填写回访内容', icon: 'none' })
        return
      }
      if (!activity || !activity.activity_type || !activity.session_id) {
        wx.showToast({ title: '活动信息不完整', icon: 'none' })
        return
      }

      this.setData({ saving: true })
      try {
        const record = await clientApi.saveActivityFollowup(
          activity.activity_type,
          activity.session_id,
          content,
        )
        wx.showToast({ title: activity.has_followup ? '已更新' : '已提交', icon: 'success' })
        this.triggerEvent('saved', { record })
      } catch (e) {
        // 请求层已展示错误信息
      } finally {
        this.setData({ saving: false })
      }
    },
  },
})
