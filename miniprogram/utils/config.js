// 全局环境总开关（手动维护，全项目仅此一处，无任何环境自动探测）
//   开发/测试期：DEV = true  → 后端连本机 localhost:8000，启用 dev 快捷登录
//   上线/提审前：DEV = false → 后端连生产 https://www.wyteahouse.cn，关闭全部调试逻辑
// check-release.sh 在 DEV = true 时会直接拦截上传，防止测试地址进入提审包。
const DEV = true

const BASE_URL = DEV
  ? 'http://localhost:8000'
  : 'https://www.wyteahouse.cn'

module.exports = { DEV, BASE_URL }
