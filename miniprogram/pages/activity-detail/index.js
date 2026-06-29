const {
  classRecordApi, courseTypeApi, spaceApi, customerApi, visitApi,
  groupCaseSessionApi, emotionalReleaseSessionApi,
  energyKnotSessionApi, internalCourseSessionApi,
  ohCardReadingSessionApi,
} = require('../../utils/api')

const BADGE_COLORS = {
  '沙龙': '#3370ff', '觉醒': '#7c5cfc', '情绪释放': '#d97070',
  '能量结': '#d9944a', '内部课程': '#5ba88a', 'OH卡': '#c772a0',
}

const SOURCE_TO_TYPE = {
  class_record: 'class',
  group_case: 'gcs',
  emotional_release: 'ers',
  energy_knot: 'eks',
  internal_course: 'ics',
  oh_card: 'ocr',
}

const TYPE_LABELS = {
  class: '沙龙', gcs: '觉醒', ers: '情绪释放',
  eks: '能量结', ics: '内部课程', ocr: 'OH卡',
}

const TEACHER_POSITION = {
  class: '课程老师', gcs: '成就君', ers: '成就君', ocr: '成就君',
  eks: '能量结老师', ics: '课程老师',
}

// 单选老师类型（用 achiever_id/achiever_name）
const SINGLE_TEACHER_TYPES = ['gcs', 'ers', 'ocr']

// 内部课程类型
const ICS_COURSE_TYPES = ['疗愈师课程', '商业框架陪跑', '落地赋能班']

const API_MAP = {
  class: classRecordApi,
  gcs: groupCaseSessionApi,
  ers: emotionalReleaseSessionApi,
  eks: energyKnotSessionApi,
  ics: internalCourseSessionApi,
  ocr: ohCardReadingSessionApi,
}

const ACTIVITY_TYPES = [
  { value: 'class', label: '沙龙活动' },
  { value: 'gcs', label: '觉醒游戏' },
  { value: 'ers', label: '情绪释放' },
  { value: 'ocr', label: 'OH卡' },
  { value: 'eks', label: '能量结' },
  { value: 'ics', label: '内部课程' },
]

