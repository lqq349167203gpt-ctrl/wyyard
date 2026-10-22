/** 沿用系统核心组织的历史别名，始终使用实际 ID，不能取列表第一项。 */
export function defaultOrganization<T extends { id: string; name: string; status?: string }>(organizations: T[]): T | undefined {
  return organizations.find(org => org.status !== 'archived' && org.name.trim() === '无忧茶院')
    ?? organizations.find(org => org.status !== 'archived' && org.name.trim() === '无忧茶苑')
}
