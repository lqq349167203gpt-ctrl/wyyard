# 页面模板与数据流模式

当需要新建页面、调整页面生命周期/刷新逻辑、或做客户端视觉改版时读此文件。

## 1. 页面 4 文件骨架

每个页面是 `pages/<name>/` 下的 `index.js / index.json / index.wxml / index.wxss`。

`index.json` 典型内容：

```json
{
  "navigationBarTitleText": "页面标题",
  "usingComponents": { "visit-card": "/components/visit-card/index" },
  "enablePullDownRefresh": true
}
```

- 自定义组件统一放 `<端>/components/`，路径以 `/components/...` 绝对路径注册。员工端现有组件：visit-card、voice-input-popup、customer-picker、payment-form、activity-badge、custom-tab-bar。
- 下拉刷新必须在 json 里开 `enablePullDownRefresh`，js 里 `onPullDownRefresh` 结尾调 `wx.stopPullDownRefresh()`。

`index.js` 顶部引入：

```js
const { xxxApi } = require('../../utils/api')
const { formatDate } = require('../../utils/util')  // 员工端工具：formatDate/formatTime/getWeekday/getWeekDates/debounce
```

## 2. 生命周期守卫模式（员工端）

所有需登录页面的固定写法：

```js
onLoad() {
  if (!getApp().checkLogin()) return
  // ...初始化 + loadData()
},
onShow() {
  if (!getApp().checkLogin()) return
  // 刷新逻辑
}
```

onShow/onLoad 竞态处理（visits 页模式）：onLoad 异步初始化期间 onShow 可能先触发，用 `this._initialized` + `this._pendingShowLoad` 标记缓冲，初始化完成后补一次 loadData。

## 3. 列表页数据流模式

状态字段约定：`list / loading / initialized / page / pageSize / total / hasMore`（+ 搜索词 `keyword`）。

```js
async loadData(reset) {
  if (this.data.loading) return
  const page = reset ? 1 : this.data.page + 1
  this.setData({ loading: true })
  try {
    const res = await xxxApi.list({ page, page_size: this.data.pageSize, ... })
    const items = (res && res.items) || (Array.isArray(res) ? res : [])
    const total = (res && res.total) || items.length
    const list = reset ? items : this.data.list.concat(items)
    this.setData({ list, page, total, hasMore: list.length < total, loading: false, initialized: true })
  } catch (e) {
    this.setData({ loading: false, initialized: true })
  }
}
onReachBottom() { if (this.data.hasMore && !this.data.loading) this.loadData(false) }
```

- 响应兼容 `{ items, total }` 与裸数组两种形态。
- 客户端列表页模式相同但用 `.then/.catch` 风格（home 页），并常把列表按日期 `_groupByDate` 分组。

## 4. 跨页刷新标记（_needRefresh 模式）

子页面（表单/详情）改了数据，返回列表页要刷新：

```js
// 子页面操作成功后
const pages = getCurrentPages()
const prev = pages[pages.length - 2]
if (prev) prev._needRefresh = true
wx.navigateBack()

// 列表页 onShow
if (this._needRefresh) { this._needRefresh = false; this.loadData(true) }
```

沿用目标页面已有的标记名，不要新造一套。

## 5. 导航与传参

- 页面间：`wx.navigateTo({ url: '/pages/xxx/index?id=' + id })`，目标页 `onLoad(options)` 取 `options.id`。
- 详情/编辑页按 id 拉数据；新建页与编辑页通常复用同一页面（如 customer-form：有 id 即编辑，无 id 即新建）。
- tabBar 页面之间跳转必须 `wx.switchTab`；登录失效统一 `wx.reLaunch` 到 `/pages/login/index`（员工端）。

## 6. 样式约定

- 单位一律 rpx；`app.wxss` 提供全局基色与类：
  - 背景 `#f7f8fa`、正文 `#1f2329`、次要文字 `#8f959e`、主题蓝 `#3370ff`
  - `.container`（24rpx 32rpx 内边距）、`.form-card`（白底 12rpx 圆角分组卡）、`.form-item` 系列
- 页面 wxss 第一行通常是 `.page { min-height: 100vh; background-color: #f7f8fa; }`。
- 固定定位的顶部控件（如日历条）用 `position: fixed; z-index: 101` 层级约定。

## 7. 客户端视觉改版工作流（重要）

客户端首页目录下有成熟的设计预览流程，用户对美观要求高，改版时必须沿用：

1. 在 `miniprogram-client/pages/home/styles/` 下新建 HTML 预览稿（参照现有 `bg-*.html`、`style-preview.html`：内联 CSS、模拟手机宽度、静态假数据），让设计可在浏览器直接打开对比。
2. 一次可出多版（现有 bg-a 到 bg-FF 二十余版迭代记录），与用户确认定稿方向。
3. 定稿后把样式翻译成 WXML/WXSS 写回页面；不要反过来直接在 wxml 里边改边猜效果。
4. 客户端视觉调性：暖色、柔和、有机形态、多留白（疗愈品牌），区别于员工端的飞书系蓝白灰。
