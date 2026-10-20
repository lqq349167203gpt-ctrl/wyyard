import io
import uuid

import pytest
from PIL import Image

from app.api import activity_icons
from app.services import activity_icon_service as service
from app.services import storage


def png(size=(300, 150)):
    output = io.BytesIO()
    Image.new("RGBA", size, (100, 100, 100, 255)).save(output, "PNG")
    return output.getvalue()


@pytest.fixture(autouse=True)
def isolated_icons(monkeypatch, tmp_path):
    before = storage.load_data(service.FILENAME)
    monkeypatch.setattr(activity_icons, "PUBLIC_IMAGE_DIR", str(tmp_path))
    storage.save_data(service.FILENAME, {})
    yield
    storage.save_data(service.FILENAME, before)


def test_defaults_upload_persist_reset_and_public_fallback(client, tmp_path):
    response = client.get("/api/activity-icons")
    assert response.status_code == 200
    assert response.json()["can_edit"] is True
    items = response.json()["items"]
    assert [item["key"] for item in items] == list(service.TYPES)
    assert all(not item["custom"] for item in items)
    for item in items:
        public = client.get(item["default_url"], headers={"Authorization": ""})
        assert public.status_code == 200
        assert Image.open(io.BytesIO(public.content)).size == (128, 128)
    result = client.post("/api/activity-icons/gcs/image", files={"file": ("icon.png", png(), "image/png")})
    assert result.status_code == 200, result.text
    icon = result.json()
    assert icon["custom"] is True
    filename = icon["url"].rsplit("/", 1)[1]
    assert Image.open(tmp_path / filename).size == (128, 128)
    assert service.list_icons()[1]["url"] == icon["url"]
    reset = client.delete("/api/activity-icons/gcs/image")
    assert reset.status_code == 200 and reset.json()["custom"] is False
    # 恢复默认保留旧图片，方便追溯；其他类型不受影响。
    assert (tmp_path / filename).exists()
    assert all(not item["custom"] for item in client.get("/api/activity-icons").json()["items"])


def test_reject_invalid_images_and_types_without_changing_config(client):
    before = service.list_icons()
    assert client.post("/api/activity-icons/unknown/image", files={"file": ("i.png", png())}).status_code == 404
    assert client.post("/api/activity-icons/ers/image", files={"file": ("i.png", b"not an image")}).status_code == 400
    assert client.post("/api/activity-icons/ers/image", files={"file": ("i.png", b"x" * (2 * 1024 * 1024 + 1))}).status_code == 413
    assert client.get("/api/activity-icons/default/unknown", headers={"Authorization": ""}).status_code == 404
    assert service.list_icons() == before


def test_course_reader_cannot_change_icons(client):
    role = "图标测试" + uuid.uuid4().hex[:8]
    assert client.post("/api/positions", json={"name": role}).status_code == 200
    assert client.put("/api/position-permissions/full", json={"position": role, "pages": ["daily-activities"]}).status_code == 200
    password = uuid.uuid4().hex
    account = client.post("/api/accounts", json={"owner": role, "role": role, "username": role, "password": password, "enabled": True})
    assert account.status_code == 200, account.text
    token = client.post("/api/accounts/login", json={"username": role, "password": password}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/activity-icons", headers=headers)
    assert response.status_code == 200 and response.json()["can_edit"] is False
    assert client.delete("/api/activity-icons/class/image", headers=headers).status_code == 403
    assert client.post("/api/activity-icons/class/image", files={"file": ("i.png", png())}, headers=headers).status_code == 403
    assert client.get("/api/activity-icons", headers={"Authorization": ""}).status_code == 401
