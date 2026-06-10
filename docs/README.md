# wyyard_project 文档

## 项目概述

wyyard_project 是一个企业级 AI 综合管理平台，提供用户管理、活动日历、付费项目、账号权限、系统日志等完整业务模块。

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.11+
- npm 或 yarn

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端将在 http://localhost:5173 启动。

### 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

后端将在 http://localhost:8000 启动。

## 功能模块

### 业务模块
- **用户管理**：管理客户信息、会员身份、到场记录
- **疗愈记录**：管理疗愈过程记录

### 疗愈活动
- **人员到场**：管理各类活动的人员到场记录与分组（觉醒游戏、情绪释放、能量结、内部课程）
- **活动安排**：独立的活动管理页面，支持编辑、删除、资料上传

### 付费项目
- **会员活动**：管理会员活动信息
- **觉醒游戏**：管理觉醒游戏项目
- **情绪释放**：管理情绪释放项目
- **OH卡梳理**：管理OH卡梳理项目
- **能量结**：管理能量结项目
- **内部课程**：管理内部课程

### 信息配置
- **沙龙类型**：管理活动类型
- **会员身份**：管理会员身份类型
- **疗愈老师**：管理疗愈老师人员配置
- **疗愈空间**：管理疗愈空间

### 账号管理
- **账号管理**：管理系统登录账号
- **角色管理**：管理角色类型与页面权限
- **修改密码**：修改当前登录账号密码

### 系统配置
- **工作台**：系统首页
- **AI 配置**：管理 AI 模型配置
- **知识库**：管理知识库内容
- **业务数据**：管理业务数据
- **操作日志**：查看每个账号对系统的操作记录
- **系统日志**：查看系统运行事件

### 公开页面
- **H5 到场反馈**：`/arrival-feedback/:visitId`，无需登录，手机和桌面自适应

## 数据存储

使用 PostgreSQL 数据库，通过 `DATABASE_URL` 环境变量配置连接（默认 `postgresql://wyyard:wyyard123@localhost:5432/wyyard`）。

主要数据表：
- `customers` - 用户数据
- `visits` - 到场记录
- `positions` - 角色数据
- `accounts` - 账号数据
- `class_records` - 活动日历数据
- `course_types` - 沙龙类型
- `member_identities` - 会员身份
- `membership_cards` - 会员活动卡
- `group_cases` / `group_case_sessions` - 觉醒游戏及场次
- `emotional_releases` / `emotional_release_sessions` - 情绪释放及场次
- `energy_knots` / `energy_knot_sessions` - 能量结及场次
- `internal_courses` / `internal_course_sessions` - 内部课程及场次
- `oh_card_readings` / `oh_card_reading_sessions` - OH卡梳理及场次
- `daily_groupings` - 每日人员分组
- `operation_logs` - 操作日志
- `system_logs` - 系统日志

## API 接口

API 接口统一以 `/api/` 开头，每个资源一个路由文件，位于 `backend/app/api/` 目录。

主要接口：
- `/api/customers` - 用户管理
- `/api/customer-detail/{customer_id}` - 客户详情聚合（购买汇总 + 活动记录 + 收费记录）
- `/api/visits` - 到场记录（支持 `?date=` 和 `?customer_id=` 筛选）
- `/api/visits/{visit_id}` - 获取单个到场记录（H5 反馈页使用）
- `/api/healing-records` - 疗愈记录
- `/api/courses` - 沙龙类型
- `/api/spaces` - 疗愈空间
- `/api/member-identities` - 会员身份
- `/api/membership-cards` - 会员活动
- `/api/group-cases` - 觉醒游戏
- `/api/group-case-sessions` - 觉醒游戏场次
- `/api/emotional-releases` - 情绪释放
- `/api/emotional-release-sessions` - 情绪释放场次
- `/api/energy-knots` - 能量结
- `/api/energy-knot-sessions` - 能量结场次
- `/api/internal-courses` - 内部课程
- `/api/internal-course-sessions` - 内部课程场次
- `/api/oh-card-readings` - OH卡梳理
- `/api/oh-card-reading-sessions` - OH卡梳理场次
- `/api/class-records` - 活动日历
- `/api/daily-groupings` - 每日人员分组
- `/api/accounts` - 账号管理
- `/api/positions` - 角色管理
- `/api/operation-logs` - 操作日志
- `/api/system-logs` - 系统日志

## 开发规范

详见项目根目录的 `CLAUDE.md` 文件。
