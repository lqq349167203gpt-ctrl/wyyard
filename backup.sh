#!/bin/bash
# wyyard 数据库自动备份脚本
# 保留最近 30 天的备份

BACKUP_DIR="/Users/yzh/code/wyyard/backups"
DB_NAME="wyyard"
DB_USER="wyyard"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/wyyard_$TIMESTAMP.sql"

# 导出数据库
pg_dump -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_FILE" 2>/dev/null

# 压缩
gzip "$BACKUP_FILE" 2>/dev/null

# 删除 30 天前的备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete 2>/dev/null
