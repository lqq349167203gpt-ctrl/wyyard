const CATEGORIES = [
  { category: 'customer_info', label: '深度需求' },
  { category: 'follow_up', label: '跟进点' },
  { category: 'customer_feedback', label: '客户反馈' },
]

function decorateRoster(course, notes) {
  return (course.participants || []).map(person => {
    const needs = person.visit_needs || []
    const tags = []
    needs.forEach(note => (note.need_tags || []).forEach(tag => {
      if (!tags.some(item => item.id === tag.id)) tags.push(tag)
    }))
    const texts = needs.map(note => note.detail_content === undefined ? note.content : note.detail_content).filter(Boolean)
    const ownNotes = (notes || []).filter(note => note.customer_id === person.id)
    return { ...person,
      needs: texts.join('\n'), tags,
      status: person.withdrawn ? '已退课' : person.attended ? '已上课' : '待确认上课',
      hasRecords: ownNotes.length > 0,
      recordText: ownNotes.length ? '查看 / 填写记录' : '填写记录',
    }
  })
}

function markCoursePagesDirty() {
  getCurrentPages().forEach(page => {
    if (['pages/activities/index', 'pages/course-roster/index'].includes(page.route)) page._needRefresh = true
  })
}

module.exports = { CATEGORIES, decorateRoster, markCoursePagesDirty }
