export interface CourseRosterPerson {
  id?: string
  name: string
  arrived?: boolean
}

/** 名单正文显示；到店状态由独立的名单分区说明。 */
export function CourseRosterNames({ people }: { people: CourseRosterPerson[] }) {
  return <>{people.map((person, index) => (
    <span key={person.id || index}>
      {index > 0 && "、"}{person.name}
    </span>
  ))}</>
}
