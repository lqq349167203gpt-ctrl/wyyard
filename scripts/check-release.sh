#!/bin/bash
# 提审前检查：防止调试逻辑/测试地址泄漏进提审包
# 用法: bash scripts/check-release.sh [小程序目录，默认 miniprogram]
# 退出码: 0=通过可提审，1=存在阻断项（禁止上传）
#
# 当前架构：无环境自动探测，utils/config.js 的 DEV 总开关手动切换。
# DEV = true（开发态）时本脚本必然拦截上传——这是设计意图，不是误报。

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP_DIR="${1:-$PROJECT_ROOT/miniprogram}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAIL=0

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo "=========================================="
echo "  小程序提审前检查"
echo "  目录: $MP_DIR"
echo "=========================================="
echo ""

if [ ! -d "$MP_DIR" ]; then
  fail "小程序目录不存在: $MP_DIR"
  exit 1
fi

CONFIG_JS="$MP_DIR/utils/config.js"
API_JS="$MP_DIR/utils/api.js"

# ── 1. DEV 总开关：提审包必须是生产态 ─────────────────────────
if [ -f "$CONFIG_JS" ]; then
  if grep -qE "const DEV\s*=\s*true" "$CONFIG_JS"; then
    fail "utils/config.js 中 DEV = true（开发态）：后端指向 localhost，禁止上传！上线前请将 DEV 改为 false"
  else
    pass "DEV 总开关已关闭（生产态）"
  fi

  if grep -q "https://www.wyteahouse.cn" "$CONFIG_JS"; then
    pass "config.js 包含生产地址 https://www.wyteahouse.cn"
  else
    fail "config.js 缺少生产地址 https://www.wyteahouse.cn"
  fi

  if grep -qE "const BASE_URL\s*=\s*['\"]http://(localhost|127\.0\.0\.1)" "$CONFIG_JS"; then
    fail "BASE_URL 被无条件写死为 localhost（无开关控制，审核必挂）"
  else
    pass "BASE_URL 经由 DEV 开关切换，未被无条件写死"
  fi
else
  fail "未找到 $CONFIG_JS（环境总开关文件缺失）"
fi

# ── 2. devMode 必须由 DEV 总开关派生，禁止硬编码 ───────────────
if grep -rqE "devMode:\s*true" "$MP_DIR" --include="*.js"; then
  fail "存在硬编码 devMode: true（调试逻辑会随提审包发布）"
  grep -rnE "devMode:\s*true" "$MP_DIR" --include="*.js" | head -3
else
  pass "无硬编码 devMode: true"
fi

if grep -qE "devMode:\s*DEV" "$MP_DIR/app.js"; then
  pass "app.js devMode 由 DEV 总开关派生"
else
  fail "app.js devMode 未由 DEV 总开关派生"
fi

# 全项目禁止环境自动探测（用户决策：改手动开关，探测代码已删除）
if grep -rn "getAccountInfoSync" "$MP_DIR" --include="*.js" >/dev/null 2>&1; then
  fail "代码中仍存在 getAccountInfoSync 环境探测（已决策改手动开关，应删除）:"
  grep -rn "getAccountInfoSync" "$MP_DIR" --include="*.js" | head -3
else
  pass "无 getAccountInfoSync 环境探测残留"
fi

# ── 3. 登录页与登录请求的结构守卫 ─────────────────────────────
LOGIN_WXML="$MP_DIR/pages/login/index.wxml"
LOGIN_JS="$MP_DIR/pages/login/index.js"
if [ -f "$LOGIN_WXML" ]; then
  if grep -qE "dev-toggle[^>]*wx:if=\"\{\{isDev\}\}\"|wx:if=\"\{\{isDev\}\}\"[^>]*dev-toggle" "$LOGIN_WXML"; then
    pass "登录页 dev 入口已被 isDev 门控"
  elif grep -q "dev-toggle" "$LOGIN_WXML"; then
    fail "登录页 dev 入口未做开关门控（审核员可见开发模式）"
  fi
