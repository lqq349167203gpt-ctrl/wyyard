import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from app.middleware.jwt_auth import require_admin

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "materials")
UPLOAD_DIR = os.path.normpath(UPLOAD_DIR)

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


@router.post("/materials")
async def upload_material(file: UploadFile = File(...)):
    # 先校验扩展名（廉价拦截，不读取文件体）
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的文件类型，仅允许上传图片或 PDF 文件")

    # 分块读取，累计超过 10MB 立即中断，避免超大文件一次性占满内存
    content = bytearray()
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="文件大小不能超过 10MB")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())[:12]
    saved_name = f"{file_id}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_name)

    with open(saved_path, "wb") as f:
        f.write(content)

    return {
        "id": file_id,
        "name": file.filename or saved_name,
        "url": f"/api/uploads/materials/{saved_name}",
        "size": len(content),
    }


def _safe_path(filename: str) -> str:
    file_path = os.path.normpath(os.path.join(UPLOAD_DIR, filename))
    if not file_path.startswith(os.path.normpath(UPLOAD_DIR) + os.sep) and file_path != os.path.normpath(UPLOAD_DIR):
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


@router.delete("/materials/{filename}")
async def delete_material(filename: str, _admin: str = Depends(require_admin)):
    file_path = _safe_path(filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    os.remove(file_path)
    return {"message": "删除成功"}
