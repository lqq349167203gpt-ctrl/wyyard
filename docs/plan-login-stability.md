# PC 端频繁重新登录 — 修复计划

日期：2026-07-17

## 根因回顾（来自排查报告）

1. JWT 硬过期无续期：默认 168h（7 天），07-01~07-06 期间默认甚至是 24h；无 refresh token、无滑动续期。
2. 共用账号 +「在线设备」互踢：`change-password/index.tsx:58` 读错 localStorage 键（`token` 应为 `authToken`），"当前设备"标识永不显示，用户清理设备时容易误踢自己/同事 → 被踢设备下次请求 401 强制登出。
3. 前端对 401 零容忍：任一请求 401 立即清空登录态跳登录页，无缓冲。
4. 隐患：session 校验只查进程内存（import 时加载一次），多实例部署必然互踢；中间件直接返回的 401 不带 CORS 头（AuthMiddleware 在 CORS 外层）。

## 修复项

| # | 修复 | 文件 |
|---|------|------|
| B1 | token 有效期默认 168h → 720h（30 天） | backend/app/config/settings.py |
| B2 | 滑动续期：剩余有效期不足一半时，用**相同 jti/iat** 重签新 token，通过响应头 `X-New-Token` 下发（jti 不变，session 表无需动，多标签页无冲突） | backend/app/middleware/jwt_auth.py |
| B3 | 401 按原因分类打日志（expired / invalid / kicked / password_changed / disabled），便于以后归因 | backend/app/middleware/jwt_auth.py |
| B4 | session 校验改为每次直查 PostgreSQL，废弃进程内存缓存 | backend/app/services/session_service.py |
| B5 | 禁止退出"当前设备"：DELETE /api/accounts/sessions/{id} 若目标是当前 token 的 jti，返回 400 | backend/app/api/accounts.py |
| B6 | CORSMiddleware 移到最外层，并把 `X-New-Token` 加入 expose_headers（修 401 无 CORS 头问题） | backend/app/main.py |
| F1 | 前端每个响应检查 `X-New-Token` 头，有则更新 localStorage 的 authToken（含上传路径） | frontend/src/lib/api.ts |
| F2 | 修复键名 bug：`token` → `authToken`；当前设备不显示"退出"按钮 | frontend/src/pages/change-password/index.tsx |
| F3 | 登录写入加固：只有拿到 token 才写 `isLoggedIn` | frontend/src/pages/login/index.tsx |

运营建议（不改代码）：员工一人一账号，停用共用 wy_admin；生产环境去掉 `--reload`。

## 前后端契约

- 响应头：`X-New-Token: <jwt>`；新 token 与原 token 仅 `exp` 不同（jti/iat/角色等声明完全保留）。
- 续期触发：服务端校验通过且 `exp - now < jwt_expire_hours * 3600 / 2`。

## 分工

- 子代理 A（后端工程师）：B1–B6，验收 `python -m pytest` + `ruff check app/`
- 子代理 B（前端工程师）：F1–F3，验收 `npx tsc --noEmit` + `npm run build`
- 集成验证：Orchestrator 复核 diff 与测试结果

注意：不提交 git、不动 .env、不改数据库 schema；代码英文、注释中文。
