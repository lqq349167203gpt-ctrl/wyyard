// 与后端相同：优先使用多人关系数组，旧姓名不按标点拆分。
function customerReferrers(customer) {
  const names = Array.isArray(customer.referrers) ? customer.referrers : [customer.referrer || '']
  return Array.from(new Set(names.map(name => name.trim()).filter(Boolean)))
}

module.exports = { customerReferrers }
