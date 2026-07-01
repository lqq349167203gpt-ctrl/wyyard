import json
import logging
import re
import threading
from pathlib import Path
from typing import Any, Dict

import psycopg2

logger = logging.getLogger(__name__)
import psycopg2.extras
import psycopg2.pool

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

from app.config.settings import settings

DB_URL = settings.database_url

_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()

# 每张表一把锁，防止 save_data 的 DELETE+INSERT 竞态
_table_locks: Dict[str, threading.Lock] = {}
_table_locks_mutex = threading.Lock()

_FILENAME_RE = re.compile(r"^[a-z_]+\.json$")


def _validate_filename(filename: str):
    if not _FILENAME_RE.match(filename):
        raise ValueError(f"非法文件名: {filename!r}，必须匹配 ^[a-z_]+\\.json$")


def _get_table_lock(table: str) -> threading.Lock:
    with _table_locks_mutex:
        if table not in _table_locks:
            _table_locks[table] = threading.Lock()
        return _table_locks[table]


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=10,
                    dsn=DB_URL,
                )
    return _pool


def _get_conn():
    return _get_pool().getconn()


def _put_conn(conn):
    _get_pool().putconn(conn)


def _table_name(filename: str) -> str:
    return filename.replace(".json", "")


def _ensure_table(table: str):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f'CREATE TABLE IF NOT EXISTS "{table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)'
            )
        conn.commit()
    finally:
        _put_conn(conn)


def load_data(filename: str) -> Dict[str, Any]:
    _validate_filename(filename)
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f'SELECT id, data FROM "{table}"')
            rows = cur.fetchall()
        result = {}
        for row in rows:
            result[row["id"]] = json.loads(row["data"])

        if filename == "customer_ai_config.json" and "default" in result:
            return result["default"]

        return result
    finally:
        _put_conn(conn)


def save_data(filename: str, data: Dict[str, Any]):
    _validate_filename(filename)
    table = _table_name(filename)
    lock = _get_table_lock(table)
    with lock:
        conn = _get_conn()
        try:
            _ensure_table(table)

            if filename == "customer_ai_config.json" and not any(
                isinstance(v, dict) for v in data.values()
            ):
                data = {"default": data}

            with conn.cursor() as cur:
                cur.execute(f'DELETE FROM "{table}"')
                for key, value in data.items():
                    cur.execute(
                        f'INSERT INTO "{table}" (id, data) VALUES (%s, %s)',
                        (key, json.dumps(value, ensure_ascii=False)),
                    )
            conn.commit()
        finally:
            _put_conn(conn)


def save_item(filename: str, item_id: str, item_data: Dict[str, Any]):
    """Upsert 单条记录，避免全表重写"""
    _validate_filename(filename)
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)
        with conn.cursor() as cur:
            cur.execute(
                f'INSERT INTO "{table}" (id, data) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
                (item_id, json.dumps(item_data, ensure_ascii=False)),
            )
            logger.debug("[SAVE] %s/%s: rowcount=%d", table, item_id, cur.rowcount)
        conn.commit()
    except Exception as e:
        logger.error("[SAVE_ERROR] %s/%s: %s", table, item_id, e)
        try: conn.rollback()
        except: pass
        raise
    finally:
        _put_conn(conn)


def delete_item(filename: str, item_id: str):
    """删除单条记录"""
    _validate_filename(filename)
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)
        with conn.cursor() as cur:
            cur.execute(f'DELETE FROM "{table}" WHERE id = %s', (item_id,))
        conn.commit()
    finally:
        _put_conn(conn)
