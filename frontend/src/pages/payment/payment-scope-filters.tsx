import { SelectDropdown } from "@/components/select-dropdown"
import { NO_DEAL_COURSE_LABEL } from "@/components/payment-course-select"

export const UNASSIGNED_COURSE = "__none__"

export function PaymentScopeFilters({
  organizationId,
  courseKey,
  organizations,
  courses,
  includeUnassignedCourse = false,
  onOrganizationChange,
  onCourseChange,
}: {
  organizationId: string
  courseKey: string
  organizations: { id: string; name: string }[]
  courses: { key: string; name: string }[]
  includeUnassignedCourse?: boolean
  onOrganizationChange: (value: string) => void
  onCourseChange: (value: string) => void
}) {
  return (
    <>
      <div className="w-[148px]">
        <SelectDropdown
          className="w-[148px]"
          buttonClassName="border-[#e1e4e7] bg-white px-2.5"
          rounded="7px"
          value={organizationId}
          options={[
            { value: "all", label: "全部成交归属" },
            ...organizations.map(org => ({ value: org.id, label: org.name })),
          ]}
          textColor={organizationId !== "all" ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
          onChange={onOrganizationChange}
          dropdownWidth={180}
          placeholder="全部成交归属"
        />
      </div>
      <div className="w-[172px]">
        <SelectDropdown
          className="w-[172px]"
          buttonClassName="border-[#e1e4e7] bg-white px-2.5"
          rounded="7px"
          value={courseKey}
          options={[
            { value: "all", label: "全部成交课程" },
            ...(includeUnassignedCourse ? [{ value: UNASSIGNED_COURSE, label: NO_DEAL_COURSE_LABEL }] : []),
            ...courses.map(course => ({ value: course.key, label: course.name })),
          ]}
          textColor={courseKey !== "all" ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
          onChange={onCourseChange}
          dropdownWidth={320}
          menuMaxHeight={320}
          placeholder="全部成交课程"
        />
      </div>
    </>
  )
}
