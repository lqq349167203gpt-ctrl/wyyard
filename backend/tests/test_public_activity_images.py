from datetime import datetime
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.api import client as client_api
from app.api import customer_detail, uploads
from app.middleware.jwt_auth import AuthMiddleware
from app.models.class_record import ClassRecord


@pytest.mark.asyncio
async def test_public_activity_image_upload_returns_public_url(monkeypatch, tmp_path):
    monkeypatch.setattr(uploads, "PUBLIC_IMAGE_DIR", str(tmp_path))
    file = UploadFile(filename="poster.png", file=BytesIO(b"fake-png-content"))

    result = await uploads.upload_public_image(file)
    response = await uploads.get_public_image(result["url"].rsplit("/", 1)[-1])

    assert result["url"].startswith("/api/uploads/public-images/")
    assert response.media_type == "image/png"
    assert (tmp_path / result["url"].rsplit("/", 1)[-1]).exists()


@pytest.mark.asyncio
async def test_public_activity_image_rejects_non_image(monkeypatch, tmp_path):
    monkeypatch.setattr(uploads, "PUBLIC_IMAGE_DIR", str(tmp_path))
    file = UploadFile(filename="document.pdf", file=BytesIO(b"pdf-content"))

    with pytest.raises(HTTPException) as exc_info:
        await uploads.upload_public_image(file)

    assert exc_info.value.status_code == 400
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_only_public_image_get_bypasses_bearer_auth():
    reached_app: list[str] = []
    statuses: list[int] = []

    async def app(scope, receive, send):
        reached_app.append(scope["path"])

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            statuses.append(message["status"])

    middleware = AuthMiddleware(app)
    public_scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/uploads/public-images/poster.png",
        "headers": [],
    }
    private_scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/uploads/materials/private.png",
        "headers": [],
    }

    await middleware(public_scope, receive, send)
    await middleware(private_scope, receive, send)

    assert reached_app == ["/api/uploads/public-images/poster.png"]
    assert statuses == [401]


def test_client_activity_returns_list_and_detail_images(monkeypatch):
    monkeypatch.setattr(client_api.course_type_service, "list_course_types", lambda: [{
        "name": "疗愈活动",
        "list_image": "/api/uploads/public-images/poster.png",
        "detail_images": [
            "/api/uploads/public-images/detail-1.png",
            "/api/uploads/public-images/detail-2.png",
        ],
    }])
    item = {
        "id": "activity-1",
        "type": "class",
        "data": {
            "course_type": "疗愈活动",
            "date": "2026-07-20",
        },
    }

    result = client_api._format_activity(item, {}, {}, {})

    assert result["list_image"] == "/api/uploads/public-images/poster.png"
    assert result["detail_images"] == [
        "/api/uploads/public-images/detail-1.png",
        "/api/uploads/public-images/detail-2.png",
    ]


def test_client_aggregates_only_published_activities(monkeypatch):
    monkeypatch.setattr(client_api.class_record_service, "list_records", lambda: [
        ClassRecord(
            id="class-published",
            date="2026-07-25",
            course_id="course-1",
            course_name="疗愈活动",
            course_type="疗愈活动",
            is_published=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        ),
        ClassRecord(
            id="class-draft",
            date="2026-07-25",
            course_id="course-1",
            course_name="疗愈活动",
            course_type="疗愈活动",
            is_published=False,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        ),
    ])
    monkeypatch.setattr(client_api.internal_course_session_service, "list_sessions", lambda: [{
        "id": "ics-1",
        "date": "2026-07-25",
        "course_type": "内部课程子类型",
        "course_name": "内部课程场次",
        "is_published": True,
    }])

    expected = {
        "觉醒游戏": ("gcs", "gcs-1"),
        "情绪释放": ("ers", "ers-1"),
        "能量结": ("eks", "eks-1"),
        "OH卡梳理": ("ocr", "ocr-1"),
    }
    for display_type, (activity_type, activity_id) in expected.items():
        service = client_api.OTHER_ACTIVITY_SERVICES[display_type][1]
        monkeypatch.setattr(service, "list_sessions", lambda aid=activity_id: [{
            "id": aid,
            "date": "2026-07-25",
            "name": "",
            "is_published": True,
        }])

    result = client_api._aggregate_published_activities()
    by_id = {item["id"]: item for item in result}

    assert "class-published" in by_id
    assert "class-draft" not in by_id
    for display_type, (activity_type, activity_id) in expected.items():
        assert by_id[activity_id]["type"] == activity_type
        assert by_id[activity_id]["data"]["course_type"] == display_type
    assert by_id["ics-1"]["type"] == "ics"
    assert by_id["ics-1"]["data"]["course_type"] == "内部课程子类型"


