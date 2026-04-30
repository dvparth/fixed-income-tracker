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
        (institution) => institution.name.trim().toLowerCase() === targetInstitutionName.toLowerCase(),
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

export default function MastersView({
  isMobile,
  masterData,
  isSavingMasters,
  mastersFeedback,
  initialIntent,
  saveMasterData,
  returnToEditor,
  showReturnToEditor,
  isReadOnly = false,
}) {
  const [formState, setFormState] = useState(() => createEditableMasterData(masterData, initialIntent))

  const updateNamedListItem = (section, key, field, value) => {
    setFormState((current) => ({
      ...current,
      [section]: current[section].map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    }))
  }

  const addNamedListItem = (section) => {
    setFormState((current) => ({
      ...current,
      [section]: [...current[section], { key: createTempKey(), id: '', name: '' }],
    }))
  }

  const removeNamedListItem = (section, key) => {
    setFormState((current) => ({
      ...current,
      [section]: current[section].filter((item) => item.key !== key),
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
    setFormState((current) => ({
      ...current,
      owners: [
        ...current.owners,
        { key: createTempKey(), id: '', name: '', ownerType: 'Individual', taxSlabRate: '', aliasesText: '' },
      ],
    }))
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
    setFormState((current) => ({
      ...current,
      institutions: [
        ...current.institutions,
        { key: createTempKey(), id: '', name: '', branches: [] },
      ],
    }))
  }

  const removeInstitution = (key) => {
    setFormState((current) => ({
      ...current,
      institutions: current.institutions.filter((institution) => institution.key !== key),
    }))
  }

  const addBranch = (institutionKey) => {
    setFormState((current) => ({
      ...current,
      institutions: current.institutions.map((institution) =>
        institution.key === institutionKey
          ? {
              ...institution,
              branches: [...institution.branches, { key: createTempKey(), id: '', name: '' }],
            }
          : institution,
      ),
    }))
  }

  const updateBranch = (institutionKey, branchKey, value) => {
    setFormState((current) => ({
      ...current,
      institutions: current.institutions.map((institution) =>
        institution.key === institutionKey
          ? {
              ...institution,
              branches: institution.branches.map((branch) =>
                branch.key === branchKey ? { ...branch, name: value } : branch,
              ),
            }
          : institution,
      ),
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
      <p className="masters-empty-copy">Get Started by adding your first entry.</p>
    </div>
  )

  const renderNamedSection = (title, description, sectionKey, addLabel) => (
    <section className="editor-section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button
          type="button"
          className="secondary-btn compact"
          onClick={() => addNamedListItem(sectionKey)}
          disabled={isReadOnly}
        >
          {addLabel}
        </button>
      </div>
      <div className="masters-list">
        {formState[sectionKey].length > 0 ? (
          formState[sectionKey].map((item) => (
            <div key={item.key} className="masters-row">
              <label className="field full">
                <span>Name</span>
                <input
                  value={item.name}
                  disabled={isReadOnly}
                  onChange={(event) => updateNamedListItem(sectionKey, item.key, 'name', event.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary-btn compact"
                onClick={() => removeNamedListItem(sectionKey, item.key)}
                disabled={isReadOnly}
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          renderEmptyHint('◌', 'No entries yet.')
        )}
      </div>
    </section>
  )

  return (
    <section className="stack">
      <article className="panel">
        <div className="section-head">
          <div>
            <h2>Masters</h2>
            <p>Manage the DB-backed reference lists used across deposits, funding, and search.</p>
          </div>
          {showReturnToEditor && (
            <button type="button" className="secondary-btn compact" onClick={returnToEditor}>
              Back to deposit
            </button>
          )}
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
          <section className="editor-section">
            <div className="section-head">
              <div>
                <h2>Owners</h2>
                <p>These values are used for investment ownership and alias-based search.</p>
              </div>
              <button type="button" className="secondary-btn compact" onClick={addOwner} disabled={isReadOnly}>
                Add owner
              </button>
            </div>
            <div className="masters-list">
              {formState.owners.length > 0 ? (
                formState.owners.map((owner) => (
                  <div key={owner.key} className="masters-card">
                    <div className={isMobile ? 'editor-grid' : 'editor-grid'}>
                      <label className="field">
                        <span>Owner name</span>
                        <input
                          value={owner.name}
                          disabled={isReadOnly}
                          onChange={(event) => updateOwner(owner.key, 'name', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Owner type</span>
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
                        <span>Tax slab %</span>
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
                      <label className="field">
                        <span>Aliases</span>
                        <input
                          value={owner.aliasesText}
                          disabled={isReadOnly}
                          onChange={(event) => updateOwner(owner.key, 'aliasesText', event.target.value)}
                          placeholder="mom, mummy, maa"
                        />
                      </label>
                    </div>
                    <div className="masters-card-actions">
                      <button
                        type="button"
                        className="secondary-btn compact"
                        onClick={() => removeOwner(owner.key)}
                        disabled={isReadOnly}
                      >
                        Remove owner
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                renderEmptyHint('◌', 'No owners added yet.')
              )}
            </div>
          </section>

          <section className="editor-section">
            <div className="section-head">
              <div>
                <h2>Institutions and branches</h2>
                <p>Maintain the bank or issuer list and the branches available under each one.</p>
              </div>
              <button type="button" className="secondary-btn compact" onClick={addInstitution} disabled={isReadOnly}>
                Add institution
              </button>
            </div>
            <div className="masters-list">
              {formState.institutions.length > 0 ? (
                formState.institutions.map((institution) => (
                  <div key={institution.key} className="masters-card">
                    <div className="section-head">
                      <label className="field masters-card-title">
                        <span>Institution</span>
                        <input
                          value={institution.name}
                          disabled={isReadOnly}
                          onChange={(event) => updateInstitution(institution.key, 'name', event.target.value)}
                          placeholder="HDFC Bank"
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary-btn compact"
                        onClick={() => removeInstitution(institution.key)}
                        disabled={isReadOnly}
                      >
                        Remove institution
                      </button>
                    </div>
                    <div className="masters-sublist">
                      <div className="section-head">
                        <div>
                          <h3>Branches</h3>
                          <p>Keep branch names under this institution.</p>
                        </div>
                        <button
                          type="button"
                          className="secondary-btn compact"
                          onClick={() => addBranch(institution.key)}
                          disabled={isReadOnly}
                        >
                          Add branch
                        </button>
                      </div>
                      {institution.branches.length > 0 ? (
                        institution.branches.map((branch) => (
                          <div key={branch.key} className="masters-row">
                            <label className="field full">
                              <span>Branch</span>
                              <input
                                value={branch.name}
                                disabled={isReadOnly}
                                onChange={(event) => updateBranch(institution.key, branch.key, event.target.value)}
                                placeholder="Jaipur"
                              />
                            </label>
                            <button
                              type="button"
                              className="secondary-btn compact"
                              onClick={() => removeBranch(institution.key, branch.key)}
                              disabled={isReadOnly}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        renderEmptyHint('⌁', 'No branches added yet.')
                      )}
                    </div>
                  </div>
                ))
              ) : (
                renderEmptyHint('◇', 'No institutions added yet.')
              )}
            </div>
          </section>

          {renderNamedSection(
            'Instrument types',
            'These values power the investment type field in the editor.',
            'instrumentTypes',
            'Add instrument type',
          )}

          <div className="editor-actions">
            <button type="submit" className="primary-btn" disabled={isSavingMasters || isReadOnly}>
              {isSavingMasters ? 'Saving masters...' : 'Save masters'}
            </button>
          </div>
        </form>
      </article>
    </section>
  )
}
