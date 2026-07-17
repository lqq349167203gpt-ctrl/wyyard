import jwt
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.middleware.jwt_auth import create_access_token
from app.middleware.rate_limit import limiter
from app.services import session_service

# 测试环境关闭限流，避免批量用例互相触发 429
limiter.enabled = False


@pytest.fixture(scope="session")
def client():
    """FastAPI 测试客户端，自动携带超级管理员 token（使用真实账号 wy_admin）"""
    token = create_access_token(
        account_id="wy_admin",
        username="wy_admin",
        owner="不闹",
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
