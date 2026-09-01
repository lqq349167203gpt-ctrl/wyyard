from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.utils.payment_validation import ensure_payment_closer_total


def test_payment_closer_total_accepts_matching_amounts():
    ensure_payment_closer_total(
        {
            "price": 398,
            "closers": [
                {"id": "a", "amount": 200},
                {"id": "b", "amount": 198},
            ],
        },
        "price",
    )


def test_payment_closer_total_rejects_mismatch():
    with pytest.raises(HTTPException, match="必须与费用金额") as exc_info:
        ensure_payment_closer_total(
            {"amount": 500, "closers": [{"id": "a", "amount": 300}]},
            "amount",
        )
    assert exc_info.value.status_code == 400


def test_payment_closer_total_merges_partial_update_with_existing_record():
    existing = SimpleNamespace(
        fee=1000,
        closers=[{"id": "a", "amount": 1000}],
    )
    ensure_payment_closer_total({"notes": "仅修改备注"}, "fee", existing)

    with pytest.raises(HTTPException, match="必须与费用金额"):
        ensure_payment_closer_total({"fee": 1200}, "fee", existing)


def test_payment_closer_total_is_mandatory_for_pc_and_miniprogram_requests():
    payload = {"amount": 500, "closers": [{"id": "a", "amount": 300}]}
    internal_request = SimpleNamespace(headers={})
    ensure_payment_closer_total(payload, "amount", request=internal_request)

    for source in ("pc", "miniprogram"):
        request = SimpleNamespace(headers={"x-client-type": source})
        with pytest.raises(HTTPException, match="必须与费用金额"):
            ensure_payment_closer_total(payload, "amount", request=request)
