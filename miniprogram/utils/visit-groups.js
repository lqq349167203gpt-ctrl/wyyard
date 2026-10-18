function visitTimeSlot(time) {
  const match = /^(\d{1,2}):[0-5]\d$/.exec(time || '')
  const hour = match ? Number(match[1]) : NaN
  return !Number.isFinite(hour) || hour > 23 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2
}

function decorateVisitGroups(visits) {
  const result = []
  ;['上午', '下午', '晚上', '时间未设置'].forEach((label, slot) => {
    const rows = visits.filter(visit => visitTimeSlot(visit.visit_time) === slot)
    const count = rows.filter(visit => visit.customer_id).length
    const newCount = rows.filter(visit => visit.customer_id && visit.is_new_customer === true).length
    const oldCount = rows.filter(visit => visit.customer_id && visit.is_new_customer === false).length
    rows.forEach((visit, index) => {
      result.push(Object.assign({}, visit, {
        time_group: index === 0 ? { label, count, newCount, oldCount } : null,
        can_move_up: index > 0,
        can_move_down: index < rows.length - 1,
        group_last: index === rows.length - 1,
      }))
    })
  })
  return result
}

function buildVisitDisplayGroups(visits, filter = '') {
  const groups = []
  ;['上午', '下午', '晚上', '时间未设置'].forEach((label, slot) => {
    const rows = visits.filter(visit => visitTimeSlot(visit.visit_time) === slot)
    if (!rows.length) return
    const items = rows.filter(visit => !filter || (filter === 'new' ? visit.is_new_customer === true : visit.is_new_customer === false))
    groups.push({
      slot, label, filter,
      count: rows.filter(visit => visit.customer_id).length,
      newCount: rows.filter(visit => visit.customer_id && visit.is_new_customer === true).length,
      oldCount: rows.filter(visit => visit.customer_id && visit.is_new_customer === false).length,
      items,
    })
  })
  return groups
}

module.exports = { visitTimeSlot, decorateVisitGroups, buildVisitDisplayGroups }