Page({
  data: {
    activityType: '',
    unifiedTypes: [],
    unifiedIndex: 0,
    typeLabel: '',
    typeColor: '',
    date: '',
    startTime: '',
    endTime: '',
    spaces: [],
    spaceIndex: 0,
    rooms: [],
    roomIndex: 0,
    courses: [],
    courseIndex: -1,
    icsCourses: ICS_COURSE_TYPES,
    icsCourseType: '',
    activityModes: ['线下', '线上'],
    activityModeIndex: 0,
    ownerId: '',
    ownerName: '',
    teacherIds: [],
    teacherNames: [],
    teacherDisplay: '',
    achieverId: '',
    achieverName: '',
    isPublicWelfare: false,
    participantIds: [],
    participantList: [],
    dayVisitors: [],
    activityName: '',
    description: '',
    allCustomers: [],
    showPicker: false,
    pickerTitle: '',
    pickerMode: '',
    pickerKeyword: '',
    pickerList: [],
    showTypePicker: false,
    typePickerStep: 1,
    _pendingType: '',
    _pendingCourseName: '',
    saving: false,
    deleting: false,
    _recordId: '',
    _source: '',
  },

  async onLoad() {
    const app = getApp()
    const raw = app.globalData._selectedActivity
    const source = app.globalData._selectedActivitySource
    if (!raw || !raw.id || !source) {
      console.warn('activity-detail: no raw data')
      return
    }

    const activityType = SOURCE_TO_TYPE[source]
    const typeLabel = raw.course_type || TYPE_LABELS[activityType] || ''
    const typeColor = BADGE_COLORS[typeLabel] || BADGE_COLORS['沙龙'] || '#3370ff'

    this._recordId = raw.id
    this._source = source
    this._originalType = activityType

    const initData = {
      activityType,
      typeLabel,
      typeColor,
      _recordId: raw.id,
      _source: source,
      date: raw.date || '',
      startTime: raw.start_time || '09:00',
      endTime: raw.end_time || '10:00',
      activityName: raw.activity_name || raw.name || raw.course_name || '',
      description: raw.description || raw.course_description || '',
      ownerId: raw.owner_id || '',
      ownerName: raw.owner_name || '',
      teacherIds: raw.teacher_ids || [],
      achieverId: raw.achiever_id || raw.host_id || (raw.teacher_ids || [])[0] || '',
      achieverName: raw.achiever_name || raw.host_name || (raw.teacher_names || [])[0] || '',
      isPublicWelfare: raw.is_public_welfare || false,
      participantIds: raw.participant_ids || [],
      activityModeIndex: (raw.activity_mode === '线上') ? 1 : 0,
      icsCourseType: (activityType === 'ics') ? (raw.course_type || '') : '',
    }

    // 加载空间/课程/客户/到店人员
    await this.loadSpaces(raw.space_id, raw.room_id)
    await this.loadCourses(raw.course_type)
    await this.loadCustomers()
    await this.loadDayVisitors(raw.date)

    // 计算 unifiedIndex 和 courseIndex
    const { unifiedTypes } = this.data
    let unifiedIndex = 0
    if (activityType === 'class' && raw.course_type) {
      unifiedIndex = unifiedTypes.findIndex(t => !t.isType && t.courseName === raw.course_type)
      const ci = this.data.courses.findIndex(c => c.name === raw.course_type)
      if (ci >= 0) initData.courseIndex = ci
    } else {
      unifiedIndex = unifiedTypes.findIndex(t => t.isType && t.value === activityType)
    }
    if (unifiedIndex < 0) unifiedIndex = 0
    initData.unifiedIndex = unifiedIndex

    // 解析老师名称
    const { teacherIds } = initData
    const allCustomers = this.data.allCustomers
    if (teacherIds.length > 0 && allCustomers.length > 0) {
      initData.teacherNames = teacherIds.map(id => {
        const c = allCustomers.find(c => c.id === id)
        return c ? c.nickname : ''
      }).filter(Boolean)
      initData.teacherDisplay = initData.teacherNames.join('、')
      // gcs/ers/ocr：如果 achieverName 为空，从 teacherIds 兜底
      if (SINGLE_TEACHER_TYPES.includes(activityType) && !initData.achieverName && initData.teacherNames.length > 0) {
        initData.achieverId = teacherIds[0]
        initData.achieverName = initData.teacherNames[0]
      }
    }

    this.setData(initData)
    this.updateParticipantList()
  },

  async loadSpaces(savedSpaceId, savedRoomId) {
    try {
      const spaces = await spaceApi.list()
      const spaceIndex = savedSpaceId
        ? Math.max(0, spaces.findIndex(s => s.id === savedSpaceId))
        : 0
      const space = spaces[spaceIndex]
      const rooms = space?.rooms || []
      const roomIndex = savedRoomId
        ? Math.max(0, rooms.findIndex(r => r.id === savedRoomId))
        : 0
      this.setData({ spaces, spaceIndex, rooms, roomIndex })
    } catch (e) {
      console.error('加载空间失败:', e)
    }
  },

  async loadCourses(courseType) {
    try {
      const types = await courseTypeApi.list()
      const courses = types.map(t => ({ id: t.name, name: t.name }))
      const courseIndex = courseType
        ? Math.max(-1, courses.findIndex(c => c.name === courseType))
        : -1

      // 构建合并列表：非 class 类型 + 课程类型
      const nonClassTypes = ACTIVITY_TYPES.filter(t => t.value !== 'class')
      const courseItems = courses.map(c => ({
        value: 'class', label: c.name, isType: false, courseName: c.name,
      }))
      const unifiedTypes = [
        ...nonClassTypes.map(t => ({ ...t, isType: true })),
        ...courseItems,
      ]

      this.setData({ courses, courseIndex, unifiedTypes })
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

  async loadDayVisitors(date) {
    try {
      const visits = await visitApi.listLight(date)
      const visitors = (visits || []).map(v => ({
        id: v.customer_id || '',
        nickname: v.customer_nickname || v.nickname || '',
      })).filter(v => v.id)
      this.setData({ dayVisitors: visitors })
    } catch (e) {
      console.error('加载到店人员失败:', e)
    }
  },

  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onStartTimeChange(e) { this.setData({ startTime: e.detail.value }) },
  onEndTimeChange(e) { this.setData({ endTime: e.detail.value }) },

  onSpaceChange(e) {
    const spaceIndex = e.detail.value
    const space = this.data.spaces[spaceIndex]
    const rooms = space?.rooms || []
    this.setData({ spaceIndex, rooms, roomIndex: 0 })
  },

  onRoomChange(e) {
    this.setData({ roomIndex: e.detail.value })
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
    } else {
      this.applyTypeSelection('ics', -1, name)
    }
    this.setData({ showTypePicker: false, typePickerStep: 1, _pendingType: '', _pendingCourseName: '' })
  },

  applyTypeSelection(activityType, courseIndex, icsCourseType) {
    const resetFields = {
      ownerId: '',
      ownerName: '',
      teacherIds: [],
      teacherNames: [],
      teacherDisplay: '',
      achieverId: '',
      achieverName: '',
      isPublicWelfare: false,
      activityModeIndex: 0,
    }

    if (activityType === 'class' && courseIndex >= 0) {
      const course = this.data.courses[courseIndex]
      const typeColor = BADGE_COLORS['沙龙'] || '#3370ff'
      const unifiedIndex = this.data.unifiedTypes.findIndex(t => !t.isType && t.courseName === course.name)
      this.setData({
        ...resetFields,
        activityType: 'class',
        typeLabel: course.name,
        typeColor,
        courseIndex,
        icsCourseType: '',
        unifiedIndex: unifiedIndex >= 0 ? unifiedIndex : 0,
      })
    } else if (activityType === 'ics' && icsCourseType) {
      const typeColor = BADGE_COLORS['内部课程'] || '#5ba88a'
      const unifiedIndex = this.data.unifiedTypes.findIndex(t => t.isType && t.value === 'ics')
      this.setData({
        ...resetFields,
        activityType: 'ics',
        typeLabel: icsCourseType,
        typeColor,
        courseIndex: -1,
        icsCourseType,
        activityName: icsCourseType,
        unifiedIndex: unifiedIndex >= 0 ? unifiedIndex : 0,
      })
    } else {
      const typeLabel = TYPE_LABELS[activityType] || ''
      const typeColor = BADGE_COLORS[typeLabel] || BADGE_COLORS['沙龙'] || '#3370ff'
      const unifiedIndex = this.data.unifiedTypes.findIndex(t => t.isType && t.value === activityType)
      this.setData({
        ...resetFields,
        activityType,
        typeLabel,
        typeColor,
        courseIndex: -1,
        icsCourseType: '',
        unifiedIndex: unifiedIndex >= 0 ? unifiedIndex : 0,
      })
    }
  },

  onActivityModeChange(e) {
    this.setData({ activityModeIndex: e.detail.value })
  },

  onPublicWelfareChange(e) {
    this.setData({ isPublicWelfare: e.detail.value })
  },

  onNameInput(e) {
    this.setData({ activityName: e.detail.value })
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  // ---------- 参与者 ----------

  updateParticipantList() {
    const { dayVisitors, participantIds } = this.data
    const participantList = dayVisitors.map(c => ({
      ...c,
      selected: participantIds.includes(c.id),
    }))
    this.setData({ participantList })
  },

  onParticipantToggle(e) {
    const id = e.currentTarget.dataset.id
    let participantIds = [...this.data.participantIds]
    const idx = participantIds.indexOf(id)
    if (idx >= 0) {
      participantIds.splice(idx, 1)
    } else {
      participantIds.push(id)
    }
    this.setData({ participantIds })
    this.updateParticipantList()
  },

  // ---------- 搜索弹窗 ----------

  getFilteredCustomers(position) {
    const customers = this.data.allCustomers
    if (!position) return customers
    return customers.filter(c => (c.positions || []).includes(position))
  },

  onOwnerPickerOpen() {
    const list = this.getFilteredCustomers('').map(c => ({
      ...c,
      _selected: c.id === this.data.ownerId,
    }))
    this.setData({
      showPicker: true, pickerTitle: '案主', pickerMode: 'owner',
      pickerKeyword: '', pickerList: list,
    })
  },

  onTeacherPickerOpen() {
    const { activityType } = this.data
    const position = TEACHER_POSITION[activityType] || ''
    const isSingle = SINGLE_TEACHER_TYPES.includes(activityType)
    const selectedId = isSingle ? this.data.achieverId : null
    const selectedIds = isSingle ? null : this.data.teacherIds
    const list = this.getFilteredCustomers(position).map(c => ({
      ...c,
      _selected: isSingle ? c.id === selectedId : selectedIds.includes(c.id),
    }))
    this.setData({
      showPicker: true, pickerTitle: '老师', pickerMode: isSingle ? 'achiever' : 'teacher',
      pickerKeyword: '', pickerList: list,
    })
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerKeyword: '' })
  },

  onPickerSearch(e) {
    const keyword = e.detail.value
    const { pickerMode, activityType } = this.data
    let baseList
    if (pickerMode === 'owner') {
      baseList = this.getFilteredCustomers('')
    } else {
      const position = TEACHER_POSITION[activityType] || ''
      baseList = this.getFilteredCustomers(position)
    }
    const list = baseList
      .filter(c => !keyword || (c.nickname || '').includes(keyword) || (c.name || '').includes(keyword))
      .map(c => ({
        ...c,
        _selected: pickerMode === 'owner' ? c.id === this.data.ownerId
          : pickerMode === 'achiever' ? c.id === this.data.achieverId
          : this.data.teacherIds.includes(c.id),
      }))
    this.setData({ pickerKeyword: keyword, pickerList: list })
  },

  onPickerSelect(e) {
    const { id, nickname } = e.currentTarget.dataset
    if (this.data.pickerMode === 'owner') {
      this.setData({ ownerId: id, ownerName: nickname, showPicker: false, pickerKeyword: '' })
    } else if (this.data.pickerMode === 'achiever') {
      this.setData({ achieverId: id, achieverName: nickname, showPicker: false, pickerKeyword: '' })
    } else {
      let teacherIds = [...this.data.teacherIds]
      let teacherNames = [...this.data.teacherNames]
      const idx = teacherIds.indexOf(id)
      if (idx >= 0) {
        teacherIds.splice(idx, 1)
        teacherNames.splice(idx, 1)
      } else {
        teacherIds.push(id)
        teacherNames.push(nickname)
      }
      const pickerList = this.data.pickerList.map(c => ({ ...c, _selected: teacherIds.includes(c.id) }))
      this.setData({ teacherIds, teacherNames, teacherDisplay: teacherNames.join('、'), pickerList })
    }
  },

  onOwnerClear() {
    this.setData({ ownerId: '', ownerName: '' })
  },

  onTeacherClear() {
    this.setData({ teacherIds: [], teacherNames: [], teacherDisplay: '' })
  },

  onAchieverClear() {
    this.setData({ achieverId: '', achieverName: '' })
  },

  // ---------- 保存 ----------

  async onSave() {
    const { activityType } = this.data

    if (activityType === 'class' && this.data.courseIndex < 0) {
      wx.showToast({ title: '请选择课程', icon: 'none' })
      return
    }
    if (['gcs', 'ers', 'eks', 'ocr'].includes(activityType) && !this.data.ownerId) {
      wx.showToast({ title: '请选择案主', icon: 'none' })
      return
    }

    const space = this.data.spaces[this.data.spaceIndex]
    const room = this.data.rooms[this.data.roomIndex]
    const baseFields = {
      date: this.data.date,
      start_time: this.data.startTime || null,
      end_time: this.data.endTime || null,
      space_id: space?.id || '',
      room_id: room?.id || '',
      room_name: room?.name || '',
      space_name: space?.name || '',
      activity_mode: this.data.activityModes[this.data.activityModeIndex],
      participant_ids: this.data.participantIds,
    }

    let payload
    switch (activityType) {
      case 'class': {
        const course = this.data.courses[this.data.courseIndex]
        payload = {
          ...baseFields,
          course_id: '',
          course_name: course.name,
          activity_name: this.data.activityName || '',
          course_type: course.name,
          course_description: this.data.description,
          teacher_ids: this.data.teacherIds,
          is_public_welfare: this.data.isPublicWelfare,
        }
        break
      }
      case 'gcs':
      case 'ers':
      case 'ocr':
        payload = {
          ...baseFields,
          owner_id: this.data.ownerId,
          owner_name: this.data.ownerName,
          name: this.data.activityName,
          description: this.data.description,
          achiever_id: this.data.achieverId,
          achiever_name: this.data.achieverName,
          teacher_ids: this.data.achieverId ? [this.data.achieverId] : [],
        }
        break
      case 'eks':
        payload = {
          ...baseFields,
          owner_id: this.data.ownerId,
          owner_name: this.data.ownerName,
          name: this.data.activityName,
          description: this.data.description,
          teacher_ids: this.data.teacherIds,
        }
        break
      case 'ics':
        payload = {
          ...baseFields,
          course_name: this.data.activityName || this.data.icsCourseType || '',
          course_type: this.data.icsCourseType || '',
          course_description: this.data.description,
          teacher_ids: this.data.teacherIds,
        }
        break
    }

    const api = API_MAP[activityType]
    if (!api) return

    this.setData({ saving: true })
    try {
      const typeChanged = activityType !== this._originalType
      if (typeChanged) {
        // 类型变更：删除旧记录，创建新记录
        const oldApi = API_MAP[this._originalType]
        if (oldApi) await oldApi.delete(this._recordId)
        await api.create(payload)
      } else {
        await api.update(this._recordId, payload)
      }
      wx.showToast({ title: '已保存' })
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]
      if (prevPage && prevPage.loadData) prevPage.loadData()
      wx.navigateBack()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  // ---------- 删除 ----------

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除？',
      confirmColor: '#e34d59',
      success: async (res) => {
        if (!res.confirm) return
        const api = API_MAP[this._originalType]
        if (!api) return
        this.setData({ deleting: true })
        try {
          await api.delete(this._recordId)
          wx.showToast({ title: '已删除' })
          const pages = getCurrentPages()
          const prevPage = pages[pages.length - 2]
          if (prevPage && prevPage.loadData) prevPage.loadData()
          wx.navigateBack()
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        } finally {
          this.setData({ deleting: false })
        }
      },
    })
  },
})
