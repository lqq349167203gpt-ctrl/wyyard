"""
一次性脚本：将 SQLite 数据迁移到 PostgreSQL。

运行方式：
    cd backend && python3 -m app.services.migrate_sqlite_to_pg
"""
import json
import os
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
SQLITE_PATH = str(DATA_DIR / "wyyard.db")
PG_URL = os.environ.get("DATABASE_URL", "postgresql://wyyard:wyyard123@localhost:5432/wyyard")

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


def main():
    import sqlite3
    import psycopg2
    import psycopg2.extras

    if not Path(SQLITE_PATH).exists():
        print(f"SQLite 文件不存在: {SQLITE_PATH}")
        return

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    pg_conn = psycopg2.connect(PG_URL)

    # 获取所有 SQLite 表
    tables = sqlite_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()

    total = 0
    for t in tables:
        table = t["name"]
        rows = sqlite_conn.execute(f'SELECT id, data FROM "{table}"').fetchall()
        if not rows:
            print(f"  {table}: 0 条，跳过")
            continue

        # 建 PostgreSQL 表
        with pg_conn.cursor() as cur:
            cur.execute(
                f'CREATE TABLE IF NOT EXISTS "{table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)'
            )
            cur.execute(f'DELETE FROM "{table}"')  # 幂等

        count = 0
        with pg_conn.cursor() as cur:
            for row in rows:
                cur.execute(
                    f'INSERT INTO "{table}" (id, data) VALUES (%s, %s)',
                    (row["id"], row["data"]),
                )
                count += 1

        pg_conn.commit()
        total += count
        print(f"  {table}: {count} 条 ✓")

    # 验证
    print(f"\n总计: {total} 条记录迁移完成")
    print("PostgreSQL 表验证:")
    with pg_conn.cursor() as cur:
        cur.execute(
            "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename"
        )
        pg_tables = [r[0] for r in cur.fetchall()]
        for t_name in pg_tables:
            with pg_conn.cursor() as c2:
                c2.execute(f'SELECT COUNT(*) FROM "{t_name}"')
                count = c2.fetchone()[0]
                print(f"  {t_name}: {count} 条")

    sqlite_conn.close()
    pg_conn.close()
    print("\n迁移完成。")


if __name__ == "__main__":
    main()
