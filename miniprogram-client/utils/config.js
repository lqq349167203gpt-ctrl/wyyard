// 全局环境总开关
//   DEV = true  → 后端连本机 localhost:8000
//   DEV = false → 后端连生产 https://www.wyteahouse.cn
const DEV = true

const BASE_URL = DEV
  ? 'http://localhost:8000'
  : 'https://www.wyteahouse.cn'

module.exports = { DEV, BASE_URL }
