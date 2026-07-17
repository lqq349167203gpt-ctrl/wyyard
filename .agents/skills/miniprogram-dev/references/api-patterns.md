# API 封装与后端对接细节

当需要新增/修改 API 封装、排查请求或登录问题、或对接新后端接口时读此文件。

## 1. 员工端 request 封装（miniprogram/utils/api.js）

签名：`request(path, options)`，返回 Promise（resolve `res.data`）。

- BASE_URL 按环境自动切换（两端统一约定，禁止写死）：文件顶部 `const { miniProgram: { envVersion } } = wx.getAccountInfoSync()`，`envVersion === 'develop'` 用 `http://localhost:8000`，`trial`/`release` 用 `https://www.wyteahouse.cn`。开发者工具预览默认 develop 走本地，体验版/正式版走生产。
- `options`：`method`（默认 GET）、`data`、`timeout`（默认 60000）、`silent`（true 则出错不 toast）、`skipAuth`（true 跳过 devMode 登录确保，仅 dev-login 自身用）。
- header 自动拼：`Content-Type: application/json` + 有 token 时 `Authorization: Bearer <auth_token>`（token 从 storage 读，不从 globalData）。
- devMode 下每个请求前 `_ensureLogin()`：token 缺失或不含 `.`（非 JWT）就触发 `app._devAutoLogin()`，带 15 秒超时 race，失败 toast「登录失败，请检查服务是否启动」。
- 响应处理：
  - 2xx → resolve(res.data)
  - 401 → 清 storage（auth_token/currentUser/userPermissions）+ 清 globalData + toast「登录已过期」+ 1.5s 后 reLaunch 登录页
  - 其他 → 错误消息取 `res.data?.detail || res.data?.message || res.data?.error || '请求失败'`，非 silent 时 toast
  - 网络失败 → toast「网络错误」

## 2. API 命名空间组织模式

按资源组织成对象导出，方法名短小：

```js
const customerApi = {
  light: (limit) => request(`/api/customers/light${limit ? '?limit=' + limit : ''}`),
  detail: (id) => request(`/api/customer-detail/${id}`),
  list: (params = {}) => { /* Object.entries 过滤空值后拼 query */ },
  create: (data) => request('/api/customers', { method: 'POST', data }),
  update: (id, data) => request(`/api/customers/${id}`, { method: 'PATCH', data }),
  delete: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),
}
```

约定：

- query 参数手动拼接，值必须 `encodeURIComponent`，空值（undefined/null/''）过滤掉。
- 更新一律 PATCH（例外：communicationRecordApi.update 用 PUT，与后端保持一致，新增前先核对后端方法）。
- 所有命名空间在文件底部 `module.exports` 统一导出；页面侧 `const { xxxApi } = require('../../utils/api')`。
- 分页接口约定：`list(params)` 接收 page/page_size，响应可能是 `{ items, total }` 或裸数组，页面侧两种都兼容（见 customers/index.js 的 `res?.items ?? res` 写法）。

## 3. 付费项目工厂模式

- `_projectApi(basePath)` 工厂生成 get/list/listPaginated/create/update/delete/searchCustomers 一套方法。
- `PAYMENT_PROJECT_TYPES` 常量定义 7 种项目类型（key/label/apiPath），`paymentApi.getByType(type)` 做类型 → API 的分发。
- 销卡（`paymentApi.deductions`）与退费（`paymentApi.refunds`）是独立子命名空间，create 时自动从 `getApp().globalData.currentUser` 补 `created_by`（取 `owner ?? username`）。
- 新增项目类型：后端加 router → `_projectApi('/api/<new-path>')` 挂到 paymentApi → `PAYMENT_PROJECT_TYPES` 加常量 → `getByType` 的 map 加映射，四处缺一不可。

## 4. 员工端登录与权限

- storage 三件套：`auth_token`、`currentUser`、`userPermissions`，登录成功/401/logout 时三处（storage、globalData）同步写或清。
- `utils/auth.js` 的 `login()`：`wx.login` → code → `authApi.login(code)` → `bound === false` 返回未绑定态（页面走账号密码绑定，调 `bindAccount`）；已绑定则写三件套。
- `app.js` 的 `checkLogin()`：devMode 直接 true；无 token 则 `wx.reLaunch` 到 `/pages/login/index`。
- 权限存在 `globalData.permissions`（字符串数组），页面按需读取做功能显隐。

## 5. 客户端封装差异（miniprogram-client/utils/api.js）

与员工端的关键差异，改客户端代码前务必注意：

- 签名不同：`request(options)` 接收完整对象 `{url, method, data, header}`，另有 `get(url)`/`post(url, data)` 便捷函数。
- BASE_URL 与员工端同一套 envVersion 环境切换约定（见第 1 节），且通过 `module.exports` 导出了 BASE_URL。
- token 读取顺序：`app.globalData.token || wx.getStorageSync('client_token')`。
- 401 只清 `client_token` + globalData + toast「请先登录」，**不跳转页面**（客户端允许游客浏览，登录动作发生在 me 页）。
- 错误消息只取 `res.data?.detail`。
- 命名空间：`clientApi`（活动列表/详情/报名，前缀 `/api/client`）、`wechatApi.customerLogin(code)`（`/api/wechat/customer-login`）。
- 登录响应：`{ token, customer }`，由 `app.saveLogin(token, customer)` 写入；`app.isLoggedIn()` 判断登录态。

## 6. 后端 FastAPI 对接

- 每个资源一个文件 `backend/app/api/<resource>.py`，顶部 `router = APIRouter(prefix="/api/<resource>", tags=["<resource>"])`，在 `backend/app/main.py` 以 `<resource>_router` 导入并 `app.include_router(...)`。
- 微信登录相关全部在 `backend/app/api/wechat.py`（prefix `/api/wechat`）：`/login`（员工微信 code）、`/bind`、`/dev-login`、`/phone-login`、`/customer-login`（客户手机号）。
- 客户端专用业务接口集中在 `backend/app/api/client.py`（prefix `/api/client`），与员工端接口隔离。
- 鉴权方式：JWT Bearer，`Authorization: Bearer <token>`。
- 小程序端封装方法的路径必须与后端 prefix + 路由 path 完全对齐；HTTP 方法（POST/PATCH/PUT/DELETE）以后端装饰器为准，改之前先查后端文件。
