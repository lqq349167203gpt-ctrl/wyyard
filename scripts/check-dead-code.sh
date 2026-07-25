#!/bin/bash
# 冗余代码检测脚本
# 用法: bash scripts/check-dead-code.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  冗余代码检测"
echo "=========================================="
echo ""

ISSUES=0

# 1. 后端：ruff 检查未使用导入/变量
echo -e "${YELLOW}[1/4] 后端：ruff 检查未使用导入/变量${NC}"
cd "$PROJECT_ROOT/backend"
if command -v .venv/bin/ruff &> /dev/null; then
    set +e
    RUFF_OUTPUT=$( .venv/bin/ruff check app/ --select F401,F841 2>&1 )
    RUFF_EXIT=$?
    set -e
    if [ $RUFF_EXIT -ne 0 ]; then
        echo "$RUFF_OUTPUT"
        ISSUES=$((ISSUES + 1))
    else
        echo -e "${GREEN}  ✓ 无未使用导入/变量${NC}"
    fi
else
    echo "  ⚠ ruff 未安装，跳过"
fi
echo ""

# 2. 前端：knip 检测未使用文件
echo -e "${YELLOW}[2/4] 前端：knip 检测未使用文件${NC}"
cd "$PROJECT_ROOT/frontend"
if command -v npx &> /dev/null; then
    KNIP_OUTPUT=$( npx knip --no-exit-code 2>&1 || true )
    # 未使用文件/依赖判为问题；ui 组件库的未使用导出（shadcn 样板）仅作信息展示
    if echo "$KNIP_OUTPUT" | grep -q "Unused files\|Unused dependencies"; then
        echo "$KNIP_OUTPUT" | grep -E "^(Unused|src/|@)" | head -30
        ISSUES=$((ISSUES + 1))
    else
        echo -e "${GREEN}  ✓ 无未使用文件${NC}"
    fi
else
    echo "  ⚠ npx 未找到，跳过"
fi
echo ""

# 3. 自定义：检测后端废弃标记
echo -e "${YELLOW}[3/4] 后端：检测废弃标记${NC}"
DEPRECATED=$( grep -rn "已废弃\|deprecated\|不再使用\|TODO.*删除" "$PROJECT_ROOT/backend/app/" --include="*.py" 2>/dev/null || true )
if [ -n "$DEPRECATED" ]; then
    echo "$DEPRECATED"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}  ✓ 无废弃标记${NC}"
fi
echo ""

# 4. 自定义：检测前端 console.log
echo -e "${YELLOW}[4/4] 前端：检测 console.log${NC}"
CONSOLE_LOG=$( grep -rn "console\.log" "$PROJECT_ROOT/frontend/src/" --include="*.ts" --include="*.tsx" 2>/dev/null || true )
if [ -n "$CONSOLE_LOG" ]; then
    echo "$CONSOLE_LOG"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}  ✓ 无 console.log${NC}"
fi
echo ""

# 汇总
echo "=========================================="
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}  ✓ 未发现冗余代码${NC}"
else
    echo -e "${RED}  ✗ 发现 $ISSUES 类问题${NC}"
fi
echo "=========================================="

exit $ISSUES
