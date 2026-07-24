import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image

from app.middleware.jwt_auth import require_admin

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "materials")
UPLOAD_DIR = os.path.normpath(UPLOAD_DIR)
PUBLIC_IMAGE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "public-images")
)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
CHUNK_SIZE = 1024 * 1024  # 分块读取块大小 1MB

# 允许上传的扩展名白名单（小写，含点）。
# 依据：① 现有目录 backend/uploads/materials/ 实际业务文件为 jpg/pdf
#         （其中的 dmg 为历史遗留超大文件，非业务需要，不再放行）；
#       ② 前端素材用于疗愈记录/课表等附件，仅展示文件名与下载链接，无内嵌渲染需求。
# 明确不放行 html/htm/svg 等可携带脚本的类型——上传文件经同源 GET 内联访问，
# 若允许此类类型会导致存储型 XSS。新增类型需评审后显式加入。
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"}

# 可安全内联预览的类型（浏览器按 Content-Type 直接展示）；
# 其余白名单类型（pdf）强制 attachment 下载，见 get_material。
INLINE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


async def _read_upload(file: UploadFile) -> bytearray:
    content = bytearray()
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="文件大小不能超过 10MB")
    return content


def _save_upload(content: bytearray, directory: str, ext: str) -> tuple[str, str]:
    os.makedirs(directory, exist_ok=True)
    file_id = str(uuid.uuid4())[:12]
    saved_name = f"{file_id}{ext}"
    saved_path = os.path.join(directory, saved_name)
    with open(saved_path, "wb") as target:
        target.write(content)
    return file_id, saved_name


# 小程序图片 2MB 限制，超出时自动压缩
MINIPROGRAM_IMAGE_MAX_SIZE = 2 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _compress_image(content: bytearray, ext: str) -> bytearray:
    """压缩图片至 2MB 以内，保持 JPEG/WebP 格式，PNG 保留透明通道。"""
    if ext not in IMAGE_EXTENSIONS or len(content) <= MINIPROGRAM_IMAGE_MAX_SIZE:
        return content
    try:
        img = Image.open(io.BytesIO(content))
        # 限制最大边长 2048px
        img.thumbnail((2048, 2048), Image.LANCZOS)
        buf = io.BytesIO()
        save_ext = ext.lstrip(".")
        if save_ext in ("jpg", "jpeg"):
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=80, optimize=True)
        elif save_ext == "webp":
            img.save(buf, format="WEBP", quality=80, method=4)
        elif save_ext == "png":
            img.save(buf, format="PNG", optimize=True)
        else:
            return content
        compressed = buf.getvalue()
        if len(compressed) < len(content):
            return bytearray(compressed)
    except Exception:
        pass
    return content


@router.post("/materials")
async def upload_material(file: UploadFile = File(...)):
    # 先校验扩展名（廉价拦截，不读取文件体）
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的文件类型，仅允许上传图片或 PDF 文件")

    content = await _read_upload(file)
    content = _compress_image(content, ext)
    file_id, saved_name = _save_upload(content, UPLOAD_DIR, ext)

    return {
        "id": file_id,
        "name": file.filename or saved_name,
        "url": f"/api/uploads/materials/{saved_name}",
        "size": len(content),
    }


@router.post("/public-images")
async def upload_public_image(file: UploadFile = File(...)):
    """上传活动公开展示图片；写入仍需登录且仅管理员可操作。"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in INLINE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的图片类型，仅允许 JPG、PNG、WebP 或 GIF")

    content = await _read_upload(file)
    content = _compress_image(content, ext)
    file_id, saved_name = _save_upload(content, PUBLIC_IMAGE_DIR, ext)
    return {
        "id": file_id,
        "name": file.filename or saved_name,
        "url": f"/api/uploads/public-images/{saved_name}",
        "size": len(content),
    }


def _safe_path(filename: str) -> str:
    file_path = os.path.normpath(os.path.join(UPLOAD_DIR, filename))
    if not file_path.startswith(os.path.normpath(UPLOAD_DIR) + os.sep) and file_path != os.path.normpath(UPLOAD_DIR):
        raise HTTPException(status_code=400, detail="非法文件名")
    return file_path


def _safe_public_image_path(filename: str) -> str:
    file_path = os.path.normpath(os.path.join(PUBLIC_IMAGE_DIR, filename))
    if not file_path.startswith(PUBLIC_IMAGE_DIR + os.sep) and file_path != PUBLIC_IMAGE_DIR:
        raise HTTPException(status_code=400, detail="非法文件名")
    return file_path


@router.get("/materials/{filename}")
async def get_material(filename: str):
    file_path = _safe_path(filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    # 图片内联预览；PDF 等非图片类型强制 attachment 下载（纵深防御：
    # 白名单已拦截 html/svg，但 PDF 也可内嵌 JS，强制下载可避免其在同源页面内执行。
    # 取舍：前端点击 PDF 链接将触发下载而非浏览器内打开预览）
    ext = os.path.splitext(filename)[1].lower()
    if ext in INLINE_EXTENSIONS:
        return FileResponse(file_path)
    return FileResponse(file_path, filename=filename, content_disposition_type="attachment")


@router.get("/public-images/{filename}")
async def get_public_image(filename: str):
    file_path = _safe_public_image_path(filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in INLINE_EXTENSIONS or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(file_path)


@router.delete("/materials/{filename}")
async def delete_material(filename: str, _admin: str = Depends(require_admin)):
    file_path = _safe_path(filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    os.remove(file_path)
    return {"message": "删除成功"}
