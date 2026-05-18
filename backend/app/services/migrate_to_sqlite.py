"""
一次性脚本：将现有 JSON 数据文件迁移到 SQLite。

运行方式：
    cd backend && python3 -m app.services.migrate_to_sqlite
"""
import json
import os
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DB_PATH = str(DATA_DIR / "wyyard.db")

# 确保存储模块路径可用
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


def main():
    import sqlite3

    json_files = sorted(DATA_DIR.glob("*.json"))
    if not json_files:
        print("没有找到 JSON 数据文件")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    total_records = 0
    success = 0
    skipped = 0

    for fp in json_files:
        table = fp.stem  # 文件名去 .json 即表名
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not data:
            print(f"  {fp.name}: 空文件，跳过")
            continue

        # customer_ai_config 是平铺 dict，包装一下
        if fp.name == "customer_ai_config.json" and not any(
            isinstance(v, dict) for v in data.values()
        ):
            data = {"default": data}

        # 建表
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS [{table}] (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
        )

        # 清空已存在的数据（幂等）
        conn.execute(f"DELETE FROM [{table}]")

        count = 0
        for key, value in data.items():
            conn.execute(
                f"INSERT INTO [{table}] (id, data) VALUES (?, ?)",
                (key, json.dumps(value, ensure_ascii=False)),
            )
            count += 1

        conn.commit()
        total_records += count
        success += 1
        print(f"  {fp.name} → 表 [{table}] ✓ ({count} 条)")

    # 验证
    print(f"\n总计: {success} 个文件, {total_records} 条记录")
    print("验证:")
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    for t in tables:
        count = conn.execute(f"SELECT COUNT(*) as c FROM [{t['name']}]").fetchone()["c"]
        print(f"  表 [{t['name']}]: {count} 条")

    conn.close()
    print("\n迁移完成。JSON 文件建议移动到 data/json_backup/ 目录保留备用。")


if __name__ == "__main__":
    main()
