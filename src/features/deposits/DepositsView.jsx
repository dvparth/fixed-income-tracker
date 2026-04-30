import BulkImportPanel from '../import/BulkImportPanel.jsx'
import { getCalculationFrequencyLabel } from './depositModel.js'

const SHOW_BULK_IMPORT = false

export default function DepositsView({
  isMobile,
  isReadOnly,
  ownerUserId,
  activePortfolioLabel,
  onImportSuccess,
  mobileDepositsScreen,
  isMobileFiltersOpen,
  setIsMobileFiltersOpen,
  hasActiveDepositFilters,
  mobileFilterBadges,
  searchScope,
  setSearchScope,
  searchText,
  setSearchText,
  investmentDateFrom,
  setInvestmentDateFrom,
  investmentDateTo,
  setInvestmentDateTo,
  maturityDateFrom,
  setMaturityDateFrom,
  maturityDateTo,
  setMaturityDateTo,
  showClosed,
  setShowClosed,
  filteredDeposits,
  selectedId,
  selectedDeposit,
  selectedSourceEvents,
  selectedReinvestmentSummary,
  selectedInterestEvents,
  selectedInterestSummary,
  archiveTargetId,
  isArchiving,
  deleteTargetId,
  isDeleting,
  startNewDeposit,
  openDepositDetail,
  setMobileDepositsScreen,
  startCloning,
  startEditing,
  startArchive,
  cancelArchive,
  confirmArchive,
  startDelete,
  cancelDelete,
  confirmDelete,
  fillFromSelectedMaturity,
  fillFromAllAvailableInterest,
  applyCashFlowSource,
  settleCashFlowEvent,
  settlingEventId,
  mobileDetailSections,
  toggleMobileDetailSection,
  needsPeriodicPayoutSetup,
  getPayoutModeLabel,
  formatCurrency,
  formatDate,
  formatTenure,
  todayTime,
  canDeletePortfolio,
}) {
  const formatInterestRate = (value) => {
    if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--'
    }

    return `${Number(Number(value).toFixed(4)).toString()}%`
  }

  const renderMaturityUsageContent = () => {
    if (selectedReinvestmentSummary?.availableAmount === null) {
      return <p>Add final post-TDS maturity amount after closure to track unused maturity cash.</p>
    }

    if (!selectedReinvestmentSummary.isRealized) {
      return (
        <>
          <p><strong>Expected post-TDS at maturity:</strong> {formatCurrency(selectedReinvestmentSummary.availableAmount)}</p>
          <p><strong>Maturity date:</strong> {formatDate(selectedDeposit.maturityDate)}</p>
          <p>This amount is not available for reinvestment yet because the maturity has not been realized.</p>
        </>
      )
    }

    return (
      <>
        <p><strong>Post-TDS maturity available:</strong> {formatCurrency(selectedReinvestmentSummary.availableAmount)}</p>
        <p><strong>Already reinvested:</strong> {formatCurrency(selectedReinvestmentSummary.reinvestedAmount)}</p>
        <p><strong>Settled outside YieldFlow:</strong> {formatCurrency(selectedReinvestmentSummary.settledAmount)}</p>
        <p>
          <strong>Still uninvested:</strong>{' '}
          <span className={selectedReinvestmentSummary.uninvestedAmount > 0 ? 'amount-warning' : 'amount-ok'}>
            {formatCurrency(selectedReinvestmentSummary.uninvestedAmount)}
          </span>
        </p>
        {!isReadOnly && selectedReinvestmentSummary.uninvestedAmount > 0 && (
          <div className="schedule-actions">
            <button type="button" className="secondary-btn compact" onClick={fillFromSelectedMaturity}>
              Use as source
            </button>
            <button
              type="button"
              className="secondary-btn compact ghost-btn"
              onClick={() =>
                settleCashFlowEvent({
                  eventId: `maturity:${selectedDeposit.id}`,
                  depositId: selectedDeposit.id,
                  amount: selectedReinvestmentSummary.availableAmount,
                  unallocatedAmount: selectedReinvestmentSummary.uninvestedAmount,
                })
              }
              disabled={settlingEventId === `maturity:${selectedDeposit.id}`}
            >
              {settlingEventId === `maturity:${selectedDeposit.id}` ? 'Settling...' : 'Mark settled'}
            </button>
          </div>
        )}
        {selectedReinvestmentSummary.children.length > 0 && (
          <div className="allocation-breakdown">
            <p className="allocation-title">Used in investments</p>
            <div className="allocation-breakdown-list">
              {selectedReinvestmentSummary.children.map((child) => (
                <button
                  key={`${selectedDeposit.id}-${child.deposit.id}-${child.amount}`}
                  type="button"
                  className="allocation-pill"
                  onClick={() => openDepositDetail(child.deposit.id)}
                >
                  <strong>{child.deposit.bankName}</strong>
                  <span>{child.deposit.accountNumber} | {formatCurrency(child.amount)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  const getElapsedPercent = (deposit) => {
    const start = new Date(`${deposit.investmentDate}T00:00:00`).getTime()
    const end = new Date(`${deposit.maturityDate}T00:00:00`).getTime()

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return 0
    }

    if (deposit.status === 'Closed' || todayTime >= end) {
      return 100
    }

    if (todayTime <= start) {
      return 0
    }

    return Math.max(0, Math.min(100, ((todayTime - start) / (end - start)) * 100))
  }

  const isPastMaturityOpen = (deposit) => {
    if (!deposit || deposit.status === 'Closed' || !deposit.maturityDate) {
      return false
    }

    const maturityTime = new Date(`${deposit.maturityDate}T00:00:00`).getTime()
    return !Number.isNaN(maturityTime) && maturityTime < todayTime
  }

  const renderDepositCard = (deposit) => (
    <>
      <div className="deposit-card-head">
        <div className="deposit-brand">
          <div className="bank-avatar" aria-hidden="true">
            {String(deposit.bankName || '?').trim().slice(0, 1).toUpperCase()}
          </div>
          <div className="deposit-brand-copy">
            <strong>{deposit.bankName}</strong>
            <span>{deposit.accountNumber || deposit.id}</span>
          </div>
        </div>
        <div className="deposit-card-side">
          <span className={deposit.status === 'Closed' ? 'pill closed' : 'pill open'}>
            {deposit.status}
          </span>
          <span className="deposit-time-remaining">{formatTenure(deposit)}</span>
        </div>
      </div>
      <div className="deposit-amount-row">
        <strong className="deposit-amount">{formatCurrency(deposit.principalAmount)}</strong>
      </div>
      <div className="deposit-meta">
        <span>{deposit.holderName}</span>
        <span>{deposit.instrumentType}</span>
        <span>{getPayoutModeLabel(deposit)}</span>
      </div>
      {deposit.status !== 'Closed' && (
        <div className="deposit-progress" aria-hidden="true">
          <span className="deposit-progress-bar" style={{ width: `${getElapsedPercent(deposit)}%` }} />
        </div>
      )}
      {needsPeriodicPayoutSetup(deposit) && (
        <p className="inline-warning">Missing periodic payout before/after TDS</p>
      )}
      {isPastMaturityOpen(deposit) && (
        <p className="inline-warning past-maturity-warning">Past maturity and still open. Review this investment.</p>
      )}
    </>
  )

  const renderMobileDetailSection = (sectionKey, title, subtitle, children) => (
    <section className="mobile-detail-section">
      <button
        type="button"
        className="mobile-detail-section-toggle"
        onClick={() => toggleMobileDetailSection(sectionKey)}
        aria-expanded={mobileDetailSections[sectionKey]}
      >
        <div>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <span className="mobile-detail-section-icon">
          {mobileDetailSections[sectionKey] ? 'Hide' : 'Show'}
        </span>
      </button>
      {mobileDetailSections[sectionKey] && (
        <div className="mobile-detail-section-body">{children}</div>
      )}
    </section>
  )

  const dateRangeFilters = (
    <div className="date-filter-grid">
      <div className="date-filter-group">
        <strong>Investment date</strong>
        <div className="date-filter-row">
          <label className="field">
            <span>From</span>
            <input type="date" value={investmentDateFrom} onChange={(event) => setInvestmentDateFrom(event.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={investmentDateTo} onChange={(event) => setInvestmentDateTo(event.target.value)} />
          </label>
        </div>
      </div>
      <div className="date-filter-group">
        <strong>Maturity date</strong>
        <div className="date-filter-row">
          <label className="field">
            <span>From</span>
            <input type="date" value={maturityDateFrom} onChange={(event) => setMaturityDateFrom(event.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={maturityDateTo} onChange={(event) => setMaturityDateTo(event.target.value)} />
          </label>
        </div>
      </div>
    </div>
  )

  const depositsListPanel = (
    <article className="panel">
      <div className="section-head">
        <div>
          <h2>Deposits</h2>
          <p>Search by bank, holder, alias like mummy or wife, instrument, account number, investment id, or source event.</p>
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
              <span>{hasActiveDepositFilters ? 'Active filters applied' : 'Browse all deposits'}</span>
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
          </div>
          <div className="deposit-results-summary mobile-results-summary" role="status" aria-live="polite">
            <strong>{filteredDeposits.length}</strong>
            <span>{filteredDeposits.length === 1 ? 'record shown' : 'records shown'}</span>
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

          {dateRangeFilters}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(event) => setShowClosed(event.target.checked)}
            />
            <span>Show closed deposits</span>
          </label>

          <div className="deposit-results-summary" role="status" aria-live="polite">
            <strong>{filteredDeposits.length}</strong>
            <span>{filteredDeposits.length === 1 ? 'record shown' : 'records shown'}</span>
          </div>
        </>
      )}

      <div className="list">
        {filteredDeposits.map((deposit) => (
          <button
            key={deposit.id}
            type="button"
            className={selectedId === deposit.id ? 'deposit-card selected clickable-surface' : 'deposit-card clickable-surface'}
            onClick={() => openDepositDetail(deposit.id)}
          >
            {renderDepositCard(deposit)}
          </button>
        ))}
      </div>
    </article>
  )

  const depositDetailPanel = (
    <article className="panel detail-panel">
      {selectedDeposit ? (
        <>
          {isMobile && (
            <div className="mobile-detail-header">
              <button
                type="button"
                className="secondary-btn compact"
                onClick={() => setMobileDepositsScreen('list')}
              >
                Back to deposits
              </button>
            </div>
          )}
          {isMobile && !isReadOnly && (
            <div className="mobile-detail-actions">
              <button type="button" className="secondary-btn compact" onClick={() => startCloning(selectedDeposit)}>
                Clone
              </button>
              <button type="button" className="secondary-btn compact" onClick={() => startEditing(selectedDeposit)}>
                Edit
              </button>
              <button type="button" className="secondary-btn compact" onClick={startArchive}>
                Archive
              </button>
              {canDeletePortfolio && (
                <button type="button" className="secondary-btn compact" onClick={startDelete}>
                  Delete
                </button>
              )}
            </div>
          )}
          <div className="section-head">
            <div>
              <h2>{selectedDeposit.bankName}</h2>
              <p>{selectedDeposit.accountNumber}</p>
            </div>
            {!isReadOnly && (
              <div className={isMobile ? 'hero-actions mobile-hidden' : 'hero-actions'}>
                <button type="button" className="secondary-btn compact" onClick={() => startCloning(selectedDeposit)}>
                  Clone
                </button>
                <button type="button" className="secondary-btn compact" onClick={() => startEditing(selectedDeposit)}>
                  Edit
                </button>
                <button type="button" className="secondary-btn compact" onClick={startArchive}>
                  Archive
                </button>
                {canDeletePortfolio && (
                  <button type="button" className="secondary-btn compact" onClick={startDelete}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
          {!isReadOnly && archiveTargetId === selectedDeposit.id && (
            <div className="inline-action-card">
              <div>
                <strong>Archive this investment?</strong>
                <p>
                  It will be hidden from normal views. This will be blocked if its maturity or
                  interest is already funding another investment.
                </p>
              </div>
              <div className="inline-action-buttons">
                <button type="button" className="secondary-btn compact" onClick={cancelArchive} disabled={isArchiving}>
                  Cancel
                </button>
                <button type="button" className="primary-btn compact-btn" onClick={confirmArchive} disabled={isArchiving}>
                  {isArchiving ? 'Archiving...' : 'Confirm archive'}
                </button>
              </div>
            </div>
          )}
          {!isReadOnly && canDeletePortfolio && deleteTargetId === selectedDeposit.id && (
            <div className="inline-action-card">
              <div>
                <strong>Delete this investment permanently?</strong>
                <p>
                  This is an admin-only hard delete and cannot be undone.
                </p>
              </div>
              <div className="inline-action-buttons">
                <button type="button" className="secondary-btn compact" onClick={cancelDelete} disabled={isDeleting}>
                  Cancel
                </button>
                <button type="button" className="primary-btn compact-btn" onClick={confirmDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Confirm delete'}
                </button>
              </div>
            </div>
          )}
          {isPastMaturityOpen(selectedDeposit) && (
            <div className="status-banner warning past-maturity-banner">
              This investment has passed its maturity date but is still marked open. Review and close it if settlement is complete.
            </div>
          )}

          {isMobile ? (
            <>
              {renderMobileDetailSection(
                'summary',
                'Summary',
                `${selectedDeposit.instrumentType} • ${selectedDeposit.status}`,
                <div className="detail-grid">
                  <div><span>Holder</span><strong>{selectedDeposit.holderName}</strong></div>
                  <div><span>Funding source</span><strong>{selectedDeposit.fundingSource}</strong></div>
                  <div><span>Instrument</span><strong>{selectedDeposit.instrumentType}</strong></div>
                  <div><span>Payout mode</span><strong>{getPayoutModeLabel(selectedDeposit)}</strong></div>
                  <div><span>Interest calc</span><strong>{getCalculationFrequencyLabel(selectedDeposit.calculationFrequency)}</strong></div>
                  <div><span>Principal</span><strong>{formatCurrency(selectedDeposit.principalAmount)}</strong></div>
                  <div><span>Interest rate</span><strong>{formatInterestRate(selectedDeposit.interestRate)}</strong></div>
                  <div><span>Interest payout before TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutBeforeTds)}</strong></div>
                  <div><span>Interest payout after TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutAfterTds)}</strong></div>
                  <div><span>Invested on</span><strong>{formatDate(selectedDeposit.investmentDate)}</strong></div>
                  <div><span>Matures on</span><strong>{formatDate(selectedDeposit.maturityDate)}</strong></div>
                  <div><span>Maturity before TDS</span><strong>{formatCurrency(selectedDeposit.maturityBeforeTax)}</strong></div>
                  <div><span>Maturity after TDS</span><strong>{formatCurrency(selectedDeposit.maturityAfterTax)}</strong></div>
                </div>,
              )}

              {renderMobileDetailSection(
                'funding',
                'Funding and notes',
                selectedSourceEvents.length > 0
                  ? `${selectedSourceEvents.length} source link${selectedSourceEvents.length > 1 ? 's' : ''}`
                  : 'No source links',
                <div className="meta-block mobile-section-block">
                  {needsPeriodicPayoutSetup(selectedDeposit) && (
                    <p className="inline-warning">
                      This periodic-interest record is incomplete. Add fixed payout before TDS and
                      after TDS values so the interest schedule uses your actual bank payout.
                    </p>
                  )}
                  <p><strong>Investment ID:</strong> {selectedDeposit.id}</p>
                  <p><strong>Funded from:</strong> {selectedSourceEvents.length === 0 && 'None'}</p>
                  {selectedSourceEvents.length > 0 && (
                    <div className="allocation-breakdown-list">
                      {selectedSourceEvents.map((event) => (
                        <button
                          key={`${event.eventId}-${event.allocatedAmount}`}
                          type="button"
                          className="allocation-pill"
                          onClick={() => openDepositDetail(event.depositId)}
                        >
                          <strong>{event.bankName}</strong>
                          <span>
                            {event.accountNumber || 'No account no.'} | {event.type === 'Interest' ? 'Interest source' : 'Maturity source'} | {formatDate(event.date)} | {formatCurrency(event.allocatedAmount)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p><strong>Notes:</strong> {selectedDeposit.notes || 'No notes yet.'}</p>
                </div>,
              )}

              {renderMobileDetailSection(
                'maturity',
                'Maturity use',
                selectedReinvestmentSummary?.availableAmount !== null
                  ? selectedReinvestmentSummary.isRealized
                    ? formatCurrency(selectedReinvestmentSummary.uninvestedAmount)
                    : `Expected ${formatCurrency(selectedReinvestmentSummary.availableAmount)}`
                  : 'Needs maturity amount',
                <div className="allocation-card mobile-section-block">
                  <p className="allocation-title">Maturity usage</p>
                  {renderMaturityUsageContent()}
                </div>,
              )}

              {selectedInterestEvents.length > 0 &&
                renderMobileDetailSection(
                  'interest',
                  'Interest',
                  `${selectedInterestSummary.eventRows.length} receipt${selectedInterestSummary.eventRows.length > 1 ? 's' : ''}`,
                  <div className="panel inset-panel mobile-section-block">
                    <div className="section-head section-head-split">
                      <div>
                        <h2>Interest</h2>
                        <p>Generated cash flow events for periodic-interest products.</p>
                      </div>
                      {!isReadOnly && selectedInterestSummary.totalDueUnallocated > 0 && (
                        <div className="section-head-actions">
                          <button type="button" className="secondary-btn compact" onClick={fillFromAllAvailableInterest}>
                            Use all available interest
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="interest-summary-grid">
                      <div className="interest-summary-card"><span>Interest received till date</span><strong>{formatCurrency(selectedInterestSummary.totalDueExpected)}</strong></div>
                      <div className="interest-summary-card"><span>Received and reinvested</span><strong>{formatCurrency(selectedInterestSummary.totalDueAllocated)}</strong></div>
                      <div className="interest-summary-card"><span>Settled outside YieldFlow</span><strong>{formatCurrency(selectedInterestSummary.totalDueSettled)}</strong></div>
                      <div className="interest-summary-card">
                        <span>Received but not reinvested yet</span>
                        <strong className={selectedInterestSummary.totalDueUnallocated > 0 ? 'amount-warning' : 'amount-ok'}>
                          {formatCurrency(selectedInterestSummary.totalDueUnallocated)}
                        </strong>
                      </div>
                      <div className="interest-summary-card"><span>Interest expected in future</span><strong>{formatCurrency(selectedInterestSummary.totalFutureExpected)}</strong></div>
                      {selectedInterestSummary.totalExternalTopUp > 0 && (
                        <div className="interest-summary-card">
                          <span>Added from other funds</span>
                          <strong>{formatCurrency(selectedInterestSummary.totalExternalTopUp)}</strong>
                          <small>Extra amount beyond this interest source</small>
                        </div>
                      )}
                    </div>
                    <div className="schedule-list">
                      {selectedInterestSummary.eventRows.map((event) => (
                        <div key={event.eventId} className="schedule-card schedule-card-stacked">
                          <div>
                            <strong>{formatDate(event.date)}</strong>
                            <p>{event.isDue ? 'Status: Received period' : 'Status: Expected in future'}</p>
                            <p>Pre-TDS {formatCurrency(event.grossAmount)} | Post-TDS {formatCurrency(event.amount)}</p>
                            <p>Event ID {event.eventId}</p>
                            <p>
                              Reinvested {formatCurrency(event.allocatedWithinEventAmount)} | Left to allocate{' '}
                              <span className={event.unallocatedAmount > 0 ? 'amount-warning' : 'amount-ok'}>
                                {formatCurrency(event.unallocatedAmount)}
                              </span>
                            </p>
                            {event.settledAmount > 0 && <p>Settled outside YieldFlow {formatCurrency(event.settledAmount)}</p>}
                            {event.externalTopUpAmount > 0 && <p>Added from other funds {formatCurrency(event.externalTopUpAmount)}</p>}
                          </div>
                          {!isReadOnly && event.isDue && event.unallocatedAmount > 0 && (
                            <div className="schedule-actions">
                              <button type="button" className="secondary-btn compact" onClick={() => applyCashFlowSource(event)}>
                                Use as source
                              </button>
                              <button
                                type="button"
                                className="secondary-btn compact ghost-btn"
                                onClick={() => settleCashFlowEvent(event)}
                                disabled={settlingEventId === event.eventId}
                              >
                                {settlingEventId === event.eventId ? 'Settling...' : 'Mark settled'}
                              </button>
                            </div>
                          )}
                          {event.allocations.length > 0 ? (
                            <div className="allocation-breakdown">
                              <p className="allocation-title">Reinvested into</p>
                              <div className="allocation-breakdown-list">
                                {event.allocations.map((allocation) => (
                                  <button
                                    key={`${event.eventId}-${allocation.deposit.id}-${allocation.amount}`}
                                    type="button"
                                    className="allocation-pill"
                                    onClick={() => openDepositDetail(allocation.deposit.id)}
                                  >
                                    <strong>{allocation.deposit.bankName}</strong>
                                    <span>{allocation.deposit.accountNumber} | {formatCurrency(allocation.amount)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : !event.isDue ? (
                            <p className="lineage-empty">This interest is still expected in future and cannot be used yet.</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>,
                )}
            </>
          ) : (
            <>
              <div className="detail-grid">
                <div><span>Holder</span><strong>{selectedDeposit.holderName}</strong></div>
                <div><span>Funding source</span><strong>{selectedDeposit.fundingSource}</strong></div>
                <div><span>Instrument</span><strong>{selectedDeposit.instrumentType}</strong></div>
                <div><span>Payout mode</span><strong>{getPayoutModeLabel(selectedDeposit)}</strong></div>
                <div><span>Interest calc</span><strong>{getCalculationFrequencyLabel(selectedDeposit.calculationFrequency)}</strong></div>
                <div><span>Principal</span><strong>{formatCurrency(selectedDeposit.principalAmount)}</strong></div>
                <div><span>Interest rate</span><strong>{formatInterestRate(selectedDeposit.interestRate)}</strong></div>
                <div><span>Interest payout before TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutBeforeTds)}</strong></div>
                <div><span>Interest payout after TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutAfterTds)}</strong></div>
                <div><span>Invested on</span><strong>{formatDate(selectedDeposit.investmentDate)}</strong></div>
                <div><span>Matures on</span><strong>{formatDate(selectedDeposit.maturityDate)}</strong></div>
                <div><span>Maturity before TDS</span><strong>{formatCurrency(selectedDeposit.maturityBeforeTax)}</strong></div>
                <div><span>Maturity after TDS</span><strong>{formatCurrency(selectedDeposit.maturityAfterTax)}</strong></div>
              </div>

              <div className="meta-block">
                {needsPeriodicPayoutSetup(selectedDeposit) && (
                  <p className="inline-warning">
                    This periodic-interest record is incomplete. Add fixed payout before TDS and
                    after TDS values so the interest schedule uses your actual bank payout.
                  </p>
                )}
                <p><strong>Investment ID:</strong> {selectedDeposit.id}</p>
                <p><strong>Funded from:</strong> {selectedSourceEvents.length === 0 && 'None'}</p>
                {selectedSourceEvents.length > 0 && (
                  <div className="allocation-breakdown-list">
                    {selectedSourceEvents.map((event) => (
                      <button
                        key={`${event.eventId}-${event.allocatedAmount}`}
                        type="button"
                        className="allocation-pill"
                        onClick={() => openDepositDetail(event.depositId)}
                      >
                        <strong>{event.bankName}</strong>
                        <span>
                          {event.accountNumber || 'No account no.'} | {event.type === 'Interest' ? 'Interest source' : 'Maturity source'} | {formatDate(event.date)} | {formatCurrency(event.allocatedAmount)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p><strong>Notes:</strong> {selectedDeposit.notes || 'No notes yet.'}</p>
              </div>

              <div className="allocation-card">
                <p className="allocation-title">Maturity usage</p>
                {renderMaturityUsageContent()}
              </div>

              {selectedInterestEvents.length > 0 && (
                <div className="panel inset-panel">
                  <div className="section-head section-head-split">
                    <div>
                      <h2>Interest</h2>
                      <p>Generated cash flow events for periodic-interest products.</p>
                    </div>
                    {!isReadOnly && selectedInterestSummary.totalDueUnallocated > 0 && (
                      <div className="section-head-actions">
                        <button type="button" className="secondary-btn compact" onClick={fillFromAllAvailableInterest}>
                          Use all available interest
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="interest-summary-grid">
                    <div className="interest-summary-card"><span>Interest received till date</span><strong>{formatCurrency(selectedInterestSummary.totalDueExpected)}</strong></div>
                    <div className="interest-summary-card"><span>Received and reinvested</span><strong>{formatCurrency(selectedInterestSummary.totalDueAllocated)}</strong></div>
                    <div className="interest-summary-card"><span>Settled outside YieldFlow</span><strong>{formatCurrency(selectedInterestSummary.totalDueSettled)}</strong></div>
                    <div className="interest-summary-card">
                      <span>Received but not reinvested yet</span>
                      <strong className={selectedInterestSummary.totalDueUnallocated > 0 ? 'amount-warning' : 'amount-ok'}>
                        {formatCurrency(selectedInterestSummary.totalDueUnallocated)}
                      </strong>
                    </div>
                    <div className="interest-summary-card"><span>Interest expected in future</span><strong>{formatCurrency(selectedInterestSummary.totalFutureExpected)}</strong></div>
                    {selectedInterestSummary.totalExternalTopUp > 0 && (
                      <div className="interest-summary-card">
                        <span>Added from other funds</span>
                        <strong>{formatCurrency(selectedInterestSummary.totalExternalTopUp)}</strong>
                        <small>Extra amount beyond this interest source</small>
                      </div>
                    )}
                  </div>
                  <div className="schedule-list">
                    {selectedInterestSummary.eventRows.map((event) => (
                      <div key={event.eventId} className="schedule-card schedule-card-stacked">
                        <div>
                          <strong>{formatDate(event.date)}</strong>
                          <p>{event.isDue ? 'Status: Received period' : 'Status: Expected in future'}</p>
                          <p>Pre-TDS {formatCurrency(event.grossAmount)} | Post-TDS {formatCurrency(event.amount)}</p>
                          <p>Event ID {event.eventId}</p>
                          <p>
                            Reinvested {formatCurrency(event.allocatedWithinEventAmount)} | Left to allocate{' '}
                            <span className={event.unallocatedAmount > 0 ? 'amount-warning' : 'amount-ok'}>
                              {formatCurrency(event.unallocatedAmount)}
                            </span>
                          </p>
                          {event.settledAmount > 0 && <p>Settled outside YieldFlow {formatCurrency(event.settledAmount)}</p>}
                          {event.externalTopUpAmount > 0 && <p>Added from other funds {formatCurrency(event.externalTopUpAmount)}</p>}
                        </div>
                        {!isReadOnly && event.isDue && event.unallocatedAmount > 0 && (
                          <div className="schedule-actions">
                            <button type="button" className="secondary-btn compact" onClick={() => applyCashFlowSource(event)}>
                              Use as source
                            </button>
                            <button
                              type="button"
                              className="secondary-btn compact ghost-btn"
                              onClick={() => settleCashFlowEvent(event)}
                              disabled={settlingEventId === event.eventId}
                            >
                              {settlingEventId === event.eventId ? 'Settling...' : 'Mark settled'}
                            </button>
                          </div>
                        )}
                        {event.allocations.length > 0 ? (
                          <div className="allocation-breakdown">
                            <p className="allocation-title">Reinvested into</p>
                            <div className="allocation-breakdown-list">
                              {event.allocations.map((allocation) => (
                                <button
                                  key={`${event.eventId}-${allocation.deposit.id}-${allocation.amount}`}
                                  type="button"
                                  className="allocation-pill"
                                  onClick={() => openDepositDetail(allocation.deposit.id)}
                                >
                                  <strong>{allocation.deposit.bankName}</strong>
                                  <span>{allocation.deposit.accountNumber} | {formatCurrency(allocation.amount)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : !event.isDue ? (
                          <p className="lineage-empty">This interest is still expected in future and cannot be used yet.</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {isMobile && (
            <div className="mobile-detail-header">
              <button
                type="button"
                className="secondary-btn compact"
                onClick={() => setMobileDepositsScreen('list')}
              >
                Back to deposits
              </button>
            </div>
          )}
          <p>No deposit selected.</p>
        </>
      )}
    </article>
  )

  return isMobile ? (
    <section className="stack">
      {mobileDepositsScreen === 'detail' ? depositDetailPanel : depositsListPanel}
    </section>
  ) : (
    <section className="stack two-column">
      {depositsListPanel}
      {depositDetailPanel}
    </section>
  )
}
