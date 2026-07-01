import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.middleware.jwt_auth import create_access_token


@pytest.fixture(scope="session")
def client():
    """FastAPI 测试客户端，自动携带超级管理员 token（使用真实账号 wy_admin）"""
    token = create_access_token(
        account_id="wy_admin",
        username="wy_admin",
        owner="不闹",
        role="超级管理员",
    )
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {token}"
    return c


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
    """创建并返回一个测试客户，测试后不删除（可污染）"""
    resp = client.post("/api/customers", json=sample_customer)
    assert resp.status_code == 200
    return resp.json()


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
