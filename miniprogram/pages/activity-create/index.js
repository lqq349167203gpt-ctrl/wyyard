const {
  classRecordApi, courseTypeApi, spaceApi, customerApi, visitApi,
  groupCaseSessionApi, emotionalReleaseSessionApi,
  energyKnotSessionApi, internalCourseSessionApi,
} = require('../../utils/api')
const { formatDate } = require('../../utils/util')
const {
  ACTIVITY_TYPES, TYPE_LABELS, TEACHER_POSITION,
  SINGLE_TEACHER_TYPES, ICS_COURSE_TYPES,
} = require('../../utils/activity-constants')

Page({
  data: {
    // 活动类型
    activityType: 'class',
    unifiedTypes: [],
    unifiedIndex: 0,
    typeLabel: '',
    // 日期时间
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    // 空间/房间
    spaces: [],
    spaceIndex: 0,
    rooms: [],
    roomIndex: 0,
    // 课程（沙龙）
    courses: [],
    courseIndex: -1,
    // 内部课程类型
    icsCourses: ICS_COURSE_TYPES,
    icsCourseType: '',
    // 活动方式（沙龙/内部课程）
    activityModes: ['线下', '线上'],
    activityModeIndex: 0,
    // 案主（觉醒/情绪释放/能量结）
    ownerId: '',
    ownerName: '',
    // 老师（多选，class/eks/ics）
    teacherIds: [],
    teacherNames: [],
    teacherDisplay: '',
    // 成就君（单选，gcs/ers/ocr）
    achieverId: '',
    achieverName: '',
    // 公益（沙龙）
    isPublicWelfare: false,
    // 扣卡次数
    membershipDeductionCount: 1,
    // 发布到客户端
    isPublished: false,
    // 参与者
    participantIds: [],
    participantList: [],
    dayVisitors: [],
    // 名称
    activityName: '',
    // 描述
    description: '',
    // 销卡次数（eks）
    deductionCount: 1,
    // 客户数据
    allCustomers: [],
    // 统一搜索弹窗
    showPicker: false,
    pickerTitle: '',
    pickerMode: '', // 'teacher' | 'owner' | 'achiever'
    pickerKeyword: '',
    pickerList: [],
    // 类型选择弹窗
    showTypePicker: false,
    typePickerStep: 1,
    _pendingType: '',
    _pendingCourseName: '',
    saving: false,
  },

  async onLoad(options) {
    if (!getApp().checkLogin()) return
    if (options.date) this.setData({ date: options.date })
    const savedSpaceId = options.spaceId || ''
    await Promise.all([
      this.loadSpaces(savedSpaceId),
      this.loadCourses(),
      this.loadCustomers(),
    ])
    await this.loadDayVisitors(this.data.date)
  },

  async loadSpaces(savedSpaceId) {
    try {
      const spaces = await spaceApi.list()
      const spaceIndex = savedSpaceId
        ? Math.max(0, spaces.findIndex(s => s.id === savedSpaceId))
        : 0
      const space = spaces[spaceIndex]
      const rooms = space?.rooms || []
      this.setData({ spaces, spaceIndex, rooms, roomIndex: 0 })
    } catch (e) {
      console.error('加载空间失败:', e)
    }
  },

  async loadCourses() {
    try {
      const types = await courseTypeApi.list()
      const courses = types.map(t => ({ id: t.name, name: t.name }))
      const defaultIndex = courses.findIndex(c => c.name === '读书会')
      const courseIndex = defaultIndex >= 0 ? defaultIndex : -1

      // 构建合并列表：非 class 类型 + 课程类型
      const nonClassTypes = ACTIVITY_TYPES.filter(t => t.value !== 'class')
      const courseItems = courses.map(c => ({
        value: 'class', label: c.name, isType: false, courseName: c.name,
      }))
      const unifiedTypes = nonClassTypes.map(function(t) { return Object.assign({}, t, {isType: true}) }).concat(courseItems)

      // 计算 unifiedIndex
      let unifiedIndex = 0
      if (courseIndex >= 0) {
        unifiedIndex = unifiedTypes.findIndex(t => !t.isType && t.courseName === courses[courseIndex].name)
      }
      if (unifiedIndex < 0) unifiedIndex = 0

      const typeLabel = courseIndex >= 0 ? courses[courseIndex].name : '沙龙活动'
      this.setData({ courses, courseIndex, unifiedTypes, unifiedIndex, typeLabel })
    } catch (e) {
      console.error('加载课程类型失败:', e)
    }
  },

  async loadCustomers() {
    try {
      const customers = await customerApi.light()
      this.setData({ allCustomers: customers })
    } catch (e) {
      console.error('加载客户列表失败:', e)
    }
  },

  // ---------- 类型选择弹窗 ----------

  onTypePickerOpen() {
    this.setData({ showTypePicker: true, typePickerStep: 1 })
  },

  onTypePickerClose() {
    this.setData({ showTypePicker: false, typePickerStep: 1 })
  },

  onTypePickerBack() {
    this.setData({ typePickerStep: 1 })
  },

  onTypeSelect(e) {
    const value = e.currentTarget.dataset.value
    if (value === 'class' || value === 'ics') {
      // 预填当前已选课程名
      const pendingName = value === 'class'
        ? (this.data.courseIndex >= 0 ? this.data.courses[this.data.courseIndex]?.name || '' : '')
        : this.data.icsCourseType || ''
      this.setData({ typePickerStep: 2, _pendingType: value, _pendingCourseName: pendingName })
    } else {
      this.applyTypeSelection(value, -1)
      this.setData({ showTypePicker: false, typePickerStep: 1 })
    }
  },

  onCourseSelect(e) {
    const name = e.currentTarget.dataset.name
    const pendingType = this.data._pendingType
    if (pendingType === 'class') {
      const index = this.data.courses.findIndex(c => c.name === name)
      this.applyTypeSelection('class', index >= 0 ? index : -1)
    } else if (pendingType === 'ics' && name) {
      this.applyTypeSelection('ics', -1, name)
    }
    this.setData({ showTypePicker: false, typePickerStep: 1, _pendingType: '', _pendingCourseName: '' })
  },

  applyTypeSelection(activityType, courseIndex, icsCourseType) {
    let typeLabel, unifiedIndex, activityName
    if (activityType === 'class' && courseIndex >= 0) {
      const course = this.data.courses[courseIndex]
      typeLabel = course.name
      unifiedIndex = this.data.unifiedTypes.findIndex(t => !t.isType && t.courseName === course.name)
    } else if (activityType === 'ics' && icsCourseType) {
      typeLabel = icsCourseType
      unifiedIndex = this.data.unifiedTypes.findIndex(t => t.isType && t.value === 'ics')
      activityName = icsCourseType
    } else {
      typeLabel = TYPE_LABELS[activityType] || ''
      unifiedIndex = this.data.unifiedTypes.findIndex(t => t.isType && t.value === activityType)
    }
    if (unifiedIndex < 0) unifiedIndex = 0
    this.setData({
      unifiedIndex,
      activityType,
      courseIndex: activityType === 'class' ? courseIndex : -1,
      icsCourseType: icsCourseType || '',
      typeLabel,
      activityName: activityName || '',
      ownerId: '',
      ownerName: '',
      teacherIds: [],
      teacherNames: [],
      teacherDisplay: '',
      achieverId: '',
      achieverName: '',
      isPublicWelfare: false,
      activityModeIndex: 0,
      membershipDeductionCount: (activityType === 'eks' || activityType === 'ics') ? 0 : 1,
    })
  },

  // 日期/时间
  onDateChange(e) {
    this.setData({ date: e.detail.value })
    this.loadDayVisitors(e.detail.value)
  },
  onStartTimeChange(e) { this.setData({ startTime: e.detail.value }) },
  onEndTimeChange(e) { this.setData({ endTime: e.detail.value }) },

  // 空间/房间联动
  onSpaceChange(e) {
    const spaceIndex = e.detail.value
    const space = this.data.spaces[spaceIndex]
    const rooms = space?.rooms || []
    this.setData({ spaceIndex, rooms, roomIndex: 0 })
  },

  onRoomChange(e) {
    this.setData({ roomIndex: e.detail.value })
  },

  // 活动方式
  onActivityModeChange(e) {
    this.setData({ activityModeIndex: e.detail.value })
  },

  // 公益
  onPublicWelfareChange(e) {
    this.setData({ isPublicWelfare: e.detail.value })
  },

  // 扣卡次数
  onDeductionCountInput(e) {
    this.setData({ membershipDeductionCount: e.detail.value })
  },

  onEksDeductionInput(e) {
    this.setData({ deductionCount: e.detail.value })
  },

  _serializeEksDescription(count) {
    return JSON.stringify([{ id: '', name: '', count: Number(count) || 2 }])
  },

  // 发布到客户端
  onPublishedChange(e) {
    this.setData({ isPublished: e.detail.value })
  },

  // 名称
  onNameInput(e) {
    this.setData({ activityName: e.detail.value })
  },

  // 描述
  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  // ---------- 统一搜索弹窗 ----------

  // 按身份过滤客户
  getFilteredCustomers(position) {
    const customers = this.data.allCustomers
    if (!position) return customers
    return customers.filter(c => (c.positions || []).includes(position))
  },

  // 打开案主选择器（单选）
  onOwnerPickerOpen() {
    const list = this.data.dayVisitors.map(c => Object.assign({}, c, {_selected: c.id === this.data.ownerId,}))
    this.setData({
      showPicker: true,
      pickerTitle: '案主',
      pickerMode: 'owner',
      pickerKeyword: '',
      pickerList: list,
    })
  },

  // 打开老师选择器
  onTeacherPickerOpen() {
    const { activityType } = this.data
    const position = TEACHER_POSITION[activityType] || ''
    const isSingle = SINGLE_TEACHER_TYPES.includes(activityType)
    const selectedId = isSingle ? this.data.achieverId : null
    const selectedIds = isSingle ? null : this.data.teacherIds
    const list = this.getFilteredCustomers(position).map(c => Object.assign({}, c, {_selected: isSingle ? c.id === selectedId : selectedIds.includes(c.id),}))
    this.setData({
      showPicker: true,
      pickerTitle: '老师',
      pickerMode: isSingle ? 'achiever' : 'teacher',
      pickerKeyword: '',
      pickerList: list,
    })
  },

  // 关闭弹窗
  onPickerClose() {
    this.setData({ showPicker: false, pickerKeyword: '' })
  },

  // 搜索
  onPickerSearch(e) {
    const keyword = e.detail.value
    const { pickerMode, activityType } = this.data
    let baseList
    if (pickerMode === 'owner') {
      baseList = this.data.dayVisitors
    } else {
      const position = TEACHER_POSITION[activityType] || ''
      baseList = this.getFilteredCustomers(position)
    }
    const list = baseList
      .filter(c => {
        if (!keyword) return true
        const kw = keyword.toLowerCase()
        return (c.nickname || '').toLowerCase().includes(kw) || (c.name || '').toLowerCase().includes(kw)
      })
      .map(function(c) {
        return Object.assign({}, c, {
          _selected: pickerMode === 'owner' ? c.id === this.data.ownerId
            : pickerMode === 'achiever' ? c.id === this.data.achieverId
            : this.data.teacherIds.includes(c.id),
        })
      }.bind(this))
    this.setData({ pickerKeyword: keyword, pickerList: list })
  },

  // 选择
  onPickerSelect(e) {
    const { id, nickname } = e.currentTarget.dataset
    if (this.data.pickerMode === 'owner') {
      // 案主单选
      this.setData({
        ownerId: id,
        ownerName: nickname,
        showPicker: false,
        pickerKeyword: '',
      })
    } else if (this.data.pickerMode === 'achiever') {
      // 成就君单选
      this.setData({
        achieverId: id,
        achieverName: nickname,
        showPicker: false,
        pickerKeyword: '',
      })
    } else {
      // 老师多选
      let { teacherIds, teacherNames } = this.data
      const idx = teacherIds.indexOf(id)
      if (idx >= 0) {
        teacherIds.splice(idx, 1)
        teacherNames.splice(idx, 1)
      } else {
        teacherIds.push(id)
        teacherNames.push(nickname)
      }
      const pickerList = this.data.pickerList.map(c => Object.assign({}, c, {_selected: teacherIds.includes(c.id),}))
      const teacherDisplay = teacherNames.join('、')
      this.setData({ teacherIds, teacherNames, teacherDisplay, pickerList })
    }
  },

  // 清空案主
  onOwnerClear() {
    this.setData({ ownerId: '', ownerName: '' })
  },

  // 清空老师
  onTeacherClear() {
    this.setData({ teacherIds: [], teacherNames: [], teacherDisplay: '' })
  },

  // 清空成就君
  onAchieverClear() {
    this.setData({ achieverId: '', achieverName: '' })
  },

  // ---------- 参与者 ----------

  async loadDayVisitors(date) {
    try {
      const visits = await visitApi.listLight(date)
      const visitors = (visits || []).map(v => ({
        id: v.customer_id || '',
        nickname: v.customer_nickname || v.nickname || '',
      })).filter(v => v.id)
      const ownerStillInvited = visitors.some(v => v.id === this.data.ownerId)
      this.setData({
        dayVisitors: visitors,
        ownerId: ownerStillInvited ? this.data.ownerId : '',
        ownerName: ownerStillInvited ? this.data.ownerName : '',
      })
      this.updateParticipantList()
    } catch (e) {
      console.error('加载到店人员失败:', e)
    }
  },

  updateParticipantList() {
    const { dayVisitors, participantIds } = this.data
    const participantList = dayVisitors.map(c => Object.assign({}, c, {selected: participantIds.includes(c.id),}))
    this.setData({ participantList })
  },

  onParticipantToggle(e) {
    const id = e.currentTarget.dataset.id
    let participantIds = this.data.participantIds.slice()
    const idx = participantIds.indexOf(id)
    if (idx >= 0) {
      participantIds.splice(idx, 1)
    } else {
      participantIds.push(id)
    }
    this.setData({ participantIds })
    this.updateParticipantList()
  },

  // ---------- 返回 ----------

  onBack() {
    wx.navigateBack()
  },

  // ---------- 提交 ----------

  async onSubmit() {
    const { activityType, date } = this.data

    // 校验
    if (activityType === 'class') {
      if (this.data.courseIndex < 0) {
        wx.showToast({ title: '请选择课程', icon: 'none' })
        return
      }
    }
    if (['gcs', 'ers', 'eks'].includes(activityType)) {
      if (!this.data.ownerId) {
        wx.showToast({ title: '请选择案主', icon: 'none' })
        return
      }
    }
    if (this.data.startTime && this.data.endTime && this.data.endTime <= this.data.startTime) {
      wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' })
      return
    }

    const space = this.data.spaces[this.data.spaceIndex]
    const room = this.data.rooms[this.data.roomIndex]
    const baseFields = {
      date,
      start_time: this.data.startTime || null,
      end_time: this.data.endTime || null,
      space_id: space?.id || '',
      room_id: room?.id || '',
      room_name: room?.name || '',
      space_name: space?.name || '',
      activity_mode: this.data.activityModes[this.data.activityModeIndex],
      participant_ids: this.data.participantIds,
    }

    this.setData({ saving: true })
    try {
      switch (activityType) {
        case 'class': {
          const course = this.data.courses[this.data.courseIndex]
          await classRecordApi.create(Object.assign({}, baseFields, {
            course_id: '',
            course_name: course.name,
            activity_name: this.data.activityName || '',
            course_type: course.name,
            course_description: this.data.description,
            teacher_ids: this.data.teacherIds,
            is_public_welfare: this.data.isPublicWelfare,
            membership_deduction_count: Number(this.data.membershipDeductionCount) || 1,
            is_published: this.data.isPublished,
          }))
          break
        }
        case 'gcs':
          await groupCaseSessionApi.create(Object.assign({}, baseFields, {
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this.data.description,
            achiever_id: this.data.achieverId,
            achiever_name: this.data.achieverName,
            teacher_ids: this.data.achieverId ? [this.data.achieverId] : [],
            membership_deduction_count: Number(this.data.membershipDeductionCount) || 1,
            is_published: this.data.isPublished,
          }))
          break
        case 'ers':
          await emotionalReleaseSessionApi.create(Object.assign({}, baseFields, {
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this.data.description,
            achiever_id: this.data.achieverId,
            achiever_name: this.data.achieverName,
            teacher_ids: this.data.achieverId ? [this.data.achieverId] : [],
            membership_deduction_count: Number(this.data.membershipDeductionCount) || 1,
            is_published: this.data.isPublished,
          }))
          break
        case 'eks':
          await energyKnotSessionApi.create(Object.assign({}, baseFields, {
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this._serializeEksDescription(this.data.deductionCount),
            course_description: this.data.description,
            teacher_ids: this.data.teacherIds,
            host_id: '',
            host_name: '',
            membership_deduction_count: Number(this.data.membershipDeductionCount) || 0,
            is_published: this.data.isPublished,
          }))
          break
        case 'ics':
          await internalCourseSessionApi.create(Object.assign({}, baseFields, {
            course_name: this.data.activityName || this.data.icsCourseType || '',
            course_type: this.data.icsCourseType || '',
            course_description: this.data.description,
            teacher_ids: this.data.teacherIds,
            host_id: '',
            host_name: '',
            membership_deduction_count: Number(this.data.membershipDeductionCount) || 0,
            is_published: this.data.isPublished,
          }))
          break
      }

      wx.showToast({ title: '已创建' })
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]
      if (prevPage && prevPage.loadData) {
        prevPage.loadData()
      }
      wx.navigateBack()
    } catch (e) {
      this.setData({ saving: false })
      wx.showModal({
        title: '创建失败',
        content: '是否重试？',
        success: (res) => { if (res.confirm) this.onSubmit() },
      })
      return
    }
    this.setData({ saving: false })
  },
})
