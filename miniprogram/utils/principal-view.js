const { followUpPlanText } = require('./note-feedback-meta')

const MIN_DATE = '2026-01-01'
const FEEDBACK_FIELDS = [['visit_need', '来访需求'], ['customer_info', '深度需求'], ['follow_up', '跟进点'], ['customer_feedback', '客户反馈']]

function clampRange(query) {
  const dateFrom = !query.date_from || query.date_from < MIN_DATE ? MIN_DATE : query.date_from
  const dateTo = query.date_to && query.date_to < dateFrom ? dateFrom : query.date_to || null
  return { ...query, date_from: dateFrom, date_to: dateTo }
}

function feedbackFields(person, visible) {
  return FEEDBACK_FIELDS.filter(([key]) => !visible || visible[key]).map(([key, label]) => {
    const entries = (Array.isArray(person[`${key}_entries`]) ? person[`${key}_entries`] : []).filter(entry => entry && String(entry.content || '').trim())
    const notes = entries.length ? entries : person[key] ? [{ content: person[key], author: '未记录' }] : []
    return { key, label, count: notes.length, entries: notes.map((entry, index) => ({
      id: entry.id || `${key}-${index}`, author: entry.author || '未记录', content: entry.content,
      nextFollowUpText: followUpPlanText(entry),
    })) }
  })
}

function courseCard(row, showFeedback, visible) {
  const people = (row.participants || []).map(person => ({
    ...person, feedback: showFeedback ? feedbackFields(person, visible) : [],
  }))
  return { ...row, typeLabel: row.type === '沙龙活动' ? row.course_subtype || row.type : row.type,
    people, visiblePeople: people.slice(0, 4), open: false, hiddenCount: Math.max(0, people.length - 4) }
}

function participationRow(row, open = false) {
  const groups = []
  const activities = (row.activities || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
  activities.forEach((activity, index) => {
    const type = activity.type || '其他活动'
    let group = groups.find(item => item.type === type)
    if (!group) { group = { type, count: 0, records: [] }; groups.push(group) }
    group.count++
    group.records.push({ ...activity, id: `${row.id}-${index}` })
  })
  let remaining = open ? activities.length : 4
  const visibleGroups = groups.map(group => {
    const records = group.records.slice(0, Math.max(0, remaining))
    remaining -= records.length
    return { ...group, records }
  }).filter(group => group.records.length)
  return { ...row, groups, visibleGroups, open, hiddenCount: Math.max(0, activities.length - 4),
    typeText: groups.map(group => `${group.type} ${group.count} 次`).join(' · ') }
}

function organizationScopeOptions(organizations, includeArchived = false, selectedId = '') {
  return [{ id: '', name: '全部可见组织/俱乐部' }, ...(organizations || [])
    .filter(org => includeArchived || org.status !== 'archived' || org.id === selectedId)
    .map(org => ({ ...org, name: org.name + (org.status === 'archived' ? '（已归档）' : '') }))]
}

module.exports = { organizationScopeOptions, MIN_DATE, clampRange, feedbackFields, courseCard, participationRow }