def test_client_formats_other_activity_with_configured_images(monkeypatch):
    monkeypatch.setattr(client_api.course_type_service, "list_course_types", lambda: [{
        "name": "觉醒游戏",
        "list_image": "/api/uploads/public-images/gcs-list.jpg",
        "detail_images": ["/api/uploads/public-images/gcs-detail.jpg"],
    }])
    item = {
        "id": "gcs-1",
        "type": "gcs",
        "data": {
            "course_type": "觉醒游戏",
            "date": "2026-07-26",
            "owner_name": "测试案主",
            "name": "",
        },
    }

    result = client_api._format_activity(item, {}, {}, {})

    assert result["name"] == "觉醒游戏·测试案主"
    assert result["owner_name"] == "测试案主"
    assert result["course_type"] == "觉醒游戏"
    assert result["list_image"] == "/api/uploads/public-images/gcs-list.jpg"
    assert result["detail_images"] == ["/api/uploads/public-images/gcs-detail.jpg"]


def test_client_activity_returns_teacher_avatar(monkeypatch):
    monkeypatch.setattr(client_api.course_type_service, "list_course_types", lambda: [])
    teacher = SimpleNamespace(
        nickname="王老师",
        name="王老师",
        avatar_url="/api/uploads/public-images/teacher-wang.jpg",
    )
    item = {
        "id": "activity-1",
        "type": "class",
        "data": {
            "course_type": "疗愈活动",
            "date": "2026-07-26",
            "teacher_ids": ["teacher-1"],
        },
    }

    result = client_api._format_activity(item, {"teacher-1": teacher}, {}, {})

    assert result["teacher_names"] == ["王老师"]
    assert result["leader_role_label"] == "老师"
    assert result["teachers"] == [{
        "name": "王老师",
        "avatar_url": "/api/uploads/public-images/teacher-wang.jpg",
    }]


def test_client_marks_achiever_as_detail_leader_role(monkeypatch):
    monkeypatch.setattr(client_api.course_type_service, "list_course_types", lambda: [])
    achiever = SimpleNamespace(
        nickname="林成就君",
        name="林成就君",
        avatar_url="",
    )
    item = {
        "id": "gcs-1",
        "type": "gcs",
        "data": {
            "course_type": "觉醒游戏",
            "date": "2026-07-26",
            "achiever_id": "achiever-1",
            "teacher_ids": ["achiever-1"],
        },
    }

    result = client_api._format_activity(item, {"achiever-1": achiever}, {}, {})

    assert result["teacher_names"] == ["林成就君"]
    assert result["leader_role_label"] == "成就君"


def test_client_signup_count_merges_and_deduplicates_all_sources():
    item = {
        "id": "activity-1",
        "type": "class",
        "data": {
            "participant_ids": ["customer-1"],
            "groups": [{"member_ids": ["customer-1", "customer-2"]}],
        },
    }
    signups = [
        {"customer_id": "customer-2"},
        {"customer_id": "customer-3"},
        {"customer_id": "customer-3"},
        {"id": "legacy-anonymous"},
    ]

    assert client_api._activity_signup_count(item, signups) == 4


def test_client_signup_count_includes_owner_and_teachers_without_duplicates():
    item = {
        "id": "gcs-1",
        "type": "gcs",
        "data": {
            "owner_id": "owner-1",
            "teacher_ids": ["teacher-1"],
            "participant_ids": ["teacher-1", "customer-1"],
        },
    }
    signups = [
        {"customer_id": "owner-1"},
        {"customer_id": "customer-2"},
    ]

    assert client_api._activity_signup_count(item, signups) == 4


@pytest.mark.parametrize(
    ("item", "customer_id", "expected_role"),
    [
        (
            {"type": "gcs", "data": {"owner_id": "owner-1", "teacher_ids": ["teacher-1"]}},
            "owner-1",
            "owner",
        ),
        (
            {"type": "class", "data": {"teacher_ids": ["teacher-1"]}},
            "teacher-1",
            "teacher",
        ),
        (
            {"type": "ics", "data": {"teacher_ids": [], "host_id": "host-1"}},
            "host-1",
            "teacher",
        ),
        (
            {"type": "gcs", "data": {"teacher_ids": [], "achiever_id": "achiever-1"}},
            "achiever-1",
            "teacher",
        ),
    ],
)
def test_client_resolves_automatic_participation_roles(item, customer_id, expected_role):
    assert client_api._activity_role_for_customer(item, customer_id) == expected_role


