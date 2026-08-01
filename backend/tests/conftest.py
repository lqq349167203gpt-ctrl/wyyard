import os
import uuid
from importlib import import_module
from urllib.parse import parse_qsl, urlencode, urlparse

import jwt
import psycopg2
import pytest
from fastapi.testclient import TestClient
from psycopg2 import sql

from app.config.settings import settings


def _configure_test_database() -> str:
    """测试必须使用独立数据库，禁止把用例数据写入业务库。"""
    test_database_url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if test_database_url:
        test_database_name = urlparse(test_database_url).path.lstrip("/")
        if not (test_database_name.endswith("_test") or test_database_name.startswith("test_")):
            raise RuntimeError("测试数据库名必须以 _test 结尾或以 test_ 开头")
        test_schema = ""
    else:
        parsed = urlparse(settings.database_url)
        if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise RuntimeError("非本机数据库运行测试时必须显式设置 TEST_DATABASE_URL")
        # 本机账号可能没有 CREATE DATABASE 权限，使用独立 schema 隔离测试表。
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query["options"] = "-csearch_path=wyyard_test"
        test_database_url = parsed._replace(query=urlencode(query)).geturl()
        test_schema = "wyyard_test"

    os.environ["DATABASE_URL"] = test_database_url
    settings.database_url = test_database_url
    return test_schema


def _reset_test_storage(test_schema: str) -> None:
    """每次测试前清空隔离存储；校验不通过时拒绝执行任何清理。"""
    conn = psycopg2.connect(settings.database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT current_schema()")
            current_schema = cur.fetchone()[0]
            if test_schema and current_schema != test_schema:
                raise RuntimeError(
                    f"测试 schema 校验失败，期望 {test_schema}，实际 {current_schema}"
                )
            cur.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = %s",
                (current_schema,),
            )
            for (table_name,) in cur.fetchall():
                cur.execute(
                    sql.SQL("TRUNCATE TABLE {}.{}").format(
                        sql.Identifier(current_schema),
                        sql.Identifier(table_name),
                    )
                )
        conn.commit()
    finally:
        conn.close()


_reset_test_storage(_configure_test_database())

app = import_module("app.main").app
AccountCreate = import_module("app.models.account").AccountCreate
create_access_token = import_module("app.middleware.jwt_auth").create_access_token
limiter = import_module("app.middleware.rate_limit").limiter
account_service = import_module("app.services.account_service")
session_service = import_module("app.services.session_service")

# 测试环境关闭限流，避免批量用例互相触发 429
limiter.enabled = False


@pytest.fixture(scope="session")
def client():
    """FastAPI 测试客户端，自动携带隔离测试库中的超级管理员 token。"""
    account = account_service.get_by_username("pytest_admin")
    if not account:
        account = account_service.create_account(AccountCreate(
            owner="不闹",
            role="超级管理员",
            username="pytest_admin",
            password=uuid.uuid4().hex,
            enabled=True,
        ))
    token = create_access_token(
        account_id=account.id,
        username=account.username,
        owner=account.owner,
        role="超级管理员",
    )
    # 登记 session：中间件会校验 jti 对应的 session，不登记会被当作「已踢出」返回 401
    jti = jwt.decode(token, options={"verify_signature": False}).get("jti", "")
    if jti:
        session_service.create_session(jti, account_id="wy_admin", device_info="pytest")
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {token}"
    yield c
    # 收尾清理 session，避免测试 session 堆积
    if jti:
        session_service.delete_session(jti)


@pytest.fixture
def sample_customer():
    """测试用客户数据（每次加唯一后缀，避免与历史污染冲突）"""
    u = uuid.uuid4().hex[:12]
    # 用纯数字生成手机号（hex 可能含字母，取数字部分）
    digits = "".join(c for c in u if c.isdigit())[:8].ljust(8, "0")
    return {
        "nickname": f"测试客户A_{u}",
        "name": f"张三_{u}",
        "gender": "女",
        "phone": f"138{digits}",
        "wechat": f"test_wechat_{u}",
        "traffic_source": "小红书",
        "traffic_source_detail": "https://example.com/post/123",
    }


@pytest.fixture
def created_customer(client, sample_customer):
    """创建并返回一个测试客户，用后删除避免污染数据库"""
    resp = client.post("/api/customers", json=sample_customer)
    assert resp.status_code == 200
    customer = resp.json()
    yield customer
    # 用后清理（测试自身已删除时 404，忽略）
    client.delete(f"/api/customers/{customer['id']}")


@pytest.fixture
def sample_account():
    """测试用账号数据"""
    return {
        "owner": "测试管理员",
        "role": "超级管理员",
        "username": "test_admin",
        "password": "test123456",
        "enabled": True,
    }
