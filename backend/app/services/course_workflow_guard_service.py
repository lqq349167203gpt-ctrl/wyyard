SOURCES = {
    "class_record": "class",
    "group_case": "gcs",
    "emotional_release": "ers",
    "energy_knot": "eks",
    "internal_course": "ics",
}



def courses(*, include_deleted=False):
    from app.services import activity_withdrawal_service as service

    for source, kind in SOURCES.items():
        for record in service._all_records(kind):
            if include_deleted or not record.is_deleted:
                yield source, kind, record



def registered(data):
    read = data.get if isinstance(data, dict) else lambda k, d=None: getattr(data, k, d)
    ids = set(read("participant_ids", []) or [])
    ids.add(read("owner_id", ""))
    for group in read("groups", []) or []:
        group = group if isinstance(group, dict) else group.model_dump()
        ids.update(group.get("member_ids", []) or [])
        ids.update((group.get("leader_id", ""), group.get("deputy_id", "")))
    return ids - {""}
