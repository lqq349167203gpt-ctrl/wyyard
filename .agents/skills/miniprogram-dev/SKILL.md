---
name: miniprogram-dev
description: 开发、修改或排查 wyyard 项目微信小程序时必须遵循的项目级规范。涵盖员工端 miniprogram/ 与客户端 miniprogram-client/ 两个独立小程序的页面开发、API 封装调用、登录鉴权、样式约定与后端 FastAPI 对接。触发场景：「改小程序」「加一个员工端页面」「客户端首页调整」「小程序登录/token 问题」「小程序调后端接口」「新建小程序页面」「tabBar/导航调整」「wxml/wxss 样式修改」等任何涉及两个 miniprogram 目录的工作。
---

# 微信小程序开发规范（wyyard）

## 1. 两个小程序的分工

| | 员工端 | 客户端 |
|---|---|---|
| 目录 | `miniprogram/` | `miniprogram-client/` |
| appid | `wxefe15693e167e37a` | `wx604733eb8d853230` |
| 用户 | 店内员工（账号体系 + 权限） | 到店客户（手机号即身份） |
| 页面规模 | 19 个页面、4 个 tab（客户/邀约/课表/我的） | 3 个页面、2 个 tab（首页/我的） |
| 后端 BASE_URL | `https://www.wyteahouse.cn`（写死在 utils/api.js） | `http://localhost:8000`（写死在 utils/api.js） |
| 登录方式 | 微信 code 登录 + 账号绑定；devMode 自动 dev-login | `getPhoneNumber` 手机号一键登录 |

先确认用户说的是哪一端，再动对应目录；两端代码、storage key、登录态完全独立，不要互相复用页面或工具文件。

## 2. 红线

- 所有后端请求必须走 `utils/api.js` 导出的 API 命名空间对象（如 `visitApi`、`customerApi`、`clientApi`），禁止在页面里直接写 `wx.request`。
- 员工端页面 `onLoad`/`onShow` 第一行必须是 `if (!getApp().checkLogin()) return`（devMode 下 checkLogin 直接放行）。
- 新增 API 端点时，在 `utils/api.js` 里按现有命名空间模式追加，禁止散落定义。
- 员工端 token 存 storage key `auth_token`，客户端存 `client_token`，永不混用。
- 员工端 `utils/api.js` 的 BASE_URL 是生产域名，客户端是 localhost；改 BASE_URL 前先向用户确认目标环境，不要擅自切换。
- 新页面必须在对应端 `app.json` 的 `pages` 数组注册，否则无法跳转；tabBar 页面改动需同步准备 tab 图标（`images/` 目录）。
- `project.config.json` 的 appid 是两端发布身份，禁止改动或互换。
- 员工端 `app.js` 的 `devMode: false` 是代码级开关：置 true 会以写死的用户名自动 dev-login（仅限本地调试后端时由用户明确要求再开）。

## 3. 新建页面标准步骤

1. 在对应端 `pages/<page-name>/` 下建 4 个文件：`index.js`、`index.json`、`index.wxml`、`index.wxss`。
2. 在 `app.json` 的 `pages` 数组追加 `"pages/<page-name>/index"`。
3. `index.js` 按现有页面骨架写：顶部 `const { xxxApi } = require('../../utils/api')`，`onLoad` 首行 `checkLogin()`（仅员工端），数据加载封装成 `loadData()`。
4. 页面间跳转用 `wx.navigateTo({ url: '/pages/xxx/index?id=' + id })`；返回列表页需要刷新时，设 `getApp()._pageNeedRefresh` 或目标页已有的 `_needRefresh` 标记（见 references/page-patterns.md）。
5. 需要下拉刷新就在 `index.json` 加 `"enablePullDownRefresh": true`；需要自定义组件就在 `usingComponents` 注册（组件统一放 `components/` 目录）。
6. 样式用 rpx，遵循 `app.wxss` 全局类与配色（见第 5 节）。

页面骨架、分页/刷新模式、表单模式、导航传参的细节模板：读 `references/page-patterns.md`。

## 4. API 调用与登录流程（要点）

- 员工端 `request(path, options)`：自动带 `Authorization: Bearer <auth_token>`；401 自动清登录态并 reLaunch 到登录页；错误信息从 `res.data.detail || message || error` 提取并自动 toast（`options.silent` 可关）。
- 员工端登录链路：`wx.login` 拿 code → `authApi.login(code)` → 已绑定则存 token/账号/权限到 storage + globalData；未绑定走账号密码绑定。devMode 下每次启动自动 `authApi.devLogin()` 并重写 token。
- 客户端登录链路：`me` 页 `button open-type="getPhoneNumber"` → `wechatApi.customerLogin(e.detail.code)` → `app.saveLogin(token, customer)`。客户端 401 只清 token + toast「请先登录」，不强制跳页。
- 付费项目类接口用 `paymentApi` + `_projectApi` 工厂按类型分发（7 种项目类型常量 `PAYMENT_PROJECT_TYPES`），新增项目类型时同步维护工厂与常量。

request 封装的完整行为、options 参数、两端封装差异、如何新增 API 模块：读 `references/api-patterns.md`。

## 5. 样式与视觉约定

- 全局样式在 `app.wxss`：背景 `#f7f8fa`，正文 `#1f2329`，次要 `#8f959e`，主题色 `#3370ff`（tabBar 选中色）；通用类 `.container`、`.form-card`、`.form-item` 直接用。
- 尺寸一律 rpx；页面根节点包 `.page { min-height: 100vh; background-color: #f7f8fa; }`。
- 用户对视觉要求高，客户端首页有设计预览工作流：`miniprogram-client/pages/home/styles/` 下用 HTML 文件在浏览器里快速迭代多版风格，定稿后再翻译成 WXML/WXSS。做客户端视觉改版时沿用此流程：先出 HTML 预览稿给用户确认，再落到小程序代码。
- 员工端风格对齐飞书系（蓝白灰、卡片式、12rpx 圆角）；客户端是疗愈品牌调性，暖色、柔和、留白多。不要跨端搬配色。

## 6. 与后端 FastAPI 的对接约定

- 后端路由在 `backend/app/api/<resource>.py`，每个文件一个 `APIRouter(prefix="/api/<resource>")`，在 `backend/app/main.py` 用 `include_router` 注册。
- 员工端接口直接挂在资源前缀下（如 `/api/customers`、`/api/visits`）；客户端专用接口统一走 `/api/client` 前缀（`backend/app/api/client.py`）；微信登录类接口在 `/api/wechat` 下。
- 小程序要调新接口时：先确认后端路由已存在并注册，再到 `utils/api.js` 加封装方法，最后页面调用。路径必须与后端 prefix 完全一致。

## 7. references 索引

- `references/api-patterns.md` — request 封装细节、API 命名空间组织、新增 API/项目类型步骤、两端封装差异对照。
- `references/page-patterns.md` — 页面 4 文件骨架、生命周期守卫、分页/下拉刷新/跨页刷新模式、导航传参、客户端设计预览工作流。