fi
if [ -f "$LOGIN_JS" ]; then
  if grep -qE "if \(!this\.data\.isDev\) return" "$LOGIN_JS"; then
    pass "登录页 onToggleDev 有 isDev 兜底拦截"
  else
    fail "登录页 onToggleDev 缺少 isDev 兜底拦截"
  fi
fi

# 登录类请求必须 skipAuth：dev-login 失败不得阻断账号密码登录
if [ -f "$API_JS" ]; then
  if grep -qE "passwordLogin:.*skipAuth:\s*true" "$API_JS"; then
    pass "passwordLogin 已 skipAuth（登录流程不依赖 dev-login）"
  else
    fail "passwordLogin 缺少 skipAuth: true（dev-login 失败会阻断账号密码登录，审核必挂）"
  fi
fi

# 历史驳回文案必须从代码中物理消失（回归守卫）
if grep -rn "登录未返回" "$MP_DIR" --include="*.js" >/dev/null 2>&1; then
  fail "代码中仍存在「登录未返回」字样（两次驳回的原文，必须彻底移除）:"
  grep -rn "登录未返回" "$MP_DIR" --include="*.js" | head -3
else
  pass "「登录未返回」已从代码中物理删除"
fi

# ── 4. app.json：permission 只允许 scope.userLocation ──────────
APP_JSON="$MP_DIR/app.json"
if [ -f "$APP_JSON" ]; then
  BAD_PERM=$(grep -oE "\"scope\.[a-zA-Z.]+\"[:：]" "$APP_JSON" | grep -v "scope.userLocation" || true)
  if [ -n "$BAD_PERM" ]; then
    fail "app.json permission 含不支持的键: $BAD_PERM"
  else
    pass "app.json permission 合法"
  fi
fi

# ── 5. 提示项：localhost 出现位置汇总（应只在 config.js 的开关分支里）──
LOCALHOST_HITS=$(grep -rn "localhost\|127\.0\.0\.1" "$MP_DIR" --include="*.js" --include="*.json" | grep -v "utils/config.js" || true)
if [ -n "$LOCALHOST_HITS" ]; then
  warn "config.js 之外也发现 localhost 引用，请人工确认:"
  echo "$LOCALHOST_HITS" | head -5
fi

# ── 6. 生产后端冒烟：提审包将直连该地址，上传前必须可用 ──────────
if command -v curl >/dev/null 2>&1; then
  HEALTH=$(curl -sS -m 10 https://www.wyteahouse.cn/api/health 2>/dev/null || true)
  if echo "$HEALTH" | grep -qE '"status"\s*:\s*"ok"'; then
    pass "生产后端健康检查通过"
  else
    fail "生产后端 https://www.wyteahouse.cn/api/health 不可达或异常: ${HEALTH:-无响应}"
  fi

  LOGIN_RESP=$(curl -sS -m 10 -X POST https://www.wyteahouse.cn/api/accounts/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"__release_check__","password":"__release_check__"}' 2>/dev/null || true)
  if echo "$LOGIN_RESP" | grep -qE '"success"\s*:\s*false'; then
    pass "生产登录接口返回结构正确（错误凭据返回 success:false）"
  else
    fail "生产登录接口返回结构异常（提审包登录必挂）: ${LOGIN_RESP:-无响应}"
  fi
else
  warn "未安装 curl，跳过生产后端冒烟检查"
fi

echo ""
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}检查通过，可以上传提审。${NC}"
  echo "提醒："
  echo "  1. 审核表单中记得填写测试账号的用户名和密码。"
  echo "  2. MP 后台「开发管理-开发设置-服务器域名」的 request 合法域名必须包含 https://www.wyteahouse.cn"
  echo "     （开发者工具默认不校验域名，本地正常不代表审核环境正常）。"
  echo "  3. 上传后先用真机扫体验版二维码（关闭调试模式）自测登录，再提审。"
  echo "  4. 核对登录页底部构建标记与本次上传一致。"
  exit 0
else
  echo -e "${RED}存在阻断项，禁止上传！修复后重新运行本脚本。${NC}"
  exit 1
fi
