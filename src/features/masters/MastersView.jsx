import { useState } from 'react'
import { OWNER_TYPE_OPTIONS } from '../../../shared/masterData.js'

const createTempKey = () =>
  globalThis.crypto?.randomUUID?.() || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toEditableNamedItems = (items = []) =>
  items.map((item) => ({
    key: createTempKey(),
    id: item.id || '',
    name: item.name || '',
  }))

const toEditableOwners = (owners = []) =>
  owners.map((owner) => ({
    key: createTempKey(),
    id: owner.id || '',
    name: owner.name || '',
    ownerType: owner.ownerType || 'Individual',
    taxSlabRate:
      owner.taxSlabRate === '' || owner.taxSlabRate === null || owner.taxSlabRate === undefined
        ? ''
        : String(owner.taxSlabRate),
    aliasesText: (owner.aliases || []).join(', '),
  }))

const toEditableInstitutions = (institutions = []) =>
  institutions.map((institution) => ({
    key: createTempKey(),
    id: institution.id || '',
    name: institution.name || '',
    branches: toEditableNamedItems(institution.branches || []),
  }))

const createBlankOwner = () => ({
  key: createTempKey(),
  id: '',
  name: '',
  ownerType: 'Individual',
  taxSlabRate: '',
  aliasesText: '',
})

const createBlankInstitution = (name = '') => ({
  key: createTempKey(),
  id: '',
  name,
  branches: [],
})

const createBlankBranch = (name = '') => ({
  key: createTempKey(),
  id: '',
  name,
})

const createBlankNamedItem = (name = '') => ({
  key: createTempKey(),
  id: '',
  name,
})

const createEditableMasterData = (masterData, initialIntent) => {
  const editable = {
    owners: toEditableOwners(masterData.owners || []),
    institutions: toEditableInstitutions(masterData.institutions || []),
    instrumentTypes: toEditableNamedItems(masterData.instrumentTypes || []),
  }

  if (!initialIntent?.section) {
    return editable
  }

  if (initialIntent.section === 'owners') {
    editable.owners = [...editable.owners, createBlankOwner()]
    return editable
  }

  if (initialIntent.section === 'instrumentTypes') {
    editable.instrumentTypes = [...editable.instrumentTypes, createBlankNamedItem()]
    return editable
  }

  if (initialIntent.section === 'institutions') {
    if (initialIntent.mode === 'branch') {
      const targetInstitutionName = String(initialIntent.institutionName || '').trim()

      if (!targetInstitutionName) {
        editable.institutions = [...editable.institutions, createBlankInstitution()]
        return editable
      }

      const matchIndex = editable.institutions.findIndex(
        (institution) =>
          institution.name.trim().toLowerCase() === targetInstitutionName.toLowerCase(),
      )

      if (matchIndex >= 0) {
        editable.institutions = editable.institutions.map((institution, index) =>
          index === matchIndex
            ? {
                ...institution,
                branches: [...institution.branches, createBlankBranch()],
              }
            : institution,
        )
        return editable
      }

      editable.institutions = [
        ...editable.institutions,
        {
          ...createBlankInstitution(targetInstitutionName),
          branches: [createBlankBranch()],
        },
      ]
      return editable
    }

    editable.institutions = [...editable.institutions, createBlankInstitution()]
  }

  return editable
}

const sanitizeMasterData = (formState) => ({
  owners: formState.owners
    .map((owner) => ({
      id: owner.id || undefined,
      name: String(owner.name || '').trim(),
      ownerType: String(owner.ownerType || 'Individual').trim() || 'Individual',
      taxSlabRate:
        owner.taxSlabRate === '' || owner.taxSlabRate === null || owner.taxSlabRate === undefined
          ? 0
          : Number(owner.taxSlabRate),
      aliases: String(owner.aliasesText || '')
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    }))
    .filter((owner) => owner.name),
  institutions: formState.institutions
    .map((institution) => ({
      id: institution.id || undefined,
      name: String(institution.name || '').trim(),
      branches: (institution.branches || [])
        .map((branch) => ({
          id: branch.id || undefined,
          name: String(branch.name || '').trim(),
        }))
        .filter((branch) => branch.name),
    }))
    .filter((institution) => institution.name),
  instrumentTypes: formState.instrumentTypes
    .map((item) => ({
      id: item.id || undefined,
      name: String(item.name || '').trim(),
    }))
    .filter((item) => item.name),
})

