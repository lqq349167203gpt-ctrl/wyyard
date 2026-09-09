from types import SimpleNamespace

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


def test_payment_closer_total_accepts_mismatch_after_fields_are_removed():
    ensure_payment_closer_total(
        {"amount": 500, "closers": [{"id": "a", "amount": 300}]},
        "amount",
    )


def test_payment_closer_total_merges_partial_update_with_existing_record():
    existing = SimpleNamespace(
        fee=1000,
        closers=[{"id": "a", "amount": 1000}],
    )
    ensure_payment_closer_total({"notes": "仅修改备注"}, "fee", existing)

    ensure_payment_closer_total({"fee": 1200}, "fee", existing)


def test_payment_closer_total_is_not_required_for_pc_and_miniprogram_requests():
    payload = {"amount": 500, "closers": [{"id": "a", "amount": 300}]}
    internal_request = SimpleNamespace(headers={})
    ensure_payment_closer_total(payload, "amount", request=internal_request)

    for source in ("pc", "miniprogram"):
        request = SimpleNamespace(headers={"x-client-type": source})
        ensure_payment_closer_total(payload, "amount", request=request)


def test_coarse_door_count_card_does_not_require_payment_details():
    for source in ("pc", "miniprogram"):
        request = SimpleNamespace(headers={"x-client-type": source})
        ensure_payment_closer_total(
            {
                "card_type": "粗门次卡",
                "price": 0,
                "closers": [],
                "payment_method": None,
            },
            "price",
            request=request,
        )
