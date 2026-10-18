const { MEMBERSHIP_CATALOG, OFFLINE_COURSE_TYPES, OH_READING_TYPES } = require('./business-catalog-data')

const CARD_TYPES = MEMBERSHIP_CATALOG.map(item => ({
  key: item.name, label: item.name, price: item.price, count: item.count === null ? '' : item.count,
  duration_type: 'month', duration_value: item.duration_months === null ? '' : item.duration_months,
}))
module.exports = { CARD_TYPES, OFFLINE_COURSE_TYPES, OH_READING_TYPES }