const asPercentText = (value) => {
  if (value === '' || value === null || value === undefined) {
    return '--'
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${parsed}%` : '--'
}

const toBranchPreview = (branches = []) =>
  branches
    .map((branch) => String(branch.name || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')

export default function MastersView({
  masterData,
  isSavingMasters,
  mastersFeedback,
  initialIntent,
  saveMasterData,
  onClose,
  returnToEditor,
  showReturnToEditor,
  isReadOnly = false,
}) {
  const [formState, setFormState] = useState(() => createEditableMasterData(masterData, initialIntent))
  const [openSections, setOpenSections] = useState({
    owners: Boolean(initialIntent?.section === 'owners'),
    institutions: Boolean(initialIntent?.section === 'institutions'),
    instrumentTypes: Boolean(initialIntent?.section === 'instrumentTypes'),
  })
  const [editingOwners, setEditingOwners] = useState(() =>
    Object.fromEntries(
      formState.owners.filter((owner) => !owner.name.trim()).map((owner) => [owner.key, true]),
    ),
  )
  const [editingInstitutions, setEditingInstitutions] = useState(() =>
    Object.fromEntries(
      formState.institutions
        .filter((institution) => !institution.name.trim())
        .map((institution) => [institution.key, true]),
    ),
  )
  const [editingNamedItems, setEditingNamedItems] = useState(() =>
    Object.fromEntries(
      formState.instrumentTypes.filter((item) => !item.name.trim()).map((item) => [item.key, true]),
    ),
  )
  const [branchDrafts, setBranchDrafts] = useState({})

  const toggleSection = (sectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const setOwnerEditing = (key, value) => {
    setEditingOwners((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const setInstitutionEditing = (key, value) => {
    setEditingInstitutions((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const setNamedItemEditing = (key, value) => {
    setEditingNamedItems((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const updateOwner = (key, field, value) => {
    setFormState((current) => ({
      ...current,
      owners: current.owners.map((owner) =>
        owner.key === key ? { ...owner, [field]: value } : owner,
      ),
    }))
  }

  const addOwner = () => {
    const nextOwner = createBlankOwner()
    setFormState((current) => ({
      ...current,
      owners: [...current.owners, nextOwner],
    }))
    setOpenSections((current) => ({ ...current, owners: true }))
    setOwnerEditing(nextOwner.key, true)
  }

  const removeOwner = (key) => {
    setFormState((current) => ({
      ...current,
      owners: current.owners.filter((owner) => owner.key !== key),
    }))
  }

  const updateInstitution = (key, field, value) => {
    setFormState((current) => ({
      ...current,
      institutions: current.institutions.map((institution) =>
        institution.key === key ? { ...institution, [field]: value } : institution,
      ),
    }))
  }

  const addInstitution = () => {
    const nextInstitution = createBlankInstitution()
    setFormState((current) => ({
      ...current,
      institutions: [...current.institutions, nextInstitution],
    }))
    setOpenSections((current) => ({ ...current, institutions: true }))
    setInstitutionEditing(nextInstitution.key, true)
  }

  const removeInstitution = (key) => {
    setFormState((current) => ({
      ...current,
      institutions: current.institutions.filter((institution) => institution.key !== key),
    }))
  }

  const updateNamedItem = (key, value) => {
    setFormState((current) => ({
      ...current,
      instrumentTypes: current.instrumentTypes.map((item) =>
        item.key === key ? { ...item, name: value } : item,
      ),
    }))
  }

  const addNamedItem = () => {
    const nextItem = createBlankNamedItem()
    setFormState((current) => ({
      ...current,
      instrumentTypes: [...current.instrumentTypes, nextItem],
    }))
    setOpenSections((current) => ({ ...current, instrumentTypes: true }))
    setNamedItemEditing(nextItem.key, true)
  }

  const removeNamedItem = (key) => {
    setFormState((current) => ({
      ...current,
      instrumentTypes: current.instrumentTypes.filter((item) => item.key !== key),
    }))
  }

  const addBranchByName = (institutionKey, branchName) => {
    const trimmedName = String(branchName || '').trim()
    if (!trimmedName) {
      return
    }

    setFormState((current) => ({
      ...current,
      institutions: current.institutions.map((institution) => {
        if (institution.key !== institutionKey) {
          return institution
        }

        const alreadyExists = institution.branches.some(
          (branch) => branch.name.trim().toLowerCase() === trimmedName.toLowerCase(),
        )

        if (alreadyExists) {
          return institution
        }

        return {
          ...institution,
          branches: [...institution.branches, createBlankBranch(trimmedName)],
        }
      }),
    }))
    setBranchDrafts((current) => ({
      ...current,
      [institutionKey]: '',
    }))
  }

  const removeBranch = (institutionKey, branchKey) => {
    setFormState((current) => ({
      ...current,
      institutions: current.institutions.map((institution) =>
        institution.key === institutionKey
          ? {
              ...institution,
              branches: institution.branches.filter((branch) => branch.key !== branchKey),
            }
          : institution,
      ),
    }))
  }

  const closeOwnerEdit = (owner) => {
    if (!owner.name.trim() && !owner.id) {
      removeOwner(owner.key)
      return
    }
    setOwnerEditing(owner.key, false)
  }

  const closeInstitutionEdit = (institution) => {
    if (!institution.name.trim() && !institution.id) {
      removeInstitution(institution.key)
      return
    }
    setInstitutionEditing(institution.key, false)
  }

  const closeNamedItemEdit = (item) => {
    if (!item.name.trim() && !item.id) {
      removeNamedItem(item.key)
      return
    }
    setNamedItemEditing(item.key, false)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (isReadOnly) {
      return
    }
    saveMasterData(sanitizeMasterData(formState))
  }

  const renderEmptyHint = (icon, text) => (
    <div className="empty-state-card masters-empty-state">
      <div className="empty-state-icon masters-empty-icon" aria-hidden="true">{icon}</div>
      <p className="lineage-empty">{text}</p>
      <p className="masters-empty-copy">Add the first entry when you need it.</p>
    </div>
  )

  const renderSectionHeader = (title, description, sectionKey, count, addLabel, onAdd) => (
    <div className="masters-section-toggle-row">
      <button
        type="button"
        className="masters-section-toggle"
        onClick={() => toggleSection(sectionKey)}
      >
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <div className="masters-section-meta">
          <strong>{count}</strong>
          <span>{count === 1 ? 'entry' : 'entries'}</span>
        </div>
      </button>
      <button
        type="button"
        className="secondary-btn compact"
        onClick={onAdd}
        disabled={isReadOnly}
      >
        {addLabel}
      </button>
    </div>
  )

  return (
    <section className="stack">
      <article className="panel">
        <div className="section-head">
          <div>
            <h2>Masters</h2>
            <p>Reference data used across owners, institutions, and deposit setup.</p>
          </div>
          <div className="settings-actions">
            {showReturnToEditor && (
              <button type="button" className="secondary-btn compact" onClick={returnToEditor}>
                Back to deposit
              </button>
            )}
            {onClose ? (
              <button type="button" className="secondary-btn compact ghost-btn" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        </div>

        {mastersFeedback && (
          <div className={mastersFeedback.type === 'error' ? 'status-banner error' : 'status-banner'}>
            {mastersFeedback.message}
          </div>
        )}

        {isReadOnly && (
          <div className="status-banner warning">
            You are viewing shared master data in read-only mode.
          </div>
        )}

        <form className="editor-form" onSubmit={handleSubmit}>
          <section className="editor-section masters-section">
            {renderSectionHeader(
              'Owners',
              'Used for ownership, tax slab, and search aliases.',
              'owners',
              formState.owners.length,
              'Add owner',
              addOwner,
            )}
            {openSections.owners ? (
              <div className="masters-row-list">
                {formState.owners.length > 0 ? (
                  formState.owners.map((owner) => {
                    const isEditing = Boolean(editingOwners[owner.key])

                    return (
                      <div key={owner.key} className="masters-compact-row">
                        <div className="masters-compact-row-summary">
                          <div className="masters-row-primary">
                            <strong>{owner.name || 'New owner'}</strong>
                            {owner.aliasesText ? <small>{owner.aliasesText}</small> : null}
                          </div>
                          <span>{owner.ownerType || 'Individual'}</span>
                          <span>{asPercentText(owner.taxSlabRate)}</span>
                          <button
                            type="button"
                            className="mini-link"
                            onClick={() => setOwnerEditing(owner.key, !isEditing)}
                            disabled={isReadOnly}
                          >
                            {isEditing ? 'Hide' : 'Edit'}
                          </button>
                        </div>
                        {isEditing ? (
                          <div className="masters-inline-edit">
                            <div className="editor-grid">
                              <label className="field">
                                <span>Name</span>
                                <input
                                  value={owner.name}
                                  disabled={isReadOnly}
                                  onChange={(event) => updateOwner(owner.key, 'name', event.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Type</span>
                                <select
                                  value={owner.ownerType}
                                  disabled={isReadOnly}
                                  onChange={(event) => updateOwner(owner.key, 'ownerType', event.target.value)}
                                >
                                  {OWNER_TYPE_OPTIONS.map((ownerType) => (
                                    <option key={ownerType} value={ownerType}>
                                      {ownerType}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field">
                                <span>Tax %</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={owner.taxSlabRate}
                                  disabled={isReadOnly}
                                  onChange={(event) => updateOwner(owner.key, 'taxSlabRate', event.target.value)}
                                  placeholder="e.g. 30"
                                />
                              </label>
                              <label className="field full">
                                <span>Aliases</span>
                                <input
                                  value={owner.aliasesText}
                                  disabled={isReadOnly}
                                  onChange={(event) => updateOwner(owner.key, 'aliasesText', event.target.value)}
                                  placeholder="mom, mummy, maa"
                                />
                                <small className="field-help">Optional search names.</small>
                              </label>
                            </div>
                            <div className="masters-inline-actions">
                              <button
                                type="button"
                                className="secondary-btn compact"
                                onClick={() => closeOwnerEdit(owner)}
                                disabled={isReadOnly}
                              >
                                Done
                              </button>
                              <button
                                type="button"
                                className="secondary-btn compact ghost-btn"
                                onClick={() => removeOwner(owner.key)}
                                disabled={isReadOnly}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  renderEmptyHint('O', 'No owners added yet.')
                )}
              </div>
            ) : null}
          </section>

          <section className="editor-section masters-section">
            {renderSectionHeader(
              'Institutions',
              'Banks or issuers with branch references.',
              'institutions',
              formState.institutions.length,
              'Add institution',
              addInstitution,
            )}
            {openSections.institutions ? (
              <div className="masters-row-list">
                {formState.institutions.length > 0 ? (
                  formState.institutions.map((institution) => {
                    const isEditing = Boolean(editingInstitutions[institution.key])

                    return (
                      <div key={institution.key} className="masters-compact-row">
                        <div className="masters-compact-row-summary">
                          <div className="masters-row-primary">
                            <strong>{institution.name || 'New institution'}</strong>
                            {institution.branches.length > 0 ? (
                              <small>{toBranchPreview(institution.branches)}</small>
                            ) : (
                              <small>No branches yet</small>
                            )}
                          </div>
                          <span>{institution.branches.length} branches</span>
                          <span>Institution</span>
                          <button
                            type="button"
                            className="mini-link"
                            onClick={() => setInstitutionEditing(institution.key, !isEditing)}
                            disabled={isReadOnly}
                          >
                            {isEditing ? 'Hide' : 'Edit'}
                          </button>
                        </div>
                        {isEditing ? (
                          <div className="masters-inline-edit">
                            <label className="field full">
                              <span>Institution name</span>
                              <input
                                value={institution.name}
                                disabled={isReadOnly}
                                onChange={(event) => updateInstitution(institution.key, 'name', event.target.value)}
                                placeholder="HDFC Bank"
                              />
                            </label>
                            <div className="masters-branch-editor">
                              <span className="masters-sub-label">Branches</span>
                              <div className="masters-tag-list">
                                {institution.branches.map((branch) => (
                                  <span key={branch.key} className="masters-tag">
                                    {branch.name}
                                    {!isReadOnly ? (
                                      <button
                                        type="button"
                                        className="masters-tag-remove"
                                        onClick={() => removeBranch(institution.key, branch.key)}
                                      >
                                        x
                                      </button>
                                    ) : null}
                                  </span>
                                ))}
                                {!isReadOnly ? (
                                  <>
                                    <input
                                      className="masters-tag-input"
                                      value={branchDrafts[institution.key] || ''}
                                      onChange={(event) =>
                                        setBranchDrafts((current) => ({
                                          ...current,
                                          [institution.key]: event.target.value,
                                        }))
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ',') {
                                          event.preventDefault()
                                          addBranchByName(institution.key, branchDrafts[institution.key] || '')
                                        }
                                      }}
                                      placeholder="Add branch"
                                    />
                                    <button
                                      type="button"
                                      className="mini-link"
                                      onClick={() => addBranchByName(institution.key, branchDrafts[institution.key] || '')}
                                    >
                                      + Add
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <div className="masters-inline-actions">
                              <button
                                type="button"
                                className="secondary-btn compact"
                                onClick={() => closeInstitutionEdit(institution)}
                                disabled={isReadOnly}
                              >
                                Done
                              </button>
                              <button
                                type="button"
                                className="secondary-btn compact ghost-btn"
                                onClick={() => removeInstitution(institution.key)}
                                disabled={isReadOnly}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  renderEmptyHint('D', 'No institutions added yet.')
                )}
              </div>
            ) : null}
          </section>

          <section className="editor-section masters-section">
            {renderSectionHeader(
              'Instrument types',
              'Reference values used in the deposit editor.',
              'instrumentTypes',
              formState.instrumentTypes.length,
              'Add instrument',
              addNamedItem,
            )}
            {openSections.instrumentTypes ? (
              <div className="masters-row-list">
                {formState.instrumentTypes.length > 0 ? (
                  formState.instrumentTypes.map((item) => {
                    const isEditing = Boolean(editingNamedItems[item.key])

                    return (
                      <div key={item.key} className="masters-compact-row">
                        <div className="masters-compact-row-summary masters-compact-row-summary-simple">
                          <div className="masters-row-primary">
                            <strong>{item.name || 'New instrument'}</strong>
                          </div>
                          <button
                            type="button"
                            className="mini-link"
                            onClick={() => setNamedItemEditing(item.key, !isEditing)}
                            disabled={isReadOnly}
                          >
                            {isEditing ? 'Hide' : 'Edit'}
                          </button>
                        </div>
                        {isEditing ? (
                          <div className="masters-inline-edit">
                            <label className="field full">
                              <span>Name</span>
                              <input
                                value={item.name}
                                disabled={isReadOnly}
                                onChange={(event) => updateNamedItem(item.key, event.target.value)}
                              />
                            </label>
                            <div className="masters-inline-actions">
                              <button
                                type="button"
                                className="secondary-btn compact"
                                onClick={() => closeNamedItemEdit(item)}
                                disabled={isReadOnly}
                              >
                                Done
                              </button>
                              <button
                                type="button"
                                className="secondary-btn compact ghost-btn"
                                onClick={() => removeNamedItem(item.key)}
                                disabled={isReadOnly}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  renderEmptyHint('*', 'No instrument types added yet.')
                )}
              </div>
            ) : null}
          </section>

          <div className="editor-actions">
            <button type="submit" className="primary-btn" disabled={isSavingMasters || isReadOnly}>
              {isSavingMasters ? 'Saving changes...' : 'Save changes'}
            </button>
          </div>
        </form>
      </article>
    </section>
  )
}
