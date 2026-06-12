import { useState, useEffect } from "react"
import { organizationApi, type Organization } from "@/lib/api"

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    organizationApi.list()
      .then(data => setOrganizations([...data].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hasAnyOrganization = organizations.length > 0

  return { organizations, hasAnyOrganization, loading }
}
