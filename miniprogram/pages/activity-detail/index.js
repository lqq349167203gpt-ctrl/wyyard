const {
  classRecordApi, courseApi, spaceApi, customerApi,
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
  class: '课程老师', gcs: '成就君', ers: '成就君',
  eks: '能量结老师', ics: '课程老师', ocr: '成就君',
}

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
  { value: 'eks', label: '能量结' },
  { value: 'ics', label: '内部课程' },
  { value: 'ocr', label: 'OH卡' },
]

Page({
  data: {
    activityType: '',
    typeIndex: 0,
    activityTypes: ACTIVITY_TYPES,
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
    activityModes: ['线下', '线上'],
    activityModeIndex: 0,
    ownerId: '',
    ownerName: '',
    teacherIds: [],
    teacherNames: [],
    isPublicWelfare: false,
    activityName: '',
    description: '',
    allCustomers: [],
    showPicker: false,
    pickerTitle: '',
    pickerMode: '',
    pickerKeyword: '',
    pickerList: [],
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

    console.log('activity-detail raw:', JSON.stringify({
      id: raw.id, date: raw.date, start_time: raw.start_time, end_time: raw.end_time,
      course_id: raw.course_id, course_name: raw.course_name,
      owner_id: raw.owner_id, host_id: raw.host_id, teacher_ids: raw.teacher_ids,
    }))

    const activityType = SOURCE_TO_TYPE[source]
    const typeIndex = ACTIVITY_TYPES.findIndex(t => t.value === activityType)
    const typeLabel = raw.course_type || TYPE_LABELS[activityType] || ''
    const typeColor = BADGE_COLORS[typeLabel] || BADGE_COLORS['沙龙'] || '#3370ff'

    this._recordId = raw.id
    this._source = source
    this._originalType = activityType

    const initData = {
      activityType,
      typeIndex: typeIndex >= 0 ? typeIndex : 0,
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
      isPublicWelfare: raw.is_public_welfare || false,
      activityModeIndex: (raw.activity_mode === '线上') ? 1 : 0,
    }

    // 主持人/老师：class/ics 从 teacher_ids 解析，其他用 host_id
    if (source !== 'class_record' && source !== 'internal_course') {
      initData.teacherIds = raw.host_id ? [raw.host_id] : []
    }

    this.setData(initData)

    // 加载空间/课程/客户，然后解析老师名称
    await this.loadSpaces(raw.space_id, raw.room_id)
    await this.loadCourses(raw.course_id)
    await this.loadCustomers()
    this.resolveTeacherNames()
  },

  resolveTeacherNames() {
    const { teacherIds, allCustomers, activityType } = this.data
    if (teacherIds.length === 0 || allCustomers.length === 0) return
    const names = teacherIds.map(id => {
      const c = allCustomers.find(c => c.id === id)
      return c ? c.nickname : ''
    }).filter(Boolean)
    this.setData({ teacherNames: names })
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

  async loadCourses(courseId) {
    try {
      const courses = await courseApi.list()
      const courseIndex = courseId
        ? Math.max(-1, courses.findIndex(c => c.id === courseId))
        : -1
      console.log('loadCourses: courseId=', courseId, 'courseIndex=', courseIndex, 'total=', courses.length)
      this.setData({ courses, courseIndex })
    } catch (e) {
      console.error('加载课程失败:', e)
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

  onCourseChange(e) {
    this.setData({ courseIndex: e.detail.value })
  },

  onActivityModeChange(e) {
    this.setData({ activityModeIndex: e.detail.value })
  },

  onTypeChange(e) {
    const typeIndex = e.detail.value
    const activityType = ACTIVITY_TYPES[typeIndex].value
    const typeLabel = TYPE_LABELS[activityType] || ''
    const typeColor = BADGE_COLORS[typeLabel] || BADGE_COLORS['沙龙'] || '#3370ff'
    this.setData({
      typeIndex,
      activityType,
      typeLabel,
      typeColor,
      courseIndex: -1,
      ownerId: '',
      ownerName: '',
      teacherIds: [],
      teacherNames: [],
      isPublicWelfare: false,
      activityModeIndex: 0,
    })
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
    const position = TEACHER_POSITION[this.data.activityType] || ''
    const list = this.getFilteredCustomers(position).map(c => ({
      ...c,
      _selected: this.data.teacherIds.includes(c.id),
    }))
    const title = (this.data.activityType === 'class' || this.data.activityType === 'ics' || this.data.activityType === 'eks')
      ? '老师' : '主持人'
    this.setData({
      showPicker: true, pickerTitle: title, pickerMode: 'teacher',
      pickerKeyword: '', pickerList: list,
    })
  },

  onPickerClose() {
    this.setData({ showPicker: false, pickerKeyword: '' })
  },

  onPickerSearch(e) {
    const keyword = e.detail.value
    let baseList
    if (this.data.pickerMode === 'owner') {
      baseList = this.getFilteredCustomers('')
    } else {
      const position = TEACHER_POSITION[this.data.activityType] || ''
      baseList = this.getFilteredCustomers(position)
    }
    const list = baseList
      .filter(c => !keyword || (c.nickname || '').includes(keyword) || (c.name || '').includes(keyword))
      .map(c => ({
        ...c,
        _selected: this.data.pickerMode === 'owner'
          ? c.id === this.data.ownerId
          : this.data.teacherIds.includes(c.id),
      }))
    this.setData({ pickerKeyword: keyword, pickerList: list })
  },

  onPickerSelect(e) {
    const { id, nickname } = e.currentTarget.dataset
    if (this.data.pickerMode === 'owner') {
      this.setData({ ownerId: id, ownerName: nickname, showPicker: false, pickerKeyword: '' })
    } else {
      let { teacherIds, teacherNames } = this.data
      const idx = teacherIds.indexOf(id)
      if (idx >= 0) {
        teacherIds.splice(idx, 1)
        teacherNames.splice(idx, 1)
      } else {
        teacherIds.push(id)
        teacherNames.push(nickname)
      }
      const pickerList = this.data.pickerList.map(c => ({ ...c, _selected: teacherIds.includes(c.id) }))
      this.setData({ teacherIds, teacherNames, pickerList })
    }
  },

  onOwnerClear() {
    this.setData({ ownerId: '', ownerName: '' })
  },

  onTeacherClear() {
    this.setData({ teacherIds: [], teacherNames: [] })
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
    if (activityType === 'ics' && !this.data.activityName) {
      wx.showToast({ title: '请输入名称', icon: 'none' })
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
    }

    let payload
    switch (activityType) {
      case 'class': {
        const course = this.data.courses[this.data.courseIndex]
        payload = {
          ...baseFields,
          course_id: course.id,
          course_name: course.name,
          activity_name: this.data.activityName || '',
          course_type: course.type || '',
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
          host_id: this.data.teacherIds[0] || '',
          host_name: this.data.teacherNames[0] || '',
          teacher_ids: this.data.teacherIds,
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
          course_name: this.data.activityName,
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
