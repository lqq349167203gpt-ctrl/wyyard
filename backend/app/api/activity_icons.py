"""活动大类图标读取、替换与恢复；不更改课程记录。"""

import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from app.api.uploads import PUBLIC_IMAGE_DIR
from app.middleware.jwt_auth import require_page_permission
from app.services import activity_icon_service as service
from app.services import position_permission_service
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/activity-icons", tags=["活动类型图标"])


def _key(key):
    if key not in service.TYPES:
        raise HTTPException(404, "活动类型不存在")


@router.get("")
def list_icons(request: Request):
    roles = get_request_roles(request)
    return {"items": service.list_icons(), "can_edit": "超级管理员" in roles or "organizations" in position_permission_service.get_permissions(roles)}


@router.get("/default/{key}")
def default_icon(key: str):
    _key(key)
    return FileResponse(service.DEFAULT_DIR / f"{key}.png", media_type="image/png")


@router.post("/{key}/image", dependencies=[Depends(require_page_permission("organizations"))])
async def upload_icon(key: str, request: Request, file: UploadFile = File(...)):
    _key(key)
    content = await file.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(413, "图标不能超过 2MB")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in {"PNG", "JPEG", "WEBP"}:
                raise HTTPException(400, "请选择 PNG、JPG 或 WebP 图片")
            if max(image.size) > 4096:
                raise HTTPException(400, "图标边长不能超过 4096 像素")
            # 保持长宽比，居中裁成方形并压缩，保证列表显示一致。
            icon = ImageOps.fit(ImageOps.exif_transpose(image).convert("RGBA"), (128, 128), method=Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, "图片无法读取，请更换有效图片")
    directory = Path(PUBLIC_IMAGE_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"activity-{uuid.uuid4().hex}.png"
    icon.save(directory / filename, optimize=True)
    before = next(item for item in service.list_icons() if item["key"] == key)
    result = service.set_icon(key, f"/api/uploads/public-images/{filename}")
    request.state.operation_log_context = {"section": "活动配置", "content": f"更换{service.TYPES[key]}图标", "before_data": before, "after_data": result}
    return result


@router.delete("/{key}/image", dependencies=[Depends(require_page_permission("organizations"))])
def reset_icon(key: str, request: Request):
    _key(key)
    before = next(item for item in service.list_icons() if item["key"] == key)
    result = service.set_icon(key, "")
    request.state.operation_log_context = {"section": "活动配置", "content": f"恢复{service.TYPES[key]}默认图标", "before_data": before, "after_data": result}
    return result