@pytest.mark.parametrize(
    ("kwargs", "expected_role"),
    [
        (
            {
                "owner_id": "customer-1",
                "achiever_id": "customer-1",
                "teacher_ids": ["customer-1"],
                "participant_ids": ["customer-1"],
            },
            "案主",
        ),
        (
            {
                "achiever_id": "customer-1",
                "teacher_ids": ["customer-1"],
                "participant_ids": ["customer-1"],
            },
            "成就君",
        ),
        (
            {
                "host_id": "customer-1",
                "host_role": "成就君",
                "participant_ids": ["customer-1"],
            },
            "成就君",
        ),
        (
            {
                "teacher_ids": ["customer-1"],
                "participant_ids": ["customer-1"],
            },
            "老师",
        ),
        ({"participant_ids": ["customer-1"]}, "参与者"),
    ],
)
def test_customer_activity_role_uses_business_priority(kwargs, expected_role):
    assert customer_detail._resolve_activity_role("customer-1", **kwargs) == expected_role


def test_client_activity_detail_marks_owner_as_locked_participant(monkeypatch):
    item = {
        "id": "gcs-1",
        "type": "gcs",
        "data": {
            "course_type": "觉醒游戏",
            "date": "2026-07-26",
            "owner_id": "owner-1",
            "teacher_ids": ["teacher-1"],
            "participant_ids": [],
            "is_published": True,
        },
    }
    customers = {
        "owner-1": SimpleNamespace(nickname="测试案主", name="测试案主", avatar_url=""),
        "teacher-1": SimpleNamespace(nickname="测试老师", name="测试老师", avatar_url=""),
    }
    monkeypatch.setattr(client_api, "_find_activity", lambda activity_id: item)
    monkeypatch.setattr(client_api, "_build_customer_map", lambda: customers)
    monkeypatch.setattr(client_api, "_get_space_map", lambda: ({}, {}))
    monkeypatch.setattr(client_api, "_load_signups", lambda activity_id: [])
    monkeypatch.setattr(client_api, "_current_customer_id", lambda request: "owner-1")
    monkeypatch.setattr(client_api.course_type_service, "list_course_types", lambda: [])

    result = client_api.get_activity("gcs-1", SimpleNamespace())

    assert result["signed_up"] is True
    assert result["participation_locked"] is True
    assert result["participation_role"] == "owner"
    assert result["participation_role_label"] == "案主"
    assert result["signup_count"] == 2
    assert result["participants"][0] == {
        "nickname": "测试案主",
        "is_me": True,
        "role": "owner",
    }


@pytest.mark.parametrize("handler", [client_api.get_activity, client_api.signup_activity])
def test_client_rejects_direct_access_to_unpublished_activity(monkeypatch, handler):
    item = {
        "id": "draft-1",
        "type": "class",
        "data": {
            "course_type": "疗愈活动",
            "is_published": False,
        },
    }
    monkeypatch.setattr(client_api, "_find_activity", lambda activity_id: item)
    request = SimpleNamespace(state=SimpleNamespace(customer_id="customer-1", user_id=""))

    with pytest.raises(HTTPException) as exc_info:
        handler("draft-1", request)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "活动不存在"


@pytest.mark.parametrize(
    ("handler", "customer_id", "expected_message"),
    [
        (client_api.signup_activity, "teacher-1", "你是本场老师，已自动参与，无需报名"),
        (client_api.cancel_signup, "owner-1", "你是本场案主，无法取消参与"),
    ],
)
def test_client_rejects_signup_changes_for_fixed_participants(
    monkeypatch,
    handler,
    customer_id,
    expected_message,
):
    item = {
        "id": "gcs-1",
        "type": "gcs",
        "data": {
            "course_type": "觉醒游戏",
            "owner_id": "owner-1",
            "teacher_ids": ["teacher-1"],
            "is_published": True,
        },
    }
    monkeypatch.setattr(client_api, "_find_activity", lambda activity_id: item)
    request = SimpleNamespace(state=SimpleNamespace(customer_id=customer_id, user_id=""))

    with pytest.raises(HTTPException) as exc_info:
        handler("gcs-1", request)

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == expected_message


@pytest.mark.parametrize("display_type", list(client_api.OTHER_ACTIVITY_SERVICES))
def test_client_syncs_other_activity_participants(monkeypatch, display_type):
    activity_type, service = client_api.OTHER_ACTIVITY_SERVICES[display_type]
    updates = []
    monkeypatch.setattr(service, "update_session", lambda session_id, data: updates.append((session_id, data)))
    item = {
        "id": f"{activity_type}-1",
        "type": activity_type,
        "data": {"participant_ids": ["existing"]},
    }

    client_api._sync_activity_participant(item, "customer-1", add=True)
    client_api._sync_activity_participant(
        {**item, "data": {"participant_ids": ["existing", "customer-1"]}},
        "customer-1",
        add=False,
    )

    assert updates == [
        (f"{activity_type}-1", {"participant_ids": ["existing", "customer-1"]}),
        (f"{activity_type}-1", {"participant_ids": ["existing"]}),
    ]
