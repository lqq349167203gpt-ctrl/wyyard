# 无忧小院数据平台 — 前端

React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS

## 启动

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 生产构建
npx tsc --noEmit   # 类型检查
```

## 目录结构

```
src/
├── components/    # 通用组件（ui/, layout/, visits/, pagination-bar 等）
├── pages/         # 页面组件，每个页面一个文件夹
├── hooks/         # 自定义 hooks（use-pagination 等）
├── lib/           # API 调用（api.ts）、工具函数
└── types/         # TypeScript 类型定义
```

## 开发约定

- API 调用统一走 `src/lib/api.ts`，不在组件里直接 fetch
- 样式用 Tailwind class，不写自定义 CSS 除非必要
- 组件拆分粒度：一个组件只做一件事
- 页面路由放在 `src/pages/`，每个页面一个文件夹
