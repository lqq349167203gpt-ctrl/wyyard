// 全局环境总开关
//   DEV = true  → 后端连电脑局域网地址，模拟器和同一 Wi-Fi 下的手机均可访问
//   DEV = false → 后端连生产 https://www.wyteahouse.cn
const DEV = false
const DEV_HOST = '192.168.31.141'

const BASE_URL = DEV
  ? `http://${DEV_HOST}:8000`
  : 'https://www.wyteahouse.cn'

module.exports = { DEV, DEV_HOST, BASE_URL }
