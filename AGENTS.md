# wyyard — 疗愈行业后台管理平台

## 项目定位
疗愈行业后台管理平台 — 用户管理、活动日历、付费项目、会员身份、账号权限、系统日志，含客户端小程序。

## 技术栈
- **前端**：React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **后端**：Python 3.11+ + FastAPI
- **数据持久化**：PostgreSQL（psycopg2），连接串通过 `DATABASE_URL` 环境变量配置
- **小程序**：微信小程序原生框架，员工端与客户端为独立小程序（不同 appid，不同二维码入口）

## 目录结构
```
wyyard/
├── AGENTS.md                 # 项目规范（本文件）
├── frontend/                 # React 前端（管理端）
│   ├── src/
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面
│   │   ├── hooks/            # 自定义 hooks
│   │   ├── lib/              # 工具函数、API 调用（api.ts）
│   │   └── types/            # TypeScript 类型定义
│   ├── public/
│   └── package.json
├── miniprogram/              # 微信小程序（员工端，独立 appid）
│   ├── pages/                # 页面（客户/邀约/课表/我的）
│   ├── components/           # 组件
│   ├── utils/                # API 封装、活动常量
│   └── app.js                # 登录管理
├── miniprogram-client/       # 微信小程序（客户端，独立 appid，不同二维码入口）
│   ├── pages/                # 页面（首页/我的）
│   ├── components/           # 组件
│   ├── utils/                # API 封装
│   └── app.js                # 登录管理
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── api/              # API 路由（每个资源一个文件）
│   │   ├── services/         # 业务逻辑
│   │   ├── models/           # 数据模型（Pydantic）
│   │   ├── middleware/       # 中间件（JWT 认证、操作日志）
│   │   └── config/           # 配置（pydantic-settings）
│   ├── data/                 # JSON 数据文件
│   ├── requirements.txt
│   └── pyproject.toml
```

## 页面清单
| 侧边栏分组 | 页面 | 路由 |
|------------|------|------|
| 数据 | 提醒 | /business-reminders |
| 数据 | 数据记录 | /data-records |
| 数据 | 会员情况 | /member-statistics |
| 数据 | 产品销售 | /product-sales |
| 数据 | 服务数据 | /statistics |
| 报表 | 每日报表 | /daily-report |
| 业务 | 客户资料 | /healing-records |
| 业务 | 邀约 | /courses/class-records |
| 业务 | 课表 | /courses/daily-activities |
| 业务 | 沟通记录 | /communication-records |
| 付费 | 付费项目 | /payment |
| 付费 | 销卡 | /payment-deductions |
| 付费 | 退费 | /payment-refunds |
| 信息配置 | 会员身份 | /config/member-identities |
| 信息配置 | 疗愈老师 | /healing-identities |
| 信息配置 | 组织管理 | /organizations |
| 信息配置 | 空间配置 | /courses/spaces |
| 信息配置 | 提醒配置 | /config/reminders |
| 账号管理 | 账号管理 | /positions/management |
| 账号管理 | 密码修改 | /change-password |
| 系统 | AI 配置 | /agents |
| 系统 | 沟通记录 | /chat-history |
| 系统 | 系统日志 | /system-logs |
| 系统 | 操作日志 | /operation-logs |
| **小程序（员工）** | 客户列表 | /pages/customers/index |
| **小程序（员工）** | 邀约 | /pages/visits/index |
| **小程序（员工）** | 课表 | /pages/activities/index |
| **小程序（员工）** | 我的 | /pages/me/index |
| **小程序（客户端）** | 首页 | miniprogram-client /pages/home/index |
| **小程序（客户端）** | 活动详情 | miniprogram-client /pages/activity-detail/index |
| **小程序（客户端）** | 我的 | miniprogram-client /pages/me/index |

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

### 冗余代码检测
- **提交前**运行 `bash scripts/check-dead-code.sh`，确保无新增冗余
- 后端用 `ruff check app/` 检测未使用导入/变量（F401、F841）
- 前端用 `npx knip` 检测未使用文件/导出
- **发现未使用文件**：先移到 `archive/` 目录，确认无影响后再删除，不要直接删
- **废弃方法**：必须标注 `# [已废弃]` 注释 + 写明替代方案，不能直接删除
- `archive/` 下的文件不参与构建和检测，保留至少 30 天再清理

## 验证命令
- 前端：`cd frontend && npm run build`
- 后端：`cd backend && python -m pytest`
- 类型检查：`cd frontend && npx tsc --noEmit`

## 飞书多维表格对接
- 通过飞书 OpenAPI 读写多维表格
- 表格结构变更需先在飞书端操作，再更新后端模型
- 使用 lark-cli 进行本地调试和验证

## 红线（必须先问）
- 删除文件或数据库表(跳过)
- 修改 .env 或密钥配置(跳过)
- 数据库 schema 变更(跳过)
- git push / force push
- 安装新的全局依赖
- 公开发布
- 修 bug 必须执行第一性原理：找到根因，不要绕过症状


<claude-mem-context>
# Memory Context

# [wyyard] recent context, 2026-07-24 2:59pm GMT+8

No previous sessions found.
</claude-mem-context>