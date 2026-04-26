const normalizeText = (value) => String(value || '').trim().toLowerCase()

const createMasterId = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item'

const dedupeByName = (items) => {
  const seen = new Set()

  return items.filter((item) => {
    const key = normalizeText(item.name)
    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const normalizeNamedItems = (items = []) =>
  dedupeByName(
    items
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim()
          return name ? { id: createMasterId(name), name } : null
        }

        const name = String(item?.name || '').trim()
        if (!name) {
          return null
        }

        return {
          id: String(item.id || createMasterId(name)).trim(),
          name,
        }
      })
      .filter(Boolean),
  )

const normalizeOwners = (owners = []) =>
  dedupeByName(
    owners
      .map((owner) => {
        if (typeof owner === 'string') {
          const name = owner.trim()
          return name
            ? {
                id: createMasterId(name),
                name,
                aliases: [],
              }
            : null
        }

        const name = String(owner?.name || '').trim()
        if (!name) {
          return null
        }

        return {
          id: String(owner.id || createMasterId(name)).trim(),
          name,
          aliases: Array.from(
            new Set(
              (owner.aliases || [])
                .map((alias) => String(alias || '').trim())
                .filter(Boolean),
            ),
          ),
        }
      })
      .filter(Boolean),
  )

const normalizeInstitutions = (institutions = []) =>
  dedupeByName(
    institutions
      .map((institution) => {
        if (typeof institution === 'string') {
          const name = institution.trim()
          return name
            ? {
                id: createMasterId(name),
                name,
                branches: [],
              }
            : null
        }

        const name = String(institution?.name || '').trim()
        if (!name) {
          return null
        }

        return {
          id: String(institution.id || createMasterId(name)).trim(),
          name,
          branches: normalizeNamedItems(institution.branches || []),
        }
      })
      .filter(Boolean),
  )

export const emptyMasterData = {
  owners: [],
  institutions: [],
  instrumentTypes: [],
}

export const normalizeMasterData = (masterData = {}) => ({
  owners: normalizeOwners(masterData.owners || []),
  institutions: normalizeInstitutions(masterData.institutions || []),
  instrumentTypes: normalizeNamedItems(masterData.instrumentTypes || []),
})

export const buildOwnerAliasLookup = (masterData = emptyMasterData) =>
  normalizeMasterData(masterData).owners.reduce((lookup, owner) => {
    lookup[normalizeText(owner.name)] = Array.from(
      new Set([
        normalizeText(owner.name),
        ...(owner.aliases || []).map((alias) => normalizeText(alias)).filter(Boolean),
      ]),
    )
    return lookup
  }, {})
