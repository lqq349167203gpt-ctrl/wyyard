---
name: wyyard-verify
description: wyyard 项目（/Users/yzh/code/wyyard）改完代码后的验证与收尾流水线。触发场景：用户说「收尾」「验证一下」「提交前检查」「改完了」「帮我验证」「跑一下测试」「准备提交 / 提交代码 / commit」「检查冗余代码」等，或在 wyyard 项目完成任何代码修改、准备提交前需要确认无误时使用。覆盖前端 tsc/build、后端 pytest/ruff、冗余代码检测脚本、Git 提交规范与红线操作。
---

# wyyard 验证流水线

项目根目录 `/Users/yzh/code/wyyard`。所有命令在项目根目录或对应子目录执行，不要漏步骤、不要只改不验。

## 执行顺序

### 1. 前端验证（改了 frontend/ 才需要）

```bash
cd frontend && npx tsc --noEmit    # 快速类型检查
cd frontend && npm run build       # build = tsc -b && vite build，验证产物可构建
```

- 两步都跑：tsc 报错更快定位，build 验证 Vite 产物。
- 前端另有 `npm run lint`（eslint），CLAUDE.md 验证命令未列入；用户明确要求 lint 时再跑。

### 2. 后端验证（改了 backend/ 才需要）

后端依赖装在 `backend/.venv`，脚本和命令都用 venv 内可执行文件：

```bash
cd backend && .venv/bin/python -m pytest    # 测试在 tests/，conftest 用 FastAPI TestClient + JWT
cd backend && .venv/bin/ruff check app/     # 配置在 pyproject.toml：F401/F841/I001/E/W，line-length 120，忽略 E501
```

### 3. 冗余代码检测（提交前必跑，无论改了哪端）

```bash
bash scripts/check-dead-code.sh
```

脚本做 4 项检查，退出码 = 问题类别数，非零必须逐项处理：
1. 后端 `ruff check app/ --select F401,F841`（未使用导入/变量）
2. 前端 `npx knip --no-exit-code`（未使用文件/导出/依赖，knip 无配置文件，用默认规则）
3. 后端废弃标记 grep（`已废弃`、`deprecated`、`不再使用`、`TODO.*删除`）
4. 前端 `console.log` grep（`src/**/*.ts(x)` 不允许留 console.log）

## 失败处理原则

- **第一性原理找根因，不绕过症状**：测试失败不得 skip / 注释 / 删用例；类型错误不得用 `any` 糊弄；构建报错不得跳过 build 直接提交。
- knip 报出的未使用文件：**先移到 `archive/` 目录，不直接删除**；`archive/` 不参与构建和检测，保留至少 30 天确认无影响后再清理。
- 废弃方法/接口：**不能直接删除**，必须标注 `# [已废弃]` 注释并写明替代方案。
- 检测到问题先修复再重跑，直到脚本输出「✓ 未发现冗余代码」且各步验证全绿。
- 小程序（miniprogram/、miniprogram-client/）无命令行验证脚本；改动后提示用户在微信开发者工具中编译预览确认。

## Git 规范

- 分支命名：`feat/xxx`、`fix/xxx`、`refactor/xxx`。
- commit 信息用中文，简洁说明做了什么。
- 不提交 `node_modules/`、`__pycache__/`、`.env`、`dist/`。

## 红线（必须先问用户，禁止擅自动手）

- `git push` / `force push`
- 删除文件或数据库表
- 修改 `.env` 或密钥配置
- 数据库 schema 变更
- 安装新的全局依赖
- 公开发布

（注：CLAUDE.md 红线列表中「删除文件或数据库表」「修改 .env」「schema 变更」三条旁注有「(跳过)」，含义不明；安全起见仍按「先问用户」处理，除非用户当场明确授权。）
