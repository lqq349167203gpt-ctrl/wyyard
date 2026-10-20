"""课程所属统一读取当前类型配置，旧课程配置仅作兼容回退。"""


def build_salon_organization_resolver():
    from app.services import course_service, course_type_service, organization_service

    organizations = {org.id for org in organization_service.list_organizations()}
    types = {
        row["name"]: row["organization_id"]
        for row in course_type_service.list_course_types()
        if row.get("organization_id") in organizations
    }
    courses = course_service.list_courses()
    by_id = {
        course.id: types.get(getattr(course, "type", "")) or (
            course.organization_id if course.organization_id in organizations else ""
        )
        for course in courses
    }
    by_name = {course.name: by_id[course.id] for course in courses if getattr(course, "name", "")}

    def resolve(record):
        return (types.get(getattr(record, "course_type", ""))
                or by_id.get(getattr(record, "course_id", ""))
                or by_name.get(getattr(record, "course_name", "")) or "")

    return resolve
