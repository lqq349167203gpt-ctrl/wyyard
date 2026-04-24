# wyyard_project — AI 综合管理平台

## 项目定位
企业级 AI 综合管理端：Agent 编排、知识库管理、业务数据管理，三合一。

## 技术栈
- **前端**：React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **后端**：Python 3.11+ + LangGraph + FastAPI
- **数据源**：飞书多维表格（通过 lark-cli / 飞书 OpenAPI）
- **模型**：Claude API（Anthropic SDK）

## 目录结构
```
wyyard_project/
├── CLAUDE.md                 # 项目规范（本文件）
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面
│   │   ├── hooks/            # 自定义 hooks
│   │   ├── lib/              # 工具函数、API 调用
│   │   └── types/            # TypeScript 类型定义
│   ├── public/
│   └── package.json
├── backend/                  # LangGraph 后端
│   ├── app/
│   │   ├── agents/           # LangGraph Agent 定义
│   │   ├── graphs/           # LangGraph 工作流图
│   │   ├── api/              # FastAPI 路由
│   │   ├── services/         # 业务逻辑
│   │   ├── models/           # 数据模型
│   │   └── config/           # 配置
│   ├── requirements.txt
│   └── pyproject.toml
└── docs/                     # 项目文档
```

## 开发规范

### 通用
- 代码用英文，注释和文档用中文
- 变量/函数命名用英文，语义清晰，不用拼音
- 密钥、token、密码不进代码、不进 commit、不进日志，统一用 .env 管理
- 改完主动跑验证，不要只改不验

### 前端
- 组件拆分粒度：一个组件只做一件事
- 样式用 Tailwind class，不写自定义 CSS 除非必要
- 状态管理优先 React Context，复杂场景再考虑 Zustand
- API 调用统一走 `src/lib/api.ts`，不在组件里直接 fetch
- 页面路由放在 `src/pages/`，每个页面一个文件夹

### 后端
- Agent 定义和 Graph 定义分离：`agents/` 放 Agent 配置，`graphs/` 放工作流编排
- API 路由按资源分组：`api/agents.py`、`api/knowledge.py`、`api/business.py`
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
