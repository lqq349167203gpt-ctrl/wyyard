# 无忧茶苑 — PC 前端

React + TypeScript + Vite。依赖版本见 package.json 和 package-lock.json。

## 常用命令

从本目录执行：

```bash
npm ci
npm run dev
npm run build
npm run lint
```

build 已包含 TypeScript 检查。运行地址以终端输出为准，后端代理见 vite.config.ts。

## 代码入口

- src/components/：公共组件
- src/pages/：业务页面
- src/hooks/：公共 hooks
- src/lib/api.ts：统一接口封装
- src/types/：类型定义

协作规则见 [AGENTS.md](../AGENTS.md)，界面开发见 [UI 规范](../.agents/skills/wyyard-ui-design/SKILL.md)，服务端启动见 [项目说明](../docs/README.md)。
