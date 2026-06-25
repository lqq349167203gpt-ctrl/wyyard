const { classRecordApi, courseApi, courseTypeApi, spaceApi, customerApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')

Page({
  data: {
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    // 空间/房间
    spaces: [],
    spaceIndex: 0,
    rooms: [],
    roomIndex: 0,
    // 课程
    courses: [],
    courseIndex: -1,
    courseTypes: [],
    // 活动方式
    activityModes: ['线下', '线上'],
    activityModeIndex: 0,
    // 老师
    teacherIds: [],
    teacherNames: [],
    allTeachers: [],
    showTeacherPicker: false,
    teacherKeyword: '',
    teacherList: [],
    // 公益
    isPublicWelfare: false,
    // 描述
    description: '',
    saving: false,
  },

  async onLoad(options) {
    if (options.date) this.setData({ date: options.date })
    const savedSpaceId = options.spaceId || ''
    await Promise.all([
      this.loadSpaces(savedSpaceId),
      this.loadCourses(),
      this.loadTeachers(),
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
      const courses = await courseApi.list()
      this.setData({ courses })
    } catch (e) {
      console.error('加载课程失败:', e)
    }
  },

  async loadTeachers() {
    try {
      const customers = await customerApi.light()
      const allTeachers = customers.filter(c =>
        (c.positions || []).includes('课程老师')
      )
      this.setData({ allTeachers })
    } catch (e) {
      console.error('加载老师列表失败:', e)
    }
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

  // 老师搜索弹窗
  onTeacherPickerOpen() {
    const teacherList = this.data.allTeachers.map(t => ({
      ...t,
      selected: this.data.teacherIds.includes(t.id),
    }))
    this.setData({ showTeacherPicker: true, teacherKeyword: '', teacherList })
  },

  onTeacherPickerClose() {
    this.setData({ showTeacherPicker: false, teacherKeyword: '' })
  },

  onTeacherSearch(e) {
    const keyword = e.detail.value
    const teacherList = this.data.allTeachers
      .filter(t => {
        if (!keyword) return true
        return (t.nickname || '').includes(keyword) || (t.name || '').includes(keyword)
      })
      .map(t => ({
        ...t,
        selected: this.data.teacherIds.includes(t.id),
      }))
    this.setData({ teacherKeyword: keyword, teacherList })
  },

  onTeacherSelect(e) {
    const { id, nickname } = e.currentTarget.dataset
    let { teacherIds, teacherNames } = this.data
    const idx = teacherIds.indexOf(id)
    if (idx >= 0) {
      teacherIds.splice(idx, 1)
      teacherNames.splice(idx, 1)
    } else {
      teacherIds.push(id)
      teacherNames.push(nickname)
    }
    // 更新列表选中状态
    const teacherList = this.data.teacherList.map(t => ({
      ...t,
      selected: teacherIds.includes(t.id),
    }))
    this.setData({ teacherIds, teacherNames, teacherList })
  },

  onTeacherClear() {
    this.setData({ teacherIds: [], teacherNames: [] })
  },

  // 公益
  onPublicWelfareChange(e) {
    this.setData({ isPublicWelfare: e.detail.value })
  },

  // 描述
  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  async onSubmit() {
    const { courseIndex, courses, date } = this.data
    if (courseIndex < 0) {
      wx.showToast({ title: '请选择课程', icon: 'none' })
      return
    }

    const course = courses[courseIndex]
    if (!course) {
      wx.showToast({ title: '课程不存在', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const space = this.data.spaces[this.data.spaceIndex]
      const room = this.data.rooms[this.data.roomIndex]
      await classRecordApi.create({
        date,
        start_time: this.data.startTime || null,
        end_time: this.data.endTime || null,
        course_id: course.id,
        course_name: course.name,
        course_type: course.type || '',
        course_description: this.data.description,
        teacher_ids: this.data.teacherIds,
        is_public_welfare: this.data.isPublicWelfare,
        activity_mode: this.data.activityModes[this.data.activityModeIndex],
        space_id: space?.id || '',
        room_id: room?.id || '',
        room_name: room?.name || '',
        space_name: space?.name || '',
      })
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
