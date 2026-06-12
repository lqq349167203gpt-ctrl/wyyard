# wyyard_project — AI 综合管理平台

## 项目定位
企业级 AI 综合管理平台 — 用户管理、活动日历、付费项目、账号权限、系统日志，一站式业务管理。

## 技术栈
- **前端**：React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **后端**：Python 3.11+ + FastAPI
- **数据持久化**：PostgreSQL（psycopg2），连接串通过 `DATABASE_URL` 环境变量配置
- **模型**：Claude API（Anthropic SDK）

## 目录结构
```
wyyard/
├── CLAUDE.md                 # 项目规范（本文件）
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面
│   │   ├── hooks/            # 自定义 hooks
│   │   ├── lib/              # 工具函数、API 调用（api.ts）
│   │   └── types/            # TypeScript 类型定义
│   ├── public/
│   └── package.json
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── api/              # API 路由（每个资源一个文件）
│   │   ├── services/         # 业务逻辑
│   │   ├── models/           # 数据模型（Pydantic）
│   │   ├── middleware/       # 中间件（操作日志自动记录）
│   │   └── config/           # 配置（pydantic-settings）
│   ├── data/                 # JSON 数据文件
│   ├── requirements.txt
│   └── pyproject.toml
```

## 页面清单
| 分组 | 页面 | 路由 |
|------|------|------|
| 业务数据 | 客户信息 | /healing-records |
| 业务数据 | 活动记录 | /activity-records |
| 业务数据 | 消费记录 | /consumption-records |
| 业务数据 | 引流记录 | /traffic-records |
| 活动管理 | 邀约到场 | /courses/class-records |
| 活动管理 | 当日活动 | /courses/class-records |
| 活动管理 | 到场确认 | /courses/class-records |
| 活动管理 | 活动安排 | /courses/daily-activities |
| 付费项目 | 付费项目 | /payment |
| 付费项目 | 会员活动 | /membership-cards |
| 付费项目 | 觉醒游戏 | /group-cases |
| 付费项目 | 情绪释放 | /emotional-releases |
| 付费项目 | 能量结 | /energy-knots |
| 付费项目 | 内部课程 | /internal-courses |
| 付费项目 | 其他项目 | /other-projects |
| 信息配置 | 活动配置 | /positions/courses |
| 信息配置 | 组织管理 | /organizations |
| 信息配置 | 会员身份 | /config/member-identities |
| 信息配置 | 疗愈老师 | /healing-identities |
| 信息配置 | 疗愈空间 | /courses/spaces |
| 信息配置 | 提醒配置 | /config/reminders |
| 账号管理 | 账号管理 | /positions/management |
| 系统配置 | AI 配置 | /agents |
| 系统配置 | 业务提醒 | /business-reminders |
| 系统配置 | 操作日志 | /operation-logs |
| 系统配置 | 系统日志 | /system-logs |

## 开发规范

### 通用
- 代码用英文，注释和文档用中文
- 变量/函数命名用英文，语义清晰，不用拼音
- 密钥、token、密码不进代码、不进 commit、不进日志，统一用 .env 管理
- 改完主动跑验证，不要只改不验
- 所有数据必须有持久化机制（数据库、JSON 文件等），确保服务重启后数据不丢失，除非用户明确要求删除

### 前端
- 组件拆分粒度：一个组件只做一件事
- 样式用 Tailwind class，不写自定义 CSS 除非必要
- 状态管理优先 React Context，复杂场景再考虑 Zustand
- API 调用统一走 `src/lib/api.ts`，不在组件里直接 fetch
- 页面路由放在 `src/pages/`，每个页面一个文件夹
- **昵称搜索统一使用 `CustomerSearchInput`**（`src/components/customer-search-input.tsx`），支持单选/多选/position 过滤/排除/禁用
- **弹窗含搜索输入框时**：DialogContent 加 `initialFocus={false}`，避免自动聚焦搜索框

### 后端
- Agent 定义和 Graph 定义分离：`agents/` 放 Agent 配置，`graphs/` 放工作流编排
- API 路由按资源分组，每个资源一个文件，放在 `backend/app/api/`
- 飞书 API 调用封装在 `services/feishu.py`，不散落在各处
- 错误处理用 FastAPI 的 HTTPException，返回结构化的中文错误信息
- 环境变量通过 `config/settings.py` 统一管理，用 pydantic-settings

### Git
- 分支命名：`feat/xxx`、`fix/xxx`、`refactor/xxx`
- commit 信息用中文，简洁说明做了什么
- 不提交 node_modules/、__pycache__/、.env、dist/

## 验证命令
- 前端：`cd frontend && npm run build`
- 后端：`cd backend && python -m pytest`
- 类型检查：`cd frontend && npx tsc --noEmit`

## 飞书多维表格对接
- 通过飞书 OpenAPI 读写多维表格
- 表格结构变更需先在飞书端操作，再更新后端模型
- 使用 lark-cli 进行本地调试和验证

## 红线（必须先问）
- 删除文件或数据库表
- 修改 .env 或密钥配置
- 数据库 schema 变更
- git push / force push
- 安装新的全局依赖
- 公开发布
