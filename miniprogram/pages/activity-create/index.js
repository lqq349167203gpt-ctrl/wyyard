const {
  classRecordApi, courseTypeApi, spaceApi, customerApi,
  groupCaseSessionApi, emotionalReleaseSessionApi,
  energyKnotSessionApi, internalCourseSessionApi,
  ohCardReadingSessionApi,
} = require('../../utils/api')
const { formatDate } = require('../../utils/util')

const ACTIVITY_TYPES = [
  { value: 'class', label: '沙龙活动' },
  { value: 'gcs', label: '觉醒游戏' },
  { value: 'ers', label: '情绪释放' },
  { value: 'eks', label: '能量结' },
  { value: 'ics', label: '内部课程' },
  { value: 'ocr', label: 'OH卡' },
]

// 类型对应的老师身份
const TEACHER_POSITION = {
  class: '课程老师',
  gcs: '成就君',
  ers: '成就君',
  eks: '能量结老师',
  ics: '课程老师',
  ocr: '成就君',
}

Page({
  data: {
    // 活动类型
    activityType: 'class',
    typeIndex: 0,
    activityTypes: ACTIVITY_TYPES,
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
    // 活动方式（沙龙/内部课程）
    activityModes: ['线下', '线上'],
    activityModeIndex: 0,
    // 案主（觉醒/情绪释放/OH卡/能量结）
    ownerId: '',
    ownerName: '',
    // 主持人/老师
    teacherIds: [],
    teacherNames: [],
    // 公益（沙龙）
    isPublicWelfare: false,
    // 名称
    activityName: '',
    // 描述
    description: '',
    // 客户数据
    allCustomers: [],
    // 统一搜索弹窗
    showPicker: false,
    pickerTitle: '',
    pickerMode: '', // 'teacher' | 'owner'
    pickerKeyword: '',
    pickerList: [],
    saving: false,
  },

  async onLoad(options) {
    if (options.date) this.setData({ date: options.date })
    const savedSpaceId = options.spaceId || ''
    await Promise.all([
      this.loadSpaces(savedSpaceId),
      this.loadCourses(),
      this.loadCustomers(),
    ])
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
      // 转换为 picker 可用的格式 { id: name, name: name }
      const courses = types.map(t => ({ id: t.name, name: t.name }))
      this.setData({ courses })
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

  // 活动类型切换
  onTypeChange(e) {
    const typeIndex = e.detail.value
    const activityType = ACTIVITY_TYPES[typeIndex].value
    // 切换类型时清空类型特有字段
    this.setData({
      typeIndex,
      activityType,
      courseIndex: -1,
      ownerId: '',
      ownerName: '',
      teacherIds: [],
      teacherNames: [],
      isPublicWelfare: false,
      activityModeIndex: 0,
      activityName: '',
    })
  },

  // 日期/时间
  onDateChange(e) { this.setData({ date: e.detail.value }) },
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

  // 课程选择
  onCourseChange(e) {
    this.setData({ courseIndex: e.detail.value })
  },

  // 活动方式
  onActivityModeChange(e) {
    this.setData({ activityModeIndex: e.detail.value })
  },

  // 公益
  onPublicWelfareChange(e) {
    this.setData({ isPublicWelfare: e.detail.value })
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
    const list = this.getFilteredCustomers('').map(c => ({
      ...c,
      _selected: c.id === this.data.ownerId,
    }))
    this.setData({
      showPicker: true,
      pickerTitle: '案主',
      pickerMode: 'owner',
      pickerKeyword: '',
      pickerList: list,
    })
  },

  // 打开主持人/老师选择器（多选）
  onTeacherPickerOpen() {
    const position = TEACHER_POSITION[this.data.activityType] || ''
    const list = this.getFilteredCustomers(position).map(c => ({
      ...c,
      _selected: this.data.teacherIds.includes(c.id),
    }))
    const title = (this.data.activityType === 'class' || this.data.activityType === 'ics' || this.data.activityType === 'eks')
      ? '老师' : '主持人'
    this.setData({
      showPicker: true,
      pickerTitle: title,
      pickerMode: 'teacher',
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
    let baseList
    if (this.data.pickerMode === 'owner') {
      baseList = this.getFilteredCustomers('')
    } else {
      const position = TEACHER_POSITION[this.data.activityType] || ''
      baseList = this.getFilteredCustomers(position)
    }
    const list = baseList
      .filter(c => {
        if (!keyword) return true
        return (c.nickname || '').includes(keyword) || (c.name || '').includes(keyword)
      })
      .map(c => ({
        ...c,
        _selected: this.data.pickerMode === 'owner'
          ? c.id === this.data.ownerId
          : this.data.teacherIds.includes(c.id),
      }))
    this.setData({ pickerKeyword: keyword, pickerList: list })
  },

  // 选择
  onPickerSelect(e) {
    const { id, nickname } = e.currentTarget.dataset
    if (this.data.pickerMode === 'owner') {
      // 单选，直接关闭
      this.setData({
        ownerId: id,
        ownerName: nickname,
        showPicker: false,
        pickerKeyword: '',
      })
    } else {
      // 多选
      let { teacherIds, teacherNames } = this.data
      const idx = teacherIds.indexOf(id)
      if (idx >= 0) {
        teacherIds.splice(idx, 1)
        teacherNames.splice(idx, 1)
      } else {
        teacherIds.push(id)
        teacherNames.push(nickname)
      }
      const pickerList = this.data.pickerList.map(c => ({
        ...c,
        _selected: teacherIds.includes(c.id),
      }))
      this.setData({ teacherIds, teacherNames, pickerList })
    }
  },

  // 清空案主
  onOwnerClear() {
    this.setData({ ownerId: '', ownerName: '' })
  },

  // 清空老师
  onTeacherClear() {
    this.setData({ teacherIds: [], teacherNames: [] })
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
    if (['gcs', 'ers', 'eks', 'ocr'].includes(activityType)) {
      if (!this.data.ownerId) {
        wx.showToast({ title: '请选择案主', icon: 'none' })
        return
      }
    }
    if (activityType === 'ics') {
      if (!this.data.activityName) {
        wx.showToast({ title: '请输入名称', icon: 'none' })
        return
      }
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
    }

    this.setData({ saving: true })
    try {
      switch (activityType) {
        case 'class': {
          const course = this.data.courses[this.data.courseIndex]
          await classRecordApi.create({
            ...baseFields,
            course_id: '',
            course_name: course.name,
            activity_name: this.data.activityName || '',
            course_type: course.name,
            course_description: this.data.description,
            teacher_ids: this.data.teacherIds,
            is_public_welfare: this.data.isPublicWelfare,
          })
          break
        }
        case 'gcs':
          await groupCaseSessionApi.create({
            ...baseFields,
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this.data.description,
            host_id: this.data.teacherIds[0] || '',
            host_name: this.data.teacherNames[0] || '',
            teacher_ids: this.data.teacherIds,
          })
          break
        case 'ers':
          await emotionalReleaseSessionApi.create({
            ...baseFields,
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this.data.description,
            host_id: this.data.teacherIds[0] || '',
            host_name: this.data.teacherNames[0] || '',
            teacher_ids: this.data.teacherIds,
          })
          break
        case 'eks':
          await energyKnotSessionApi.create({
            ...baseFields,
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this.data.description,
            teacher_ids: this.data.teacherIds,
            host_id: '',
            host_name: '',
          })
          break
        case 'ics':
          await internalCourseSessionApi.create({
            ...baseFields,
            course_name: this.data.activityName,
            course_type: '',
            course_description: this.data.description,
            teacher_ids: this.data.teacherIds,
            host_id: '',
            host_name: '',
          })
          break
        case 'ocr':
          await ohCardReadingSessionApi.create({
            ...baseFields,
            owner_id: this.data.ownerId,
            owner_name: this.data.ownerName,
            name: this.data.activityName,
            description: this.data.description,
            host_id: this.data.teacherIds[0] || '',
            host_name: this.data.teacherNames[0] || '',
            teacher_ids: this.data.teacherIds,
          })
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
      wx.showToast({ title: '创建失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
