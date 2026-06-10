import { useState, useEffect } from "react"
import { organizationApi, type Organization } from "@/lib/api"

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    organizationApi.list().then(setOrganizations).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const hasAnyOrganization = organizations.length > 0

  return { organizations, hasAnyOrganization, loading }
}
