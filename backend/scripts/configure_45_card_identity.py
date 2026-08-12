"""一次性配置“45次卡”会员身份及其页面权限。

本脚本不会在应用启动时运行。仅当管理员明确执行时，才新增身份配置、
复制“30次卡”的页面可见范围，并按现有规则重新计算会员身份。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.member_identity import IdentityCondition, MemberIdentityCreate  # noqa: E402, I001
from app.models.operation_log import OperationLogCreate  # noqa: E402, I001
from app.services import (  # noqa: E402, I001
    member_identity_service,
    operation_log_service,
    position_customer_permission_service,
)


IDENTITY_NAME = "45次卡"
SOURCE_IDENTITY_NAME = "30次卡"
PERMISSION_SECTIONS = ("customers", "class_records", "payment")


def configure_identity() -> None:
    identities = member_identity_service.list_identities()
    identity = next((item for item in identities if item.name == IDENTITY_NAME), None)

    if identity is None:
        identity = member_identity_service.create_identity(
            MemberIdentityCreate(
                name=IDENTITY_NAME,
                type="老人",
                conditions=[
                    IdentityCondition(
                        type="payment",
                        payment_categories=["会员卡"],
                        items=[IDENTITY_NAME],
                        validity="all",
                    )
                ],
                operator="all",
            )
        )

    identities = member_identity_service.list_identities()
    remaining_identities = [item for item in identities if item.id != identity.id]
    identity_ids = [item.id for item in remaining_identities]
    source_index = next(
        (index for index, item in enumerate(remaining_identities) if item.name == SOURCE_IDENTITY_NAME),
        0,
    )
    identity_ids.insert(source_index, identity.id)
    member_identity_service.reorder(identity_ids)

    for section in PERMISSION_SECTIONS:
        for position, member_types in position_customer_permission_service.get_all(section).items():
            if SOURCE_IDENTITY_NAME not in member_types or IDENTITY_NAME in member_types:
                continue
            updated_types = list(member_types)
            updated_types.insert(updated_types.index(SOURCE_IDENTITY_NAME), IDENTITY_NAME)
            position_customer_permission_service.set_customer_permissions(section, position, updated_types)

    member_identity_service.refresh_all()
    operation_log_service.create_log(
        OperationLogCreate(
            section="会员身份",
            content="明确新增45次卡会员身份，并按30次卡现有范围配置客户、邀约和付费页面权限",
        ),
        extra={
            "operator": "系统维护",
            "operator_role": "超级管理员",
            "source": "system",
            "method": "MIGRATE",
            "path": "scripts/configure_45_card_identity.py",
            "entity_id": identity.id,
        },
    )


if __name__ == "__main__":
    configure_identity()
    print("45次卡会员身份与页面权限配置完成")
