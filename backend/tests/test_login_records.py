import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def test_pc_login_is_persisted_with_forwarded_ip(client):
    from app.models.account import AccountCreate
    from app.services import account_service

    suffix = uuid.uuid4().hex[:8]
    username = f"login_audit_{suffix}"
    password = "Audit123456"
    account = account_service.create_account(AccountCreate(
        owner=f"登录审计_{suffix}",
        role="超级管理员",
        username=username,
        password=password,
        enabled=True,
    ))

    response = client.post(
        "/api/accounts/login",
        json={"username": username, "password": password},
        headers={"X-Forwarded-For": "203.0.113.18, 127.0.0.1", "X-Client-Type": "pc"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    records = client.get(
        "/api/login-records",
        params={"account_id": account.id, "event_type": "login"},
    ).json()
    assert records["total"] == 1
    assert records["items"][0]["ip"] == "203.0.113.18"
    assert records["items"][0]["source"] == "pc"


def test_page_view_and_operation_are_merged(client):
    from app.services import account_service, login_record_service

    account = account_service.get_by_username("pytest_admin")
    assert account is not None
    login_record_service.record_page_view(
        account,
        source="miniprogram",
        ip="198.51.100.7",
        page_path="/pages/customers/index",
    )

    response = client.get(
        "/api/login-records",
        params={"account_id": account.id, "event_type": "page_view", "source": "miniprogram"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert data["items"][0]["page_name"] == "客户"
    assert data["items"][0]["source"] == "miniprogram"

    # 业务接口的写操作继续使用现有操作日志，并由使用统计页统一读取。
    created = client.post("/api/customer-tags", json={
        "name": f"使用统计测试_{uuid.uuid4().hex[:6]}",
        "scope": "public",
    })
    assert created.status_code == 200
    operations = client.get(
        "/api/login-records",
        params={"account_id": account.id, "event_type": "operation"},
    ).json()
    assert any(item["event_type"] == "operation" for item in operations["items"])


def test_summary_counts_today_and_month(client):
    from app.services import account_service, login_record_service

    account = account_service.get_by_username("pytest_admin")
    assert account is not None
    login_record_service.record_login(account, source="pc", ip="127.0.0.1")
    login_record_service.record_login(account, source="miniprogram", ip="127.0.0.1")

    response = client.get("/api/login-records/summary")
    assert response.status_code == 200
    item = next(row for row in response.json() if row["account_id"] == account.id)
    assert item["today_count"] >= 2
    assert item["month_count"] >= item["today_count"]
    assert item["today_count"] == item["pc_today_count"] + item["miniprogram_today_count"]
    assert item["month_count"] == item["pc_month_count"] + item["miniprogram_month_count"]
    assert item["pc_today_count"] >= 1
    assert item["miniprogram_today_count"] >= 1
    assert datetime.fromisoformat(item["latest_login_at"]).tzinfo == timezone.utc


def test_heartbeat_creates_usage_session(client):
    from app.services import account_service
    from app.services.storage import load_item

    account = account_service.get_by_username("pytest_admin")
    assert account is not None
    client_session_id = f"pc-{uuid.uuid4().hex}"
    response = client.post(
        "/api/login-records/heartbeat",
        json={
            "client_session_id": client_session_id,
            "page_path": "/healing-records",
            "active": True,
        },
        headers={"X-Client-Type": "pc", "X-Forwarded-For": "203.0.113.29"},
    )
    assert response.status_code == 200
    stored = load_item("usage_sessions.json", f"{account.id}:{client_session_id}")
    assert stored["source"] == "pc"
    assert stored["ip"] == "203.0.113.29"
    assert stored["current_page_path"] == "/healing-records"


def test_usage_summary_merges_overlapping_devices(client):
    from app.models.account import AccountCreate
    from app.services import account_service
    from app.services.storage import save_item

    suffix = uuid.uuid4().hex[:8]
    account = account_service.create_account(AccountCreate(
        owner=f"时长统计_{suffix}",
        role="超级管理员",
        username=f"usage_{suffix}",
        password="Usage123456",
        enabled=True,
    ))
    china_tz = ZoneInfo("Asia/Shanghai")
    local_day = datetime.now(china_tz).date()
    first_start = datetime(local_day.year, local_day.month, local_day.day, 10, 0, tzinfo=china_tz).astimezone(timezone.utc)
    first_end = datetime(local_day.year, local_day.month, local_day.day, 10, 20, tzinfo=china_tz).astimezone(timezone.utc)
    second_start = datetime(local_day.year, local_day.month, local_day.day, 10, 10, tzinfo=china_tz).astimezone(timezone.utc)
    second_end = datetime(local_day.year, local_day.month, local_day.day, 10, 30, tzinfo=china_tz).astimezone(timezone.utc)

    for index, (source, start_at, end_at) in enumerate((
        ("pc", first_start, first_end),
        ("miniprogram", second_start, second_end),
    )):
        item_id = f"{account.id}:overlap-{index}"
        save_item("usage_sessions.json", item_id, {
            "id": item_id,
            "account_id": account.id,
            "username": account.username,
            "owner": account.owner,
            "role": account.role,
            "source": source,
            "ip": "127.0.0.1",
            "device_info": "pytest",
            "started_at": start_at.isoformat(),
            "last_heartbeat_at": end_at.isoformat(),
            "ended_at": end_at.isoformat(),
            "current_page_path": "/healing-records",
            "intervals": [{
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "page_path": "/healing-records",
                "page_name": "客户资料",
            }],
        })

    summary = client.get("/api/login-records/summary").json()
    row = next(item for item in summary if item["account_id"] == account.id)
    assert row["today_usage_seconds"] == 30 * 60
    assert row["month_usage_seconds"] == 30 * 60
    assert row["pc_today_usage_seconds"] == 20 * 60
    assert row["pc_month_usage_seconds"] == 20 * 60
    assert row["miniprogram_today_usage_seconds"] == 20 * 60
    assert row["miniprogram_month_usage_seconds"] == 20 * 60

    detail = client.get(
        "/api/login-records",
        params={"account_id": account.id, "event_type": "usage"},
    ).json()
    assert detail["total"] == 2
    assert {item["source"] for item in detail["items"]} == {"pc", "miniprogram"}


def test_summary_falls_back_to_real_activity_when_tracking_is_missing(client):
    from app.models.account import AccountCreate
    from app.models.operation_log import OperationLogCreate
    from app.services import account_service, login_record_service, operation_log_service

    suffix = uuid.uuid4().hex[:8]
    account = account_service.create_account(AccountCreate(
        owner=f"操作兜底_{suffix}",
        role="超级管理员",
        username=f"activity_fallback_{suffix}",
        password="Fallback123456",
        enabled=True,
    ))
    now = datetime.now(timezone.utc)
    pc_log = operation_log_service.create_log(
        OperationLogCreate(section="课表", content="修改课程参与者"),
        extra={"operator": account.owner, "source": "pc", "ip": "203.0.113.31"},
    )
    mini_log = operation_log_service.create_log(
        OperationLogCreate(section="客户资料", content="修改客户标签"),
        extra={"operator": account.owner, "source": "miniprogram", "ip": "203.0.113.32"},
    )
    pc_log.created_at = now - timedelta(minutes=3)
    mini_log.created_at = now - timedelta(minutes=1)

    summary = client.get("/api/login-records/summary").json()
    row = next(item for item in summary if item["account_id"] == account.id)
    assert row["pc_today_count"] == 1
    assert row["miniprogram_today_count"] == 1
    assert 175 <= row["pc_today_usage_seconds"] <= 185
    assert 55 <= row["miniprogram_today_usage_seconds"] <= 65
    assert 175 <= row["today_usage_seconds"] <= 185
    assert datetime.fromisoformat(row["pc_latest_active_at"]).tzinfo == timezone.utc
    assert row["pc_latest_active_ip"] == "203.0.113.31"
    assert datetime.fromisoformat(row["miniprogram_latest_active_at"]).tzinfo == timezone.utc
    assert row["miniprogram_latest_active_ip"] == "203.0.113.32"

    # 同一天补回真实登录后，不再把业务操作额外算作一次登录。
    login_record_service.record_login(account, source="pc", ip="203.0.113.31")
    summary = client.get("/api/login-records/summary").json()
    row = next(item for item in summary if item["account_id"] == account.id)
    assert row["pc_today_count"] == 1


def test_default_activity_attaches_page_duration_without_duplicate_usage_rows(client):
    from app.models.account import AccountCreate
    from app.services import account_service, login_record_service
    from app.services.storage import save_item

    suffix = uuid.uuid4().hex[:8]
    account = account_service.create_account(AccountCreate(
        owner=f"时长明细_{suffix}",
        role="超级管理员",
        username=f"duration_detail_{suffix}",
        password="Duration123456",
        enabled=True,
    ))
    page_view = login_record_service.record_page_view(
        account,
        source="pc",
        ip="127.0.0.1",
        page_path="/healing-records",
    )
    assert page_view is not None
    interval_start = page_view.created_at - timedelta(seconds=1)
    interval_end = page_view.created_at + timedelta(seconds=119)
    item_id = f"{account.id}:detail-duration"
    save_item("usage_sessions.json", item_id, {
        "id": item_id,
        "account_id": account.id,
        "username": account.username,
        "owner": account.owner,
        "role": account.role,
        "source": "pc",
        "ip": "127.0.0.1",
        "device_info": "pytest",
        "started_at": interval_start.isoformat(),
        "last_heartbeat_at": interval_end.isoformat(),
        "ended_at": interval_end.isoformat(),
        "current_page_path": "/healing-records",
        "intervals": [{
            "start_at": interval_start.isoformat(),
            "end_at": interval_end.isoformat(),
            "page_path": "/healing-records",
            "page_name": "客户资料",
        }],
    })

    response = client.get("/api/login-records", params={"account_id": account.id})
    assert response.status_code == 200
    items = response.json()["items"]
    assert all(item["event_type"] != "usage" for item in items)
    detail = next(item for item in items if item["event_type"] == "page_view")
    assert detail["duration_seconds"] == 120

    usage_response = client.get(
        "/api/login-records",
        params={"account_id": account.id, "event_type": "usage"},
    )
    assert usage_response.status_code == 200
    assert usage_response.json()["items"][0]["duration_seconds"] == 120


def test_operation_activity_is_filtered_before_pagination(client):
    from app.models.operation_log import OperationLogCreate
    from app.services import account_service, operation_log_service

    account = account_service.get_by_username("pytest_admin")
    assert account is not None
    marker = f"分页专项_{uuid.uuid4().hex[:8]}"
    created_ids = []
    for index in range(23):
        log = operation_log_service.create_log(
            OperationLogCreate(section="使用统计", content=f"{marker}_{index:02d}"),
            extra={"operator": account.owner, "source": "pc", "ip": "203.0.113.60"},
        )
        created_ids.append(log.id)

    response = client.get(
        "/api/login-records",
        params={
            "account_id": account.id,
            "event_type": "operation",
            "keyword": marker,
            "page": 2,
            "page_size": 20,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 23
    assert data["page"] == 2
    assert data["total_pages"] == 2
    assert len(data["items"]) == 3
    assert all(item["event_type"] == "operation" for item in data["items"])
    assert {item["id"].removeprefix("operation-") for item in data["items"]}.issubset(set(created_ids))
