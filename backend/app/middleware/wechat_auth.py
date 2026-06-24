from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.wechat_service import validate_token
from app.services.account_service import get_account

security = HTTPBearer(auto_error=False)


async def get_current_account_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """从 Authorization: Bearer <token> 提取 account_id"""
    if not credentials:
        raise HTTPException(status_code=401, detail="未登录")

    account_id = validate_token(credentials.credentials)
    if not account_id:
        raise HTTPException(status_code=401, detail="登录已过期")

    account = get_account(account_id)
    if not account or not account.enabled:
        raise HTTPException(status_code=401, detail="账号已禁用")

    return account_id
