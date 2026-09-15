---
name: miniprogram-dev
description: 开发或排查 wyyard 管理端 miniprogram/ 与客户端 miniprogram-client/ 的页面、API、登录权限和样式；不用于仅后端修改。
---

# 小程序开发

任务边界、数据安全与相关端联动遵循根目录 AGENTS.md。

## 环境与登录

- miniprogram/ 是管理端，miniprogram-client/ 是客户端。核对对应 project.config.json、app.json、app.js 和 utils/api.js 中的 appid、页面、BASE_URL 及 envVersion/devMode，不写死历史配置。
- 不改变 appid，不混用两端 token；沿用当前登录守卫和续期封装，游客页不强制登录，不将网络错误或 403 当作登录失效。
- 保留现有环境，不为调试开启自动登录或切到正式数据；已授权切换时核实目标与可达性。手机 localhost 指手机自身。

## 页面与请求

- 请求走本端 utils/api.js，不在页面新增 wx.request；先核对后端路径、方法、参数及响应。
- 协调 onLoad/onShow，避免重复请求；条件变化重置分页，防止旧响应覆盖新条件，追加与局部更新保留滚动和已加载记录。
- 新页面核对 JS/JSON/WXML/WXSS 和 app.json 分包注册；组件核对 usingComponents；仅 tabBar 变更时处理相应图标。
- 样式复用本端 app.wxss 和相邻页面，通常用 rpx；两端调性独立，不用历史配色覆盖用户指定样式。

## 验证与参考

验证使用 wyyard-verify。小程序源码变更交付时说明需要重新编译/上传；Git 推送不等于微信上传或发布。

- 新建页面或修改生命周期、分页/刷新：读 [page-patterns.md](references/page-patterns.md)。
- 新增 API 或调整请求封装/登录：读 [api-patterns.md](references/api-patterns.md)。

参考是结构示例，运行时配置和业务规则以当前源码为准。
