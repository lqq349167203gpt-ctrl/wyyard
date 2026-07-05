const { request, customerApi } = require('../../utils/api')

const recorderManager = wx.getRecorderManager()
let _msgId = 0

Component({
  properties: {
    show: { type: Boolean, value: false },
    mode: { type: String, value: 'customer' },  // 'customer' | 'visit' | 'activity'
  },

  data: {
    inputMode: 'text',   // 'text' | 'voice'
    isRecording: false,
    inputText: '',
    messages: [],
    scrollTarget: '',
    scrollTop: 0,
  },

  lifetimes: {
    attached() {
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
    detached() {
      this._stopRecord()
    },
  },

  observers: {
    show(val) {
      if (val) {
        const saved = this._loadMessages()
        this.setData({
          inputMode: 'text',
          isRecording: false,
          inputText: '',
          messages: saved,
          scrollTarget: '',
          scrollTop: 0,
        })
        if (saved.length) {
          wx.nextTick(() => {
            this.setData({ scrollTop: 999999 })
          })
        }
        // 检查是否有保存失败的错误需要反馈
        const app = getApp()
        if (app && app.globalData._voiceSaveError) {
          const errorMsg = app.globalData._voiceSaveError
          const previousData = app.globalData._voicePrefillBackup
          app.globalData._voiceSaveError = null
          app.globalData._voicePrefillBackup = null
          this._analyzeSaveError(errorMsg, previousData)
        }
      } else {
        this._stopRecord()
      }
    },
  },

  methods: {
    onOverlayTap() { this._close() },
    onContentTap() {},

    onSwitchToVoice() {
      this.setData({ inputMode: 'voice' })
    },

    onSwitchToText() {
      this.setData({ inputMode: 'text' })
    },

    onTextInput(e) {
      this.setData({ inputText: e.detail.value })
    },

    onTextSend() {
      const text = (this.data.inputText || '').trim()
      if (!text) return
      this._addMsg({ type: 'user', text })
      this.setData({ inputText: '' })

      // visit/activity/customer 模式：触发 chat 事件，由父页面处理
      if (this.data.mode === 'visit' || this.data.mode === 'activity' || this.data.mode === 'customer') {
        this._addMsg({ type: 'thinking', text: '正在思考...' })
        this.triggerEvent('chat', { message: text, history: this._buildChatHistory() })
        return
      }

      // customer 模式：找到最近一条 AI 识别结果
      const lastAiMsg = this.data.messages.slice().reverse().find(m => m.type === 'ai' && m.customerData)
      console.log('[onTextSend] lastAiMsg found:', !!lastAiMsg, 'id:', lastAiMsg?.customerData?.id, 'messages count:', this.data.messages.length)

      if (lastAiMsg) {
        // 弹窗内已有数据，走修改流程
        this._addMsg({ type: 'thinking', text: '正在修改客户信息...' })
        this._modifyCustomerData(lastAiMsg.customerData, text)
      } else {
        // 没有弹窗内数据，先尝试从数据库查找修改，找不到再提取
        this._addMsg({ type: 'thinking', text: '正在分析...' })
        this._tryModifyOrParse(text)
      }
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

    // ---------- 直接保存/前往修改 ----------

    async onDirectSave(e) {
      const index = e.currentTarget.dataset.index
      const msg = this.data.messages[index]
      console.log('[onDirectSave] index:', index, 'customerData:', JSON.stringify(msg?.customerData))
      if (!msg || !msg.customerData) return

      // 标记为保存中
      const messages = this.data.messages.slice()
      messages[index] = Object.assign({}, messages[index], {status: 'saving'})
      this.setData({ messages })

      try {
        const data = msg.customerData
        if (data.id) {
          // 已有客户，走更新（只保留允许的字段，StrictBaseModel 拒绝额外字段）
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
          // 新客户，走创建
          await customerApi.create(data)
        }
        // 保存成功：清掉 customerData 防止后续输入被当成修改同一个人
        const msgs = this.data.messages.slice()
        msgs[index] = Object.assign({}, msgs[index], {status: 'saved', _savedCustomerData: msgs[index].customerData, customerData: null})
        this.setData({ messages: msgs })
        this._addMsg({ type: 'ai', text: data.id ? '客户信息已更新！你可以继续录入新客户，或关闭窗口。' : '客户已保存成功！你可以继续录入新客户，或关闭窗口。' })
      } catch (err) {
        console.error('[onDirectSave] 保存失败:', err.message, err)
        // 保存失败，恢复 pending 状态
        const msgs = this.data.messages.slice()
        msgs[index] = Object.assign({}, msgs[index], {status: 'pending'})
        this.setData({ messages: msgs })

        const errorMsg = err.message || '保存失败'
        this._analyzeSaveError(errorMsg, msg.customerData)
      }
    },

    onContinueEdit(e) {
      const index = e.currentTarget.dataset.index
      const msg = this.data.messages[index]
      if (!msg || !msg._savedCustomerData) return

      // 恢复 customerData 并重置为 pending 状态
      const messages = this.data.messages.slice()
      messages[index] = Object.assign({}, messages[index], {status: 'pending', customerData: msg._savedCustomerData})
      this.setData({ messages })
    },

    onEditResult(e) {
      const index = e.currentTarget.dataset.index
      const msg = this.data.messages[index]
      if (!msg || !msg.customerData) return

      // 备份数据，以便保存失败时 AI 可以分析
      const app = getApp()
      if (app) app.globalData._voicePrefillBackup = msg.customerData

      this.triggerEvent('done', { customerData: msg.customerData, action: 'edit' })
    },

    // ---------- 内部方法 ----------

    _addMsg(msg) {
      const id = 'msg-' + (++_msgId)
      const messages = this.data.messages.concat([Object.assign({}, msg, {id})])
      const scrollTop = this.data.scrollTop === 999999 ? 999998 : 999999
      this.setData({ messages, scrollTarget: id, scrollTop })
    },

    _removeThinking() {
      const messages = this.data.messages.filter(m => m.type !== 'thinking')
      this.setData({ messages })
    },

    _updateThinking(text) {
      const messages = this.data.messages.map(m =>
        m.type === 'thinking' ? Object.assign({}, m, {text}) : m
      )
      this.setData({ messages })
    },

    async _uploadAudio(tempFilePath) {
      try {
        const fs = wx.getFileSystemManager()
        const base64 = fs.readFileSync(tempFilePath, 'base64')

        // 1. 先做 ASR（纯语音转文字）
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

        // visit/activity/customer 模式：触发 chat 事件
        if (this.data.mode === 'visit' || this.data.mode === 'activity' || this.data.mode === 'customer') {
          this._addMsg({ type: 'thinking', text: '正在思考...' })
          this.triggerEvent('chat', { message: text, history: this._buildChatHistory() })
          return
        }

        // 2. customer 模式：判断走修改还是提取
        const lastAiMsg = this.data.messages.slice().reverse().find(m => m.type === 'ai' && m.customerData)

        if (lastAiMsg) {
          // 弹窗内已有客户数据，走修改流程
          this._addMsg({ type: 'thinking', text: '正在修改客户信息...' })
          await this._modifyCustomerData(lastAiMsg.customerData, text)
        } else {
          // 没有弹窗内数据，走和文字输入一样的逻辑
          this._addMsg({ type: 'thinking', text: '正在分析...' })
          await this._tryModifyOrParse(text)
        }
      } catch (e) {
        console.error('语音解析失败:', e)
        this._removeThinking()
        const msg = e.message || '语音解析失败'
        this._addMsg({ type: 'error', text: msg })
      }
    },

    async _sendTextToBackend(text) {
      try {
        const data = await request('/api/voice/parse-customer', {
          method: 'POST',
          data: { text },
        })
        this._removeThinking()
        this._addResultMsg(data)
      } catch (e) {
        console.error('解析失败:', e)
        this._removeThinking()
        const msg = e.message || 'AI 解析失败'
        this._addMsg({ type: 'error', text: msg })
      }
    },

    async _modifyCustomerData(currentData, instruction) {
      try {
        console.log('[modify] currentData.id:', currentData?.id, 'instruction:', instruction)
        const data = await request('/api/voice/modify-customer', {
          method: 'POST',
          data: { current_data: currentData, instruction },
        })
        console.log('[modify] result.id:', data?.id)
        this._removeThinking()
        this._addMsg({ type: 'ai-text', text: '已按你的要求修改：' })
        this._addResultMsg(data)
      } catch (e) {
        console.error('修改失败:', e)
        this._removeThinking()
        const msg = e.message || '修改失败'
        this._addMsg({ type: 'error', text: msg })
      }
    },

    async _tryModifyOrParse(text) {
      // 先尝试从数据库查找客户并修改（静默模式，失败不弹 toast）
      try {
        console.log('[tryModifyOrParse] 尝试修改:', text)
        const data = await request('/api/voice/modify-customer', {
          method: 'POST',
          data: { current_data: {}, instruction: text },
          silent: true,
        })
        console.log('[tryModifyOrParse] 修改成功, id:', data?.id)
        this._removeThinking()
        this._addMsg({ type: 'ai-text', text: '已找到客户并修改：' })
        this._addResultMsg(data)
        return
      } catch (e) {
        console.log('[tryModifyOrParse] 修改失败，走提取:', e.message)
        // 未找到客户或不是修改指令，继续走提取流程
      }

      // 走首次提取流程
      try {
        const data = await request('/api/voice/parse-customer', {
          method: 'POST',
          data: { text },
        })
        this._removeThinking()
        this._addResultMsg(data)
      } catch (e) {
        console.error('解析失败:', e)
        this._removeThinking()
        const msg = e.message || 'AI 解析失败'
        this._addMsg({ type: 'error', text: msg })
      }
    },

    async _addResultMsg(data, skipValidate) {
      console.log('[_addResultMsg] data.id:', data?.id, 'skipValidate:', skipValidate)
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
        this._addMsg({ type: 'error', text: '未能识别到客户信息，请描述得更具体一些，例如："张三，女，28岁，电话13800110000"' })
        return
      }

      // AI 修正后的数据 或 修改已有客户：直接展示，不校验
      if (skipValidate || data.id) {
        this._showFieldsMsg(fields, data, 'pending')
        return
      }

      // 新客户：立即校验能否保存
      let canSave = true
      let saveError = ''
      try {
        const res = await request('/api/voice/validate-customer', {
          method: 'POST',
          data: { data },
        })
        if (!res.valid) {
          canSave = false
          saveError = res.error
        }
      } catch (e) {
        // 校验接口出错，不影响展示，仍允许保存
      }

      if (!canSave) {
        // 校验已明确原因，直接展示，不需要 AI 分析
        this._showFieldsMsg(fields, data, 'blocked', saveError)
      } else {
        this._showFieldsMsg(fields, data, 'pending')
      }
    },

    _showFieldsMsg(fields, data, status, errorMsg) {
      console.log('[_showFieldsMsg] data.id:', data?.id, 'status:', status, 'title:', data?.id ? '已找到客户，修改后信息如下' : '我识别到以下信息')
      const id = 'msg-' + (++_msgId)
      const messages = this.data.messages.concat([{
        id,
        type: 'ai',
        fields,
        customerData: data,
        status,
        errorMsg: errorMsg || '',
      }])
      this.setData({ messages, scrollTarget: id, scrollTop: 999999 })
    },

    _stopRecord() {
      try { recorderManager.stop() } catch (e) { /* ignore */ }
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

        // 先显示 AI 的建议文字
        if (data.suggestion) {
          this._addMsg({ type: 'ai-text', text: data.suggestion })
        }

        // 再显示修正后的数据（带操作按钮，跳过校验避免循环）
        if (data.corrected_data) {
          this._addResultMsg(data.corrected_data, true)
        }
      } catch (e) {
        this._removeThinking()
        this._addMsg({ type: 'error', text: `保存失败：${errorMsg}。请修改后重试。` })
      }
    },

    _close() {
      this._recordCancelled = true
      this._stopRecord()
      // 保存前去掉 thinking 状态的消息，避免重新打开时卡在"正在思考"
      const msgs = this.data.messages.filter(m => m.type !== 'thinking')
      try {
        wx.setStorageSync(this._getStorageKey(), JSON.stringify(msgs))
      } catch (e) {
        console.error('[voice-popup] 保存聊天记录失败:', e)
      }
      this.setData({ isRecording: false, inputText: '', messages: [] })
      this.triggerEvent('close')
    },

    _getStorageKey() {
      const app = getApp()
      const userId = app?.globalData?.currentUser?.id || 'default'
      return `chat_history_${userId}_${this.data.mode}`
    },

    _saveMessages() {
      const msgs = this.data.messages
      if (!msgs || msgs.length === 0) return
      try {
        wx.setStorageSync(this._getStorageKey(), JSON.stringify(msgs))
      } catch (e) {
        console.error('[voice-popup] 保存聊天记录失败:', e)
      }
    },

    _loadMessages() {
      try {
        const raw = wx.getStorageSync(this._getStorageKey())
        if (raw) return JSON.parse(raw)
      } catch (e) {
        console.error('[voice-popup] 读取聊天记录失败:', e)
      }
      return []
    },

    // ---------- visit 模式：构建对话历史 ----------

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

    // ---------- visit 模式：父页面调用 ----------

    setReply(text) {
      this._removeThinking()
      this._addMsg({ type: 'ai-text', text })
    },

    setError(text) {
      this._removeThinking()
      this._addMsg({ type: 'error', text })
    },
  },
})
