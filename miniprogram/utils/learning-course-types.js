const { BUSINESS_LABELS, LEARNING_CATALOG } = require('./business-catalog-data')

const LEARNING_COURSE_TYPES = LEARNING_CATALOG.filter(item => !item.legacy).map(item => item.activity_name)
const LEGACY_LEARNING_COURSE_TYPES = LEARNING_CATALOG.filter(item => item.legacy).map(item => item.activity_name)
const LEARNING_COURSE_GROUPS = [
  { name: BUSINESS_LABELS.learning, items: LEARNING_COURSE_TYPES },
  { name: BUSINESS_LABELS.legacy_learning, items: LEGACY_LEARNING_COURSE_TYPES },
]
const LEARNING_PAYMENT_TYPES = LEARNING_CATALOG.map(item => ({
  key: item.payment_name,
  label: item.legacy ? `${BUSINESS_LABELS.legacy_learning} · ${item.payment_name}` : item.payment_name,
  price: item.price, duration_type: 'month', duration_value: item.duration_months,
}))
module.exports = { LEARNING_COURSE_TYPES, LEGACY_LEARNING_COURSE_TYPES, LEARNING_COURSE_GROUPS, LEARNING_PAYMENT_TYPES }
