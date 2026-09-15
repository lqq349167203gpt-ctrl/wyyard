# 无忧茶苑

管理平台：PC 后台、管理端小程序和客户端小程序，共用 FastAPI 后端。

## 目录

- frontend/：PC 界面，说明见 [前端 README](../frontend/README.md)。
- backend/：接口与业务服务，依赖见 [pyproject.toml](../backend/pyproject.toml)。
- miniprogram/、miniprogram-client/：两个独立小程序，分别导入各自目录进行开发。

## 本地启动

前端从项目根目录执行：

```bash
cd frontend
npm ci
npm run dev
```

Node.js 需满足当前 Vite 的 engines 要求（本次核对为 20.19+ 的 20 系列，或 22.12+）。版本以锁文件为准，访问地址以终端输出为准。

后端要求 Python 3.11+ 和 PostgreSQL。先在 backend/.env 或运行环境配置 DATABASE_URL 及当前 settings 要求的配置；不要把真实密钥写入文档。使用已有 uv 从项目根目录执行：

```bash
cd backend
uv venv .venv
uv pip install --python .venv/bin/python -r pyproject.toml --extra dev
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

已有可用 .venv 时跳过创建步骤。当前前端代理将 /api 转至 localhost:8000，修改端口需同步核对 [vite.config.ts](../frontend/vite.config.ts)。小程序地址以各端配置为准，手机不能用 localhost 访问电脑服务。

## 文档与规则

- [项目协作约定](../AGENTS.md)
- [界面视觉基线](../UI-DESIGN-GUIDELINES.md)
- [主理人统计说明](principal-statistics.md)
- [验证规范](../.agents/skills/wyyard-verify/SKILL.md)

页面、接口和表结构以当前源码为准，不在此重复维护清单。数据库测试前必须核实隔离库/schema，不使用正式业务数据。
