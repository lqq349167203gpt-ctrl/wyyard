// 构建标记：每次上传提审前更新 BUILD_TAG（格式 YYYYMMDD.HHmm）。
// 用途：登录页底部展示，扫体验版二维码即可核对当前包是否包含某次修复，
// 避免「改了但没传上 / 提审选错包」这类问题无法自证。
const APP_VERSION = '1.1.0'
const BUILD_TAG = '20260717.1630'

module.exports = { APP_VERSION, BUILD_TAG }
