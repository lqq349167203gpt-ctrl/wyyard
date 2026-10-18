// 跟进安排在各个只读入口共用同一格式；保留完整日期字段，仅缩短显示。
function followUpPlanText(note) {
  const date = String(note.next_follow_up_date || '').replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1/$2')
  return [note.next_follow_up_person, date].filter(Boolean).join(' ')
}

function noteRecordText(entries, fallback, inlineMeta = false) {
  if (!Array.isArray(entries) || !entries.length) return fallback || ''
  return entries.map(entry => {
    const meta = [
      `反馈：${entry.author || entry.feedback_person || entry.created_by || '未知'}`,
      followUpPlanText(entry) ? `下次跟进：${followUpPlanText(entry)}` : '',
    ].filter(Boolean).join(inlineMeta ? '　' : '\n')
    return [meta, entry.content || ''].filter(Boolean).join('\n')
  }).join('\n')
}

function formatNoteTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = { followUpPlanText, noteRecordText, formatNoteTime }
