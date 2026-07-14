const { request, customerApi } = require('../../utils/api')

const recorderManager = wx.getRecorderManager()
let _msgId = 0

Page({
  data: {
    mode: 'customer',
    inputMode: 'text',
    isRecording: false,
    inputText: '',
    messages: [],
    scrollTarget: '',
    scrollTop: 0,
    kbHeight: 0,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return
    const mode = options.mode || 'customer'
    this.setData({
      mode,
      _date: options.date || '',
      _spaceId: options.spaceId || '',
    })
    this._loadMessages()
    wx.setNavigationBarTitle({ title: mode === 'visit' ? '邀约助手' : mode === 'activity' ? '课表助手' : '客户助手' })

    recorderManager.onStop((res) => {
      if (this._recordCancelled) {
        this._recordCancelled = false
        return
      }
      if (!res.tempFilePath) {
        this._addMsg({ type: 'error', text: '录音失败，请重试' })
        return
      }
      this._addMsg({ type: 'thinking', text: '正在识别语音...' })
      this._uploadAudio(res.tempFilePath)
    })

    recorderManager.onError((err) => {
      console.error('录音错误:', err)
      this._addMsg({ type: 'error', text: '录音失败' })
    })
  },

  onUnload() {
    this._saveMessages()
  },

  // ---------- 输入 ----------

  onTextInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onInputFocus(e) {
    this.setData({ kbHeight: e.detail.height || 0 })
  },

  onInputBlur() {
    this.setData({ kbHeight: 0 })
  },

  onTextSend() {
    const text = (this.data.inputText || '').trim()
    if (!text) return
    this._addMsg({ type: 'user', text })
    this.setData({ inputText: '' })
    this._handleMessage(text)
  },

  // ---------- 录音 ----------

  onRecordStart() {
    this._recordCancelled = false
    this.setData({ isRecording: true })
    recorderManager.start({
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
    })
  },

  onRecordStop() {
    if (!this.data.isRecording) return
    this.setData({ isRecording: false })
    recorderManager.stop()
  },

  onRecordCancel() {
    if (!this.data.isRecording) return
    this._recordCancelled = true
    this.setData({ isRecording: false })
    recorderManager.stop()
  },

  onSwitchToVoice() {
    this.setData({ inputMode: 'voice' })
  },

  onSwitchToText() {
    this.setData({ inputMode: 'text' })
  },

  // ---------- 直接保存/前往修改 ----------

  async onDirectSave(e) {
    const index = e.currentTarget.dataset.index
    const msg = this.data.messages[index]
    if (!msg || !msg.customerData) return

    const messages = this.data.messages.slice()
    messages[index] = Object.assign({}, messages[index], { status: 'saving' })
    this.setData({ messages })

    try {
      const data = msg.customerData
      if (data.id) {
        const UPDATE_FIELDS = [
          'nickname', 'name', 'gender', 'phone', 'wechat', 'age',
          'service_teacher', 'referrer', 'referrer_handler',
          'traffic_source', 'traffic_source_detail',
          'work_status', 'work_description',
          'basic_info', 'core_situation', 'tags', 'other_info',
        ]
        const updateData = {}
        for (const k of UPDATE_FIELDS) {
          if (data[k] !== undefined && data[k] !== null) updateData[k] = data[k]
        }
        await customerApi.update(data.id, updateData)
      } else {
        await customerApi.create(data)
      }
      const msgs = this.data.messages.slice()
      msgs[index] = Object.assign({}, msgs[index], { status: 'saved', _savedCustomerData: msgs[index].customerData, customerData: null })
      this.setData({ messages: msgs })
      this._addMsg({ type: 'ai', text: data.id ? '客户信息已更新！' : '客户已保存成功！' })
      this._notifyChanged()
    } catch (err) {
      console.error('[onDirectSave] 保存失败:', err.message)
      const msgs = this.data.messages.slice()
      msgs[index] = Object.assign({}, msgs[index], { status: 'pending' })
      this.setData({ messages: msgs })
      this._analyzeSaveError(err.message || '保存失败', msg.customerData)
    }
  },

  onContinueEdit(e) {
    const index = e.currentTarget.dataset.index
    const msg = this.data.messages[index]
    if (!msg || !msg._savedCustomerData) return
    const messages = this.data.messages.slice()
    messages[index] = Object.assign({}, messages[index], { status: 'pending', customerData: msg._savedCustomerData })
    this.setData({ messages })
  },

  onEditResult(e) {
    const index = e.currentTarget.dataset.index
    const msg = this.data.messages[index]
    if (!msg || !msg.customerData) return
    const app = getApp()
    if (app) app.globalData._voicePrefillBackup = msg.customerData
    wx.navigateTo({ url: `/pages/customer-form/index?id=${msg.customerData.id || ''}&action=voice` })
  },

  // ---------- 内部方法 ----------

  _addMsg(msg) {
    const id = 'msg-' + (++_msgId)
    const messages = this.data.messages.concat([Object.assign({}, msg, { id })])
    const scrollTop = this.data.scrollTop === 999999 ? 999998 : 999999
    this.setData({ messages, scrollTarget: id, scrollTop })
  },

  _removeThinking() {
    const messages = this.data.messages.filter(m => m.type !== 'thinking')
    this.setData({ messages })
  },

  async _uploadAudio(tempFilePath) {
    try {
      const fs = wx.getFileSystemManager()
      const base64 = fs.readFileSync(tempFilePath, 'base64')
      const asrResult = await request('/api/voice/transcribe', {
        method: 'POST',
        data: { audio_base64: base64, format: 'mp3' },
      })
      this._removeThinking()
      const text = asrResult.text
      if (!text) {
        this._addMsg({ type: 'error', text: '语音识别为空，请重新录音' })
        return
      }
      this._addMsg({ type: 'user', text })
      this._handleMessage(text)
    } catch (e) {
      console.error('语音解析失败:', e)
      this._removeThinking()
      this._addMsg({ type: 'error', text: e.message || '语音解析失败' })
    }
  },

  async _handleMessage(text) {
    const mode = this.data.mode
    const history = this._buildChatHistory()
    this._addMsg({ type: 'thinking', text: '正在思考...' })

    try {
      let res
      if (mode === 'customer') {
        res = await request('/api/voice/customer-chat', {
          method: 'POST',
          data: { message: text, history },
        })
      } else if (mode === 'visit') {
        res = await request('/api/voice/visit-chat', {
          method: 'POST',
          data: { message: text, history, date: this.data._date, space_id: this.data._spaceId },
        })
      } else if (mode === 'activity') {
        res = await request('/api/voice/activity-chat', {
          method: 'POST',
          timeout: 120000,
          data: { message: text, history, date: this.data._date, space_id: this.data._spaceId },
        })
      }
      this._removeThinking()
      if (res && res.reply) {
        this._addMsg({ type: 'ai-text', text: res.reply })
      }
    } catch (err) {
      console.error('[voice-chat] 请求失败:', err)
      this._removeThinking()
      this._addMsg({ type: 'error', text: err.message || '请求失败' })
    }
  },

  _buildChatHistory() {
    const history = []
    for (const m of this.data.messages) {
      if (m.type === 'user') {
        history.push({ role: 'user', content: m.text })
      } else if (m.type === 'ai-text' || m.type === 'error') {
        history.push({ role: 'assistant', content: m.text })
      } else if (m.type === 'ai' && m.fields && m.fields.length) {
        const summary = m.fields.map(f => `${f.label}：${f.value}`).join('，')
        history.push({ role: 'assistant', content: `识别结果：${summary}` })
      }
    }
    return history
  },

  _saveMessages() {
    const msgs = this.data.messages
    if (!msgs || msgs.length === 0) return
    try {
      const app = getApp()
      const userId = app?.globalData?.currentUser?.id || 'default'
      const key = `chat_history_${userId}_${this.data.mode}`
      wx.setStorageSync(key, JSON.stringify(msgs))
    } catch (e) {
      console.error('[voice-chat] 保存聊天记录失败:', e)
    }
  },

  _loadMessages() {
    try {
      const app = getApp()
      const userId = app?.globalData?.currentUser?.id || 'default'
      const key = `chat_history_${userId}_${this.data.mode}`
      const raw = wx.getStorageSync(key)
      if (raw) {
        const messages = JSON.parse(raw)
        this.setData({ messages })
        if (messages.length) {
          wx.nextTick(() => this.setData({ scrollTop: 999999 }))
        }
      }
    } catch (e) {
      console.error('[voice-chat] 读取聊天记录失败:', e)
    }
  },

  _notifyChanged() {
    const pages = getCurrentPages()
    if (pages.length >= 2) {
      const prev = pages[pages.length - 2]
      if (prev) prev._needRefresh = true
    }
  },

  async _analyzeSaveError(errorMsg, previousData) {
    this._addMsg({ type: 'user', text: `[系统] 保存失败：${errorMsg}` })
    this._addMsg({ type: 'thinking', text: '正在分析失败原因...' })
    try {
      const data = await request('/api/voice/analyze-save-error', {
        method: 'POST',
        data: { error: errorMsg, previous_data: previousData || {} },
      })
      this._removeThinking()
      if (data.suggestion) {
        this._addMsg({ type: 'ai-text', text: data.suggestion })
      }
      if (data.corrected_data) {
        this._showFieldsMsg(data.corrected_data, true)
      }
    } catch (e) {
      this._removeThinking()
      this._addMsg({ type: 'error', text: `保存失败：${errorMsg}。请修改后重试。` })
    }
  },

  _showFieldsMsg(data, skipValidate) {
    const FIELD_LABELS = {
      nickname: '昵称', name: '姓名', gender: '性别', phone: '电话',
      wechat: '微信', age: '年龄', service_teacher: '服务老师',
      referrer: '引流人', referrer_handler: '承接人',
      traffic_source: '流量来源', traffic_source_detail: '来源详情',
      work_status: '工作情况', work_description: '工作描述',
      basic_info: '创伤经历', core_situation: '当下卡点',
      tags: '到访目的', other_info: '其他信息',
    }
    const fields = Object.entries(data)
      .filter(([k, v]) => v && typeof v === 'string' && v.trim() && k !== 'recognized_text')
      .map(([key, value]) => ({ key, label: FIELD_LABELS[key] || key, value }))

    if (fields.length === 0) {
      this._addMsg({ type: 'error', text: '未能识别到客户信息，请描述得更具体一些' })
      return
    }

    const id = 'msg-' + (++_msgId)
    const messages = this.data.messages.concat([{
      id,
      type: 'ai',
      fields,
      customerData: data,
      status: skipValidate || data.id ? 'pending' : 'pending',
      errorMsg: '',
    }])
    this.setData({ messages, scrollTarget: id, scrollTop: 999999 })
  },
})
