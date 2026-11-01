import BulkImportPanel from '../import/BulkImportPanel.jsx'

const SHOW_BULK_IMPORT = false
const sectionLimit = Number(import.meta.env.VITE_DEPOSIT_GROUP_SECTION_LIMIT)
const DEPOSIT_GROUP_SECTION_LIMIT =
  Number.isFinite(sectionLimit) && sectionLimit > 0 ? Math.floor(sectionLimit) : 5

export default function DepositListPanel({
  activePortfolioLabel,
  clearDepositFilters,
  dateRangeFilters,
  expandedStatusSections,
  groupedDeposits,
  hasViewFilters,
  investmentTypeFilter,
  investmentTypeOptions,
  isMobile,
  isMobileFiltersOpen,
  isReadOnly,
  mobileFilterBadges,
  onImportSuccess,
  ownerFilter,
  ownerOptions,
  ownerUserId,
  renderDepositGroupCard,
  renderStatusBucketPreview,
  searchScope,
  searchText,
  setInvestmentTypeFilter,
  setIsMobileFiltersOpen,
  setOwnerFilter,
  setSearchScope,
  setSearchText,
  setShowAllDepositGroups,
  setShowClosed,
  showAllDepositGroups,
  showClosed,
  startNewDeposit,
  statusGroupedDeposits,
  toggleStatusSection,
  viewFilteredDeposits,
}) {
  return (
    <article className="panel">
      <div className="section-head">
        <div>
          <h2>Deposits</h2>
          <p>Track deposits by maturity, payout timing, and current lifecycle status.</p>
        </div>
        {!isReadOnly && (
          <button type="button" className="secondary-btn compact" onClick={startNewDeposit}>
            New
          </button>
        )}
      </div>

      {!isReadOnly && SHOW_BULK_IMPORT && (
        <BulkImportPanel
          ownerUserId={ownerUserId}
          portfolioLabel={activePortfolioLabel}
          onImportSuccess={onImportSuccess}
          isReadOnly={isReadOnly}
        />
      )}

      {isMobile ? (
        <div className="mobile-filter-shell">
          <div className="mobile-filter-summary">
            <div>
              <strong>Filters</strong>
              <span>{hasViewFilters ? 'Active filters applied' : 'Browse deposits by status'}</span>
              {mobileFilterBadges.length > 0 && (
                <div className="mobile-filter-badges">
                  {mobileFilterBadges.map((badge) => (
                    <span key={badge} className="mobile-filter-badge">
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="secondary-btn compact"
              onClick={() => setIsMobileFiltersOpen((current) => !current)}
              aria-expanded={isMobileFiltersOpen}
            >
              {isMobileFiltersOpen ? 'Hide filters' : 'Show filters'}
            </button>
            {hasViewFilters ? (
              <button
                type="button"
                className="secondary-btn compact ghost-btn"
                onClick={clearDepositFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="deposit-results-summary mobile-results-summary" role="status" aria-live="polite">
            <strong>{viewFilteredDeposits.length}</strong>
            <span>{viewFilteredDeposits.length === 1 ? 'deposit shown' : 'deposits shown'}</span>
          </div>
          {isMobileFiltersOpen && (
            <div className="mobile-filter-fields">
              <label className="field">
                <span>Search scope</span>
                  <select value={searchScope} onChange={(event) => setSearchScope(event.target.value)}>
                    <option value="all">All fields</option>
                    <option value="holder">Holder only</option>
                    <option value="funding">Funding source only</option>
                    <option value="bank">Bank or account</option>
                    <option value="instrument">Instrument or tenure</option>
                    <option value="group">Investment ID or source event</option>
                  </select>
                </label>

              <label className="field">
                <span>Search</span>
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="me, wife, SCSS, SBI, maturity:fd-2..."
                />
              </label>

              <label className="field">
                <span>Owner</span>
                <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                  <option value="all">All owners</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner} value={owner}>{owner}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Investment type</span>
                <select value={investmentTypeFilter} onChange={(event) => setInvestmentTypeFilter(event.target.value)}>
                  <option value="all">All types</option>
                  {investmentTypeOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              {dateRangeFilters}

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showClosed}
                  onChange={(event) => setShowClosed(event.target.checked)}
                />
                <span>Show closed deposits</span>
              </label>
            </div>
          )}
        </div>
      ) : (
        <>
          <label className="field">
            <span>Search scope</span>
              <select value={searchScope} onChange={(event) => setSearchScope(event.target.value)}>
                <option value="all">All fields</option>
                <option value="holder">Holder only</option>
                <option value="funding">Funding source only</option>
                <option value="bank">Bank or account</option>
                <option value="instrument">Instrument or tenure</option>
                <option value="group">Investment ID or source event</option>
              </select>
            </label>

          <label className="field">
            <span>Search</span>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="me, wife, SCSS, SBI, maturity:fd-2..."
            />
          </label>

          <div className="deposit-filter-grid">
            <label className="field">
              <span>Owner</span>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">All owners</option>
                {ownerOptions.map((owner) => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Investment type</span>
              <select value={investmentTypeFilter} onChange={(event) => setInvestmentTypeFilter(event.target.value)}>
                <option value="all">All types</option>
                {investmentTypeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

          </div>

          {dateRangeFilters}

          <div className="deposit-filter-actions">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(event) => setShowClosed(event.target.checked)}
              />
              <span>Show closed deposits</span>
            </label>
            {hasViewFilters ? (
              <button
                type="button"
                className="secondary-btn compact ghost-btn"
                onClick={clearDepositFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="deposit-results-summary" role="status" aria-live="polite">
            <strong>{viewFilteredDeposits.length}</strong>
            <span>{viewFilteredDeposits.length === 1 ? 'deposit shown' : 'deposits shown'}</span>
          </div>
        </>
      )}

      <section className="deposit-group-panel">
        <div className="section-head section-head-split">
          <div>
            <h3>Deposits by status</h3>
            <p>Choose a deposit group to review.</p>
          </div>
          {groupedDeposits.length > DEPOSIT_GROUP_SECTION_LIMIT ? (
            <button
              type="button"
              className="secondary-btn compact ghost-btn"
              onClick={() => setShowAllDepositGroups((current) => !current)}
            >
              {showAllDepositGroups
                ? 'Show fewer groups'
                : 'View all groups'}
            </button>
          ) : null}
        </div>
        <div className="deposit-status-stack">
          {statusGroupedDeposits.map((section) => {
            const isExpanded = Boolean(expandedStatusSections[section.key])
            const visibleGroups = showAllDepositGroups
              ? section.groups
              : section.groups.slice(0, DEPOSIT_GROUP_SECTION_LIMIT)

            return (
              <article key={section.key} className="deposit-status-card">
                <button
                  type="button"
                  className="deposit-status-header"
                  onClick={() => toggleStatusSection(section.key)}
                >
                  <div className="deposit-status-copy">
                    <strong>{section.title}</strong>
                    <span>{section.description}</span>
                  </div>
                  <div className="deposit-status-meta">
                    <strong>{section.groups.length}</strong>
                    <span>{section.groups.length === 1 ? 'group' : 'groups'}</span>
                  </div>
                </button>

                {!isExpanded && section.groups.length > 0 ? (
                  <div className="deposit-status-preview-list">
                    {section.groups.slice(0, 2).map((group) => renderStatusBucketPreview(group, section.key))}
                  </div>
                ) : null}

                {isExpanded ? (
                  <div className="deposit-group-list">
                    {visibleGroups.map((group) => renderDepositGroupCard(group, section.key))}
                    {visibleGroups.length === 0 ? (
                      <div className="empty-state-card">
                        <div className="empty-state-icon" aria-hidden="true">?</div>
                        <p className="lineage-empty">No deposits match this status right now.</p>
                      </div>
                    ) : null}
                    {!showAllDepositGroups && section.groups.length > visibleGroups.length ? (
                      <button
                        type="button"
                        className="mini-link timeline-preview-more"
                        onClick={() => setShowAllDepositGroups(true)}
                      >
                        View {section.groups.length - visibleGroups.length} more groups
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
              )
            })}
          </div>
        </section>
      </article>
  )
}
