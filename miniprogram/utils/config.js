// 全局环境总开关（手动维护，全项目仅此一处，无任何环境自动探测）
//   开发/测试期：DEV = true  → 后端连电脑局域网地址，模拟器和同一 Wi-Fi 下的手机均可访问
//   上线/提审前：DEV = false → 后端连生产 https://www.wyteahouse.cn，关闭全部调试逻辑
// check-release.sh 在 DEV = true 时会直接拦截上传，防止测试地址进入提审包。
const DEV = false
const DEV_HOST = '192.168.31.131'

const BASE_URL = DEV
  ? `http://${DEV_HOST}:8000`
  : 'https://www.wyteahouse.cn'

module.exports = { DEV, DEV_HOST, BASE_URL }
