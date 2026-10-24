// 名单只需尾号即可匹配，完整手机号不作为选人接口的必要字段。
function customerPhoneSuffix(customer) {
  return String(customer.phone_suffix || customer.phone || '').replace(/[^0-9]/g, '').slice(-4)
}

function matchesCustomerSearch(customer, keyword) {
  const query = String(keyword || '').trim().toLowerCase()
  return !query || [customer.nickname, customer.name].some(value => String(value || '').toLowerCase().includes(query))
    || (/^[0-9]{1,4}$/.test(query) && customerPhoneSuffix(customer).endsWith(query))
}


function customerMaskedPhone(customer) {
  const value = String(customer.phone_masked || customer.phone || "").trim()
  if (value) {
    let digits = value.replace(/[^0-9]/g, "")
    if (digits.length === 13 && digits.startsWith("86")) digits = digits.slice(2)
    const normalized = digits.length === 11 && !value.includes("*") ? digits : value
    if (normalized.length >= 7) return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`
    return normalized.length <= 2 ? "*".repeat(normalized.length) : `${normalized[0]}${"*".repeat(normalized.length - 2)}${normalized.slice(-1)}`
  }
  const suffix = customerPhoneSuffix(customer)
  return suffix ? `****${suffix}` : ""
}

module.exports = { matchesCustomerSearch, customerPhoneSuffix, customerMaskedPhone }
