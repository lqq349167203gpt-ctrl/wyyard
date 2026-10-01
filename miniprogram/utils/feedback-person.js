function pickerData(response, note) {
  const options = Array.isArray(response && response.options) ? response.options.slice() : []
  const current = response && response.current_person || {}
  const selected = note && (note.feedback_person_id || note.feedback_person)
    ? { customer_id: note.feedback_person_id || '', name: note.feedback_person || '' }
    : current
  if (selected.name && !options.some(item => selected.customer_id
    ? item.customer_id === selected.customer_id
    : item.name === selected.name)) options.unshift(selected)
  let index = options.findIndex(item => selected.customer_id
    ? item.customer_id === selected.customer_id
    : item.name === selected.name)
  if (index < 0) index = 0
  return { options, index }
}

function attributionFromPicker(options, index) {
  const option = options[index] || {}
  return { feedback_person_id: option.customer_id || '', feedback_person: option.name || '' }
}

module.exports = { pickerData, attributionFromPicker }
