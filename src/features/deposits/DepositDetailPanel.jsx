const DETAIL_EVENT_PREVIEW_LIMIT = 3

export default function DepositDetailPanel({
  applyCashFlowSource,
  archiveTargetId,
  canCloseSelectedDeposit,
  canDeletePortfolio,
  cancelArchive,
  cancelCloseInvestment,
  cancelDelete,
  cancelRenewInvestment,
  cashStatusSummary,
  closeDraft,
  closeError,
  closeGrossInterest,
  closeMaturityAfterTax,
  closeNetInterest,
  closeTargetId,
  closeTdsDeducted,
  confirmArchive,
  confirmDelete,
  deleteTargetId,
  detailDeposit,
  detailTimelineItems,
  expandedTimelineItems,
  fillFromAllAvailableInterest,
  formatCurrency,
  formatDate,
  formatInterestRate,
  getCalculationFrequencyLabel,
  getPayoutModeLabel,
  handleCloseDraftChange,
  handleRenewDraftChange,
  hasPositiveAmount,
  interestEventRows,
  isArchiving,
  isClosedDeposit,
  isClosingSelectedDeposit,
  isDeleting,
  isMobile,
  isPastMaturityOpen,
  isPeriodicDeposit,
  isReadOnly,
  isRenewingSelectedDeposit,
  needsPeriodicPayoutSetup,
  nextActionConfig,
  openCloseInvestmentPanel,
  openDepositDetail,
  openRenewInvestmentPopup,
  renderMaturityUsageContent,
  renderMobileDetailSection,
  renewDraft,
  renewError,
  renewTargetId,
  renewalInvestmentDate,
  renewalMaturityDate,
  selectedDeposit,
  selectedEffectiveMaturityDate,
  selectedInterestEvents,
  selectedInterestSummary,
  selectedReinvestmentSummary,
  selectedSourceEvents,
  setMobileDepositsScreen,
  setRenewDraft,
  setRenewError,
  setShowAllInterestEvents,
  setShowAllTimelineItems,
  settleCashFlowEvent,
  settlingEventId,
  showAllInterestEvents,
  showAllTimelineItems,
  showCashStatusSummary,
  startArchive,
  startCloning,
  startDelete,
  startEditing,
  submitCloseInvestment,
  submitRenewInvestment,
  todayTime,
  toggleTimelineItem,
  visibleDetailTimelineItems,
  visibleInterestEventRows,
}) {
  const renderTimelineContent = (includeHeading = true) => (
    <>
      {includeHeading ? (
        <div className="section-head section-head-split">
          <div>
            <h3>Cashflow timeline</h3>
            <p>Investment, interest, reinvestment, and maturity events in date order.</p>
          </div>
        </div>
      ) : null}
      <div className="deposit-timeline-list">
        {visibleDetailTimelineItems.map((item) => {
          const isExpanded = Boolean(expandedTimelineItems[item.key])

          return (
            <article key={item.key} className="deposit-timeline-card">
              <button
                type="button"
                className="deposit-timeline-toggle"
                onClick={() => toggleTimelineItem(item.key)}
                aria-expanded={isExpanded}
              >
                <div>
                  <strong>{item.kind}</strong>
                  <span>{formatDate(item.date)} · {item.status}</span>
                </div>
                <div className="deposit-timeline-amount">
                  <strong>{formatCurrency(item.amount)}</strong>
                  <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                </div>
              </button>
              {isExpanded ? (
                <div className="deposit-timeline-body">
                  <p>{item.detail}</p>
                  {item.relatedDepositId ? (
                    <button
                      type="button"
                      className="mini-link"
                      onClick={() => openDepositDetail(item.relatedDepositId)}
                    >
                      View {item.relatedDepositLabel || 'related investment'}
                    </button>
                  ) : null}
                  {item.canAllocate && item.onAllocate ? (
                    <div className="schedule-actions">
                      <button type="button" className="secondary-btn compact" onClick={item.onAllocate}>
                        Reinvest / allocate
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
        {detailTimelineItems.length > 5 ? (
          <button
            type="button"
            className="mini-link timeline-preview-more"
            onClick={() => setShowAllTimelineItems((current) => !current)}
          >
            {showAllTimelineItems
              ? 'Show fewer timeline events'
              : `View all ${detailTimelineItems.length} timeline events`}
          </button>
        ) : null}
      </div>
    </>
  )

  return (
    <article className="panel detail-panel">
      {detailDeposit ? (
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
              <button type="button" className="secondary-btn compact" onClick={() => openRenewInvestmentPopup(selectedDeposit)}>
                Renew
              </button>
              <button type="button" className="secondary-btn compact" onClick={() => startEditing(selectedDeposit)}>
                Edit
              </button>
              {canCloseSelectedDeposit && (
                <button type="button" className="primary-btn compact" onClick={openCloseInvestmentPanel}>
                  Close investment
                </button>
              )}
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
                <button type="button" className="secondary-btn compact" onClick={() => openRenewInvestmentPopup(selectedDeposit)}>
                  Renew
                </button>
                <button type="button" className="secondary-btn compact" onClick={() => startEditing(selectedDeposit)}>
                  Edit
                </button>
                {canCloseSelectedDeposit && (
                  <button type="button" className="primary-btn compact" onClick={openCloseInvestmentPanel}>
                    Close investment
                  </button>
                )}
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
          {!isReadOnly && renewTargetId === selectedDeposit.id && (
            <div
              className="about-modal-backdrop"
              role="presentation"
              onClick={isRenewingSelectedDeposit ? undefined : cancelRenewInvestment}
              onTouchMove={(event) => {
                if (event.target === event.currentTarget) {
                  event.preventDefault()
                }
              }}
            >
              <form
                className="about-modal panel renewal-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="renew-investment-title"
                onClick={(event) => event.stopPropagation()}
                onSubmit={submitRenewInvestment}
              >
                <div className="section-head">
                  <div>
                    <h2 id="renew-investment-title">Renew investment</h2>
                    <p>Creates a new investment using the existing maturity date and tenure.</p>
                  </div>
                </div>
                <div className="close-investment-context renewal-context">
                  <p><span>Existing maturity</span><strong>{formatDate(renewalInvestmentDate)}</strong></p>
                  <p><span>New investment date</span><strong>{formatDate(renewalInvestmentDate)}</strong></p>
                  <p><span>New maturity date</span><strong>{formatDate(renewalMaturityDate)}</strong></p>
                </div>
                <div className="editor-grid">
                  <label className="field">
                    <span>Actual maturity cash</span>
                    <input
                      name="actualMaturityCash"
                      type="number"
                      min="0"
                      step="0.01"
                      value={renewDraft.actualMaturityCash}
                      onChange={handleRenewDraftChange}
                      autoComplete="off"
                    />
                  </label>
                  <label className="field">
                    <span>New investment value</span>
                    <input
                      name="principalAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={renewDraft.principalAmount}
                      onChange={handleRenewDraftChange}
                      autoComplete="off"
                    />
                  </label>
                  <label className="field">
                    <span>New maturity value</span>
                    <input
                      name="maturityBeforeTax"
                      type="number"
                      min="0"
                      step="0.01"
                      value={renewDraft.maturityBeforeTax}
                      onChange={handleRenewDraftChange}
                      autoComplete="off"
                    />
                  </label>
                </div>
                {renewDraft.salaryAllocations.length > 0 ? (
                  <section className="salary-lines">
                    <div className="section-head">
                      <div>
                        <h3>Carry salary funding forward</h3>
                        <p>Assign any portion of each salary source to the successor. Unassigned amounts return to “To be invested”.</p>
                      </div>
                    </div>
                    {renewDraft.salaryAllocations.map((allocation, index) => (
                      <label className="field salary-line" key={allocation.salarySavingId}>
                        <span>{allocation.salaryMonth} · previously linked {formatCurrency(allocation.linkedAmount)}</span>
                        <input
                          type="number"
                          min="0"
                          max={allocation.linkedAmount}
                          step="0.01"
                          value={allocation.amount}
                          onChange={(event) => {
                            const value = event.target.value
                            setRenewDraft((current) => ({
                              ...current,
                              salaryAllocations: current.salaryAllocations.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, amount: value } : item,
                              ),
                            }))
                            setRenewError('')
                          }}
                        />
                      </label>
                    ))}
                  </section>
                ) : null}
                {renewError ? <p className="field-error">{renewError}</p> : null}
                <div className="backup-confirm-modal-actions">
                  <button
                    type="button"
                    className="secondary-btn compact ghost-btn"
                    onClick={cancelRenewInvestment}
                    disabled={isRenewingSelectedDeposit}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-btn compact-btn"
                    disabled={isRenewingSelectedDeposit}
                  >
                    {isRenewingSelectedDeposit ? 'Renewing...' : 'Create renewal'}
                  </button>
                </div>
              </form>
            </div>
          )}
          <div className="deposit-detail-summary">
            <div className="deposit-detail-hero">
              <strong>{formatCurrency(selectedDeposit.principalAmount)}</strong>
              <span>
                {selectedDeposit.holderName} • {selectedDeposit.instrumentType} • {selectedDeposit.status}
              </span>
            </div>
            <div className="detail-grid detail-grid-compact">
              <div><span>{isClosedDeposit ? 'Cash received on' : 'Next maturity'}</span><strong>{formatDate(selectedEffectiveMaturityDate)}</strong></div>
              {isPeriodicDeposit && (
                <div><span>Next payout schedule</span><strong>{getPayoutModeLabel(selectedDeposit)}</strong></div>
              )}
              {isClosedDeposit && (
                <div><span>Interest calc</span><strong>{getCalculationFrequencyLabel(selectedDeposit.calculationFrequency)}</strong></div>
              )}
              <div><span>Interest rate</span><strong>{formatInterestRate(selectedDeposit.interestRate)}</strong></div>
            </div>
          </div>
          {nextActionConfig && closeTargetId !== selectedDeposit.id ? (
            <div className="deposit-next-action-card">
              <div>
                <span>Next action</span>
                <strong>{nextActionConfig.title}</strong>
                <p>{nextActionConfig.detail}</p>
              </div>
              {nextActionConfig.ctaLabel && nextActionConfig.onClick ? (
                <button type="button" className="primary-btn compact-btn" onClick={nextActionConfig.onClick}>
                  {nextActionConfig.ctaLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          {closeTargetId === selectedDeposit.id ? (
            <form className="close-investment-card" onSubmit={submitCloseInvestment}>
              <div className="section-head section-head-split">
                <div>
                  <h3>Close investment</h3>
                  <p>Enter the final maturity values from the institution. These values make maturity cash available for reinvestment tracking.</p>
                </div>
                <button
                  type="button"
                  className="secondary-btn compact ghost-btn"
                  onClick={cancelCloseInvestment}
                  disabled={isClosingSelectedDeposit}
                >
                  Cancel
                </button>
              </div>
              <div className="close-investment-context">
                <p><span>Institution</span><strong>{selectedDeposit.bankName}</strong></p>
                <p><span>Reference</span><strong>{selectedDeposit.accountNumber}</strong></p>
                <p><span>Holder</span><strong>{selectedDeposit.holderName}</strong></p>
                <p><span>Principal</span><strong>{formatCurrency(selectedDeposit.principalAmount)}</strong></p>
                <p><span>Original maturity</span><strong>{formatDate(selectedDeposit.maturityDate)}</strong></p>
                <p><span>Interest rate</span><strong>{formatInterestRate(selectedDeposit.interestRate)}</strong></p>
              </div>
              <div className="editor-grid">
                <label className="field">
                  <span>Closure date</span>
                  <input
                    name="closureDate"
                    type="date"
                    value={closeDraft.closureDate}
                    onChange={handleCloseDraftChange}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>Maturity before TDS</span>
                  <input
                    name="maturityBeforeTax"
                    type="number"
                    min="0"
                    step="0.01"
                    value={closeDraft.maturityBeforeTax}
                    onChange={handleCloseDraftChange}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>Maturity received after TDS</span>
                  <input
                    name="maturityAfterTax"
                    type="number"
                    min="0"
                    step="0.01"
                    value={closeDraft.maturityAfterTax}
                    onChange={handleCloseDraftChange}
                    autoComplete="off"
                  />
                </label>
                <label className="field full">
                  <span>Closure notes</span>
                  <textarea
                    name="notes"
                    value={closeDraft.notes}
                    onChange={handleCloseDraftChange}
                    placeholder="Optional bank reference or closure note"
                  />
                </label>
              </div>
              <div className="close-investment-preview">
                <div><span>Gross interest</span><strong>{formatCurrency(closeGrossInterest)}</strong></div>
                <div><span>TDS deducted</span><strong>{formatCurrency(closeTdsDeducted)}</strong></div>
                <div><span>Net interest after TDS</span><strong>{formatCurrency(closeNetInterest)}</strong></div>
                <div><span>Cash available after closure</span><strong>{formatCurrency(closeMaturityAfterTax)}</strong></div>
              </div>
              {closeDraft.closureDate && closeDraft.closureDate < selectedDeposit.maturityDate ? (
                <p className="inline-warning">
                  This is a premature closure. Cashflow and FY receipt views will use the closure date, while the original maturity date stays unchanged.
                </p>
              ) : null}
              {new Date(`${selectedDeposit.maturityDate}T00:00:00`).getTime() > todayTime ? (
                <p className="inline-warning">
                  This maturity date is in the future. Close only if the institution has already paid.
                </p>
              ) : null}
              {closeError ? <p className="field-error">{closeError}</p> : null}
              <div className="inline-action-buttons">
                <button
                  type="submit"
                  className="primary-btn compact-btn"
                  disabled={isClosingSelectedDeposit}
                >
                  {isClosingSelectedDeposit ? 'Closing...' : 'Close investment'}
                </button>
              </div>
            </form>
          ) : null}
          {showCashStatusSummary ? (
            <details className="detail-secondary-section cash-breakdown-disclosure">
              <summary>
                <strong>Cash activity</strong>
                <span>Received, reinvested, upcoming, and available cash</span>
              </summary>
              <div className="detail-secondary-content">
                <div className="interest-summary-grid">
                  <div className="interest-summary-card">
                    <span>Cash received</span>
                    <strong>{formatCurrency(cashStatusSummary?.received)}</strong>
                  </div>
                  <div className="interest-summary-card">
                    <span>Reinvested</span>
                    <strong>{formatCurrency(cashStatusSummary?.reinvested)}</strong>
                  </div>
                  <div className="interest-summary-card">
                    <span>Upcoming cash</span>
                    <strong>{formatCurrency(cashStatusSummary?.upcoming)}</strong>
                  </div>
                  <div className="interest-summary-card">
                    <span>Available to reinvest</span>
                    <strong className={Number(cashStatusSummary?.availableToReinvest || 0) > 0 ? 'amount-warning' : 'amount-ok'}>
                      {formatCurrency(cashStatusSummary?.availableToReinvest)}
                    </strong>
                  </div>
                </div>
              </div>
            </details>
          ) : null}
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
              This investment has passed its maturity date but is still marked open. You may want to review and close it.
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
                  <div><span>Interest payout mode</span><strong>{getPayoutModeLabel(selectedDeposit)}</strong></div>
                  <div><span>Interest calc</span><strong>{getCalculationFrequencyLabel(selectedDeposit.calculationFrequency)}</strong></div>
                  <div><span>Principal</span><strong>{formatCurrency(selectedDeposit.principalAmount)}</strong></div>
                  <div><span>Interest rate</span><strong>{formatInterestRate(selectedDeposit.interestRate)}</strong></div>
                  {isPeriodicDeposit && hasPositiveAmount(selectedDeposit.interestPayoutBeforeTds) && (
                    <div><span>Interest payout before TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutBeforeTds)}</strong></div>
                  )}
                  {isPeriodicDeposit && hasPositiveAmount(selectedDeposit.interestPayoutAfterTds) && (
                    <div><span>Interest payout after TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutAfterTds)}</strong></div>
                  )}
                  <div><span>Invested on</span><strong>{formatDate(selectedDeposit.investmentDate)}</strong></div>
                  <div><span>Matures on</span><strong>{formatDate(selectedDeposit.maturityDate)}</strong></div>
                  {isClosedDeposit && selectedDeposit.closureDate && (
                    <div><span>Closed on</span><strong>{formatDate(selectedDeposit.closureDate)}</strong></div>
                  )}
                  {hasPositiveAmount(selectedDeposit.maturityBeforeTax) && (
                    <div><span>{isClosedDeposit ? 'Maturity before TDS' : 'Expected maturity before TDS'}</span><strong>{formatCurrency(selectedDeposit.maturityBeforeTax)}</strong></div>
                  )}
                  {hasPositiveAmount(selectedDeposit.maturityAfterTax) && (
                    <div><span>Maturity after TDS</span><strong>{formatCurrency(selectedDeposit.maturityAfterTax)}</strong></div>
                  )}
                </div>,
              )}

              {renderMobileDetailSection(
                'timeline',
                'Cashflow timeline',
                `${detailTimelineItems.length} events`,
                renderTimelineContent(false),
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
                            {event.accountNumber || 'No account number'} | {event.type === 'Interest' ? 'Interest source' : 'Maturity source'} | {formatDate(event.date)} | {formatCurrency(event.allocatedAmount)}
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
                        <h2>Interest schedule</h2>
                        <p>Upcoming and received payout events for this deposit.</p>
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
                        <span>Available to reinvest</span>
                        <strong className={selectedInterestSummary.totalDueUnallocated > 0 ? 'amount-warning' : 'amount-ok'}>
                          {formatCurrency(selectedInterestSummary.totalDueUnallocated)}
                        </strong>
                      </div>
                      <div className="interest-summary-card"><span>Upcoming interest</span><strong>{formatCurrency(selectedInterestSummary.totalFutureExpected)}</strong></div>
                      {selectedInterestSummary.totalExternalTopUp > 0 && (
                        <div className="interest-summary-card">
                          <span>Added from other funds</span>
                          <strong>{formatCurrency(selectedInterestSummary.totalExternalTopUp)}</strong>
                          <small>Extra amount beyond this interest source</small>
                        </div>
                      )}
                    </div>
                    <div className="schedule-list">
                      {visibleInterestEventRows.map((event) => (
                        <div key={event.eventId} className="schedule-card schedule-card-stacked">
                          <div>
                            <strong>{formatDate(event.date)}</strong>
                            <p>{event.isDue ? 'Status: Received' : 'Status: Upcoming'}</p>
                            <p>Before TDS {formatCurrency(event.grossAmount)} | After TDS {formatCurrency(event.amount)}</p>
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
                            <p className="lineage-empty">Available after payout date.</p>
                          ) : null}
                        </div>
                      ))}
                      {interestEventRows.length > DETAIL_EVENT_PREVIEW_LIMIT ? (
                        <button
                          type="button"
                          className="mini-link timeline-preview-more"
                          onClick={() => setShowAllInterestEvents((current) => !current)}
                        >
                          {showAllInterestEvents ? 'Show fewer interest events' : 'View full interest schedule'}
                        </button>
                      ) : null}
                    </div>
                  </div>,
                )}
            </>
          ) : (
            <>
              {needsPeriodicPayoutSetup(selectedDeposit) && (
                <p className="inline-warning">
                  This periodic-interest record is incomplete. Add fixed payout before TDS and
                  after TDS values so the interest schedule uses your actual bank payout.
                </p>
              )}
              <details className="detail-secondary-section">
                <summary>
                  <strong>Investment details</strong>
                  <span>Terms, funding sources, and notes</span>
                </summary>
                <div className="detail-secondary-content">
                  <div className="detail-grid">
                    <div><span>Holder</span><strong>{selectedDeposit.holderName}</strong></div>
                    <div><span>Funding source</span><strong>{selectedDeposit.fundingSource}</strong></div>
                    <div><span>Instrument</span><strong>{selectedDeposit.instrumentType}</strong></div>
                    <div><span>Interest payout mode</span><strong>{getPayoutModeLabel(selectedDeposit)}</strong></div>
                    <div><span>Interest calc</span><strong>{getCalculationFrequencyLabel(selectedDeposit.calculationFrequency)}</strong></div>
                    <div><span>Principal</span><strong>{formatCurrency(selectedDeposit.principalAmount)}</strong></div>
                    <div><span>Interest rate</span><strong>{formatInterestRate(selectedDeposit.interestRate)}</strong></div>
                    {isPeriodicDeposit && hasPositiveAmount(selectedDeposit.interestPayoutBeforeTds) && (
                      <div><span>Interest payout before TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutBeforeTds)}</strong></div>
                    )}
                    {isPeriodicDeposit && hasPositiveAmount(selectedDeposit.interestPayoutAfterTds) && (
                      <div><span>Interest payout after TDS</span><strong>{formatCurrency(selectedDeposit.interestPayoutAfterTds)}</strong></div>
                    )}
                    <div><span>Invested on</span><strong>{formatDate(selectedDeposit.investmentDate)}</strong></div>
                    <div><span>Matures on</span><strong>{formatDate(selectedDeposit.maturityDate)}</strong></div>
                    {isClosedDeposit && selectedDeposit.closureDate && (
                      <div><span>Closed on</span><strong>{formatDate(selectedDeposit.closureDate)}</strong></div>
                    )}
                    {hasPositiveAmount(selectedDeposit.maturityBeforeTax) && (
                      <div><span>{isClosedDeposit ? 'Maturity before TDS' : 'Expected maturity before TDS'}</span><strong>{formatCurrency(selectedDeposit.maturityBeforeTax)}</strong></div>
                    )}
                    {hasPositiveAmount(selectedDeposit.maturityAfterTax) && (
                      <div><span>Maturity after TDS</span><strong>{formatCurrency(selectedDeposit.maturityAfterTax)}</strong></div>
                    )}
                  </div>

                  <div className="meta-block">
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
                              {event.accountNumber || 'No account number'} | {event.type === 'Interest' ? 'Interest source' : 'Maturity source'} | {formatDate(event.date)} | {formatCurrency(event.allocatedAmount)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p><strong>Notes:</strong> {selectedDeposit.notes || 'No notes yet.'}</p>
                  </div>
                </div>
              </details>

              <section className="deposit-timeline-panel">
                {renderTimelineContent()}
              </section>

                <details className="detail-secondary-section">
                  <summary>
                    <strong>Maturity usage</strong>
                    <span>
                      {selectedReinvestmentSummary?.isRealized
                        ? `Available ${formatCurrency(selectedReinvestmentSummary.uninvestedAmount)}`
                        : `Expected ${formatCurrency(selectedReinvestmentSummary?.availableAmount)}`}
                    </span>
                  </summary>
                  <div className="detail-secondary-content">
                    <div className="allocation-card">
                      <p className="allocation-title">Maturity usage</p>
                      {renderMaturityUsageContent()}
                    </div>
                  </div>
                </details>

                {selectedInterestEvents.length > 0 && (
                  <details className="detail-secondary-section">
                    <summary>
                      <strong>Interest schedule</strong>
                      <span>
                        {selectedInterestSummary.eventRows.length} events ·{' '}
                        {formatCurrency(selectedInterestSummary.totalFutureExpected)} upcoming
                      </span>
                    </summary>
                    <div className="detail-secondary-content">
                  <div className="panel inset-panel">
                    <div className="section-head section-head-split">
                      <div>
                        <h2>Interest schedule</h2>
                        <p>Upcoming and received payout events for this deposit.</p>
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
                        <span>Available to reinvest</span>
                        <strong className={selectedInterestSummary.totalDueUnallocated > 0 ? 'amount-warning' : 'amount-ok'}>
                          {formatCurrency(selectedInterestSummary.totalDueUnallocated)}
                        </strong>
                      </div>
                      <div className="interest-summary-card"><span>Upcoming interest</span><strong>{formatCurrency(selectedInterestSummary.totalFutureExpected)}</strong></div>
                      {selectedInterestSummary.totalExternalTopUp > 0 && (
                        <div className="interest-summary-card">
                          <span>Added from other funds</span>
                          <strong>{formatCurrency(selectedInterestSummary.totalExternalTopUp)}</strong>
                          <small>Extra amount beyond this interest source</small>
                        </div>
                      )}
                    </div>
                    <div className="schedule-list">
                      {visibleInterestEventRows.map((event) => (
                        <div key={event.eventId} className="schedule-card schedule-card-stacked">
                          <div>
                            <strong>{formatDate(event.date)}</strong>
                            <p>{event.isDue ? 'Status: Received' : 'Status: Upcoming'}</p>
                            <p>Before TDS {formatCurrency(event.grossAmount)} | After TDS {formatCurrency(event.amount)}</p>
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
                            <p className="lineage-empty">Available after payout date.</p>
                          ) : null}
                        </div>
                      ))}
                      {interestEventRows.length > DETAIL_EVENT_PREVIEW_LIMIT ? (
                        <button
                          type="button"
                          className="mini-link timeline-preview-more"
                          onClick={() => setShowAllInterestEvents((current) => !current)}
                        >
                          {showAllInterestEvents ? 'Show fewer interest events' : 'View full interest schedule'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                    </div>
                  </details>
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
}
