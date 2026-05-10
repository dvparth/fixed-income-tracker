import { useMemo, useState } from 'react'

const getBehaviorMode = (payoutMode) => (payoutMode === 'on-maturity' ? 'cumulative' : 'payout')

const getProductBehaviorLabel = (payoutMode) =>
  payoutMode === 'on-maturity' ? 'Cumulative' : 'Interest payout'

const getCompoundingFrequencyLabel = (value) => {
  const normalized = String(value || '').trim().toUpperCase()

  if (normalized === 'YEARLY') {
    return 'Yearly compounding'
  }
  if (normalized === 'MONTHLY') {
    return 'Monthly compounding'
  }
  if (normalized === 'SIMPLE') {
    return 'Simple accrual'
  }
  if (normalized === 'QUARTERLY') {
    return 'Quarterly compounding'
  }

  return 'Quarterly compounding'
}

const buildSuggestedFundingSources = (fundingSourceOptions) =>
  [...fundingSourceOptions]
    .sort((left, right) => new Date(`${right.date}T00:00:00`) - new Date(`${left.date}T00:00:00`))
    .slice(0, 3)

export default function DepositEditorView({
  isMobileEditorScreen,
  mobileEditorTitle,
  editingId,
  leaveEditorScreen,
  formValues,
  ownerOptions,
  fundingSourceMasterOptions,
  institutionOptions,
  branchOptions,
  instrumentTypeOptions,
  addNewMasterValue,
  sourcePreviewEvents,
  formatCurrency,
  formatDate,
  formErrors,
  handleFormChange,
  handleMasterBoundFieldChange,
  effectiveEditorPayoutMode,
  isPeriodicEditor,
  linkedFundingAmount,
  fundingDifference,
  selectedFundingEventId,
  handleFundingSourceSelect,
  fundingSourceOptions,
  fundingAmountDraft,
  setFundingAmountDraft,
  addFundingEntry,
  fundingEntries,
  cashFlowMap,
  editFundingEntry,
  removeFundingEntry,
  computedEditorInterestEarned,
  computedEditorTdsAmount,
  computedEditorTdsPercent,
  computedEditorTenure,
  handleSave,
  resetForm,
}) {
  const tenureParts = [
    computedEditorTenure.years > 0
      ? `${computedEditorTenure.years} Year${computedEditorTenure.years === 1 ? '' : 's'}`
      : null,
    computedEditorTenure.months > 0
      ? `${computedEditorTenure.months} Month${computedEditorTenure.months === 1 ? '' : 's'}`
      : null,
    computedEditorTenure.days > 0
      ? `${computedEditorTenure.days} Day${computedEditorTenure.days === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean)

  const tenureSummary =
    tenureParts.length > 0 ? tenureParts.join(' ') : 'Will appear after both dates are entered'
  const isEditingFundingEntry = fundingEntries.some(
    (entry) => entry.eventId === selectedFundingEventId,
  )
  const [fundingSourceSearch, setFundingSourceSearch] = useState('')

  const filteredFundingSourceOptions = useMemo(() => {
    const normalizedQuery = fundingSourceSearch.trim().toLowerCase()

    if (!normalizedQuery) {
      return fundingSourceOptions
    }

    const matches = fundingSourceOptions.filter((option) => {
      const searchText = [
        option.bankName,
        option.accountNumber,
        option.holderName,
        option.type,
        option.date,
        option.label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchText.includes(normalizedQuery)
    })

    if (
      selectedFundingEventId &&
      !matches.some((option) => option.eventId === selectedFundingEventId)
    ) {
      const selectedOption = fundingSourceOptions.find(
        (option) => option.eventId === selectedFundingEventId,
      )

      if (selectedOption) {
        return [selectedOption, ...matches]
      }
    }

    return matches
  }, [fundingSourceOptions, fundingSourceSearch, selectedFundingEventId])

  const behaviorMode = getBehaviorMode(effectiveEditorPayoutMode)
  const suggestedFundingSources = useMemo(
    () => buildSuggestedFundingSources(fundingSourceOptions),
    [fundingSourceOptions],
  )

  const triggerFormChange = (name, value) => handleFormChange({ target: { name, value } })

  const applyBehaviorMode = (nextBehaviorMode) => {
    if (nextBehaviorMode === 'cumulative') {
      triggerFormChange('payoutMode', 'on-maturity')
      return
    }

    triggerFormChange(
      'payoutMode',
      effectiveEditorPayoutMode === 'yearly-fixed' ? 'yearly-fixed' : 'quarterly-fy',
    )
  }

  const handleSuggestedFundingSource = (eventId) => {
    handleFundingSourceSelect({ target: { value: eventId } })
  }

  return (
    <section className="stack">
      <article className={isMobileEditorScreen ? 'panel mobile-editor-panel' : 'panel'}>
        {isMobileEditorScreen && (
          <div className="mobile-editor-header">
            <button type="button" className="secondary-btn compact" onClick={leaveEditorScreen}>
              Back
            </button>
            <div className="mobile-editor-heading">
              <h2>{mobileEditorTitle}</h2>
              <p>{editingId ? 'Update this investment' : 'Create a new investment'}</p>
            </div>
          </div>
        )}
        <div
          className={
            isMobileEditorScreen
              ? 'section-head editor-intro mobile-editor-intro'
              : 'section-head editor-intro'
          }
        >
          <div>
            <h2>{editingId ? 'Edit deposit' : 'Add deposit'}</h2>
            <p>
              Start with product behavior. It sets the most likely defaults, while calculation
              frequency and payout schedule still stay independently editable.
            </p>
            {!editingId && formValues.bankName && (
              <p className="inline-warning">
                Clone mode keeps the reusable investment setup but clears account, dates,
                maturity results, and funding lineage.
              </p>
            )}
          </div>
          {!isMobileEditorScreen && (
            <div className="section-head-actions">
              <button
                type="button"
                className="secondary-btn compact ghost-btn"
                onClick={leaveEditorScreen}
              >
                Back
              </button>
            </div>
          )}
        </div>

        <form className="editor-form" onSubmit={handleSave} autoComplete="off">
          <div className="editor-summary">
            <div className="editor-summary-card">
              <span>Product behavior</span>
              <strong>{getProductBehaviorLabel(effectiveEditorPayoutMode)}</strong>
              <small>
                {getCompoundingFrequencyLabel(formValues.calculationFrequency)}
                {' • '}
                {effectiveEditorPayoutMode === 'on-maturity'
                  ? 'Paid at maturity'
                  : effectiveEditorPayoutMode === 'yearly-fixed'
                    ? 'Yearly payout'
                    : 'Quarterly payout'}
              </small>
            </div>
            <div className="editor-summary-card">
              <span>Amount to invest</span>
              <strong>{formatCurrency(formValues.principalAmount)}</strong>
              <small>{formValues.holderName || 'Choose holder'}</small>
            </div>
            <div className="editor-summary-card">
              <span>{behaviorMode === 'cumulative' ? 'Maturity capture' : 'Interest payout capture'}</span>
              <strong>
                {behaviorMode === 'cumulative' ? 'Enter maturity values' : 'Enter payout values'}
              </strong>
              <small>
                {behaviorMode === 'cumulative'
                  ? 'Use institution-provided maturity details before and after TDS.'
                  : 'Use institution-provided payout values before and after TDS.'}
              </small>
            </div>
            {sourcePreviewEvents.length > 0 && (
              <div className="editor-summary-card">
                <span>Linked source</span>
                <strong>
                  {sourcePreviewEvents.length === 1
                    ? sourcePreviewEvents[0].bankName
                    : `${sourcePreviewEvents.length} sources linked`}
                </strong>
                <small>
                  {sourcePreviewEvents
                    .slice(0, 2)
                    .map((event) => `${event.bankName} • ${formatDate(event.date)}`)
                    .join(', ')}
                  {sourcePreviewEvents.length > 2 ? '...' : ''}
                </small>
              </div>
            )}
          </div>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Basics</h3>
              <p>Capture the owner, bank, and instrument before filling product rules.</p>
            </div>
            <div className="editor-grid">
              <label className="field">
                <span>Holder</span>
                <select
                  name="holderName"
                  value={formValues.holderName}
                  onChange={handleMasterBoundFieldChange}
                >
                  <option value="">Choose owner</option>
                  {ownerOptions.map((ownerName) => (
                    <option key={ownerName} value={ownerName}>
                      {ownerName}
                    </option>
                  ))}
                  <option value={addNewMasterValue}>Add new owner...</option>
                </select>
                {formErrors.holderName && <small className="field-error">{formErrors.holderName}</small>}
              </label>
              <label className="field">
                <span>Bank or issuer</span>
                <select
                  name="bankName"
                  value={formValues.bankName}
                  onChange={handleMasterBoundFieldChange}
                >
                  <option value="">Choose bank or issuer</option>
                  {institutionOptions.map((institutionName) => (
                    <option key={institutionName} value={institutionName}>
                      {institutionName}
                    </option>
                  ))}
                  <option value={addNewMasterValue}>Add new bank or issuer...</option>
                </select>
                {formErrors.bankName && <small className="field-error">{formErrors.bankName}</small>}
              </label>
              <label className="field">
                <span>Instrument</span>
                <select
                  name="instrumentType"
                  value={formValues.instrumentType}
                  onChange={handleMasterBoundFieldChange}
                >
                  <option value="">Choose instrument</option>
                  {instrumentTypeOptions.map((instrumentName) => (
                    <option key={instrumentName} value={instrumentName}>
                      {instrumentName}
                    </option>
                  ))}
                  <option value={addNewMasterValue}>Add new instrument type...</option>
                </select>
              </label>
              <label className="field">
                <span>Funding owner</span>
                <select
                  name="fundingSource"
                  value={formValues.fundingSource}
                  onChange={handleMasterBoundFieldChange}
                >
                  <option value="">Choose funding source</option>
                  {fundingSourceMasterOptions.map((sourceName) => (
                    <option key={sourceName} value={sourceName}>
                      {sourceName}
                    </option>
                  ))}
                  <option value={addNewMasterValue}>Add new owner...</option>
                </select>
                <small className="field-help">
                  Use this when the deposit belongs to one holder but the cash came from another
                  owner or pool.
                </small>
              </label>
            </div>
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Product behavior</h3>
              <p>Choose whether interest stays invested or pays out during the tenure.</p>
            </div>

            <div className="editor-behavior-grid">
              <button
                type="button"
                className={
                  behaviorMode === 'cumulative'
                    ? 'editor-behavior-card selected'
                    : 'editor-behavior-card'
                }
                onClick={() => applyBehaviorMode('cumulative')}
              >
                <strong>Cumulative</strong>
                <span>
                  Preset payout to maturity only. You can still adjust calculation frequency below.
                </span>
              </button>
              <button
                type="button"
                className={
                  behaviorMode === 'payout'
                    ? 'editor-behavior-card selected'
                    : 'editor-behavior-card'
                }
                onClick={() => applyBehaviorMode('payout')}
              >
                <strong>Interest payout</strong>
                <span>
                  Preset periodic payouts. Use the fields below if the product still compounds
                  internally.
                </span>
              </button>
            </div>

            <div className="editor-grid">
              <label className="field">
                <span>Interest rate %</span>
                <input
                  name="interestRate"
                  type="number"
                  step="0.01"
                  value={formValues.interestRate}
                  onChange={handleFormChange}
                  placeholder="e.g. 7.3"
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span>Interest calculation frequency</span>
                <select
                  name="calculationFrequency"
                  value={formValues.calculationFrequency}
                  onChange={handleFormChange}
                >
                  <option value="YEARLY">Yearly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="SIMPLE">Simple</option>
                </select>
                <small className="field-help">
                  Keep this separate from payout. Some long-tenure products may pay annually and
                  still calculate interest quarterly.
                </small>
              </label>

              <label className="field">
                <span>Interest payout schedule</span>
                <select name="payoutMode" value={formValues.payoutMode} onChange={handleFormChange}>
                  <option value="on-maturity">On maturity only</option>
                  <option value="quarterly-fy">Quarterly</option>
                  <option value="yearly-fixed">Yearly on fixed date</option>
                </select>
                <small className="field-help">
                  This controls when cash is received, not how the institution calculates interest
                  internally.
                </small>
              </label>

              {effectiveEditorPayoutMode === 'yearly-fixed' && (
                <label className="field">
                  <span>Interest payment date</span>
                  <input
                    name="yearlyPayoutMonthDay"
                    value={formValues.yearlyPayoutMonthDay}
                    onChange={handleFormChange}
                    placeholder="07-15"
                    autoComplete="off"
                  />
                  <small className="field-help">
                    Use MM-DD format, for example 06-30 for 30 June.
                  </small>
                  {formErrors.yearlyPayoutMonthDay && (
                    <small className="field-error">{formErrors.yearlyPayoutMonthDay}</small>
                  )}
                </label>
              )}

              {isPeriodicEditor && (
                <>
                  <label className="field">
                    <span>Interest before TDS</span>
                    <input
                      name="interestPayoutBeforeTds"
                      type="number"
                      value={formValues.interestPayoutBeforeTds}
                      onChange={handleFormChange}
                      placeholder="e.g. 30750"
                      autoComplete="off"
                    />
                    <small className="field-help">
                      Gross payout declared by the bank before tax deduction.
                    </small>
                  </label>
                  <label className="field">
                    <span>Interest received after TDS</span>
                    <input
                      name="interestPayoutAfterTds"
                      type="number"
                      value={formValues.interestPayoutAfterTds}
                      onChange={handleFormChange}
                      placeholder="e.g. 27675"
                      autoComplete="off"
                    />
                    <small className="field-help">
                      Net cash that actually lands in the account each payout.
                    </small>
                    {formErrors.interestPayoutAfterTds && (
                      <small className="field-error">{formErrors.interestPayoutAfterTds}</small>
                    )}
                  </label>
                </>
              )}
            </div>
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Amount and dates</h3>
              <p>Capture the investment amount and timeline from the institution document.</p>
            </div>
            <div className="editor-grid">
              <label className="field">
                <span>Principal amount</span>
                <input
                  className="amount-input"
                  name="principalAmount"
                  type="number"
                  value={formValues.principalAmount}
                  onChange={handleFormChange}
                  placeholder="e.g. 100000"
                  autoComplete="off"
                />
                {formErrors.principalAmount && (
                  <small className="field-error">{formErrors.principalAmount}</small>
                )}
              </label>
              <label className="field">
                <span>Investment date</span>
                <input
                  name="investmentDate"
                  type="date"
                  value={formValues.investmentDate}
                  onChange={handleFormChange}
                  autoComplete="off"
                />
                {formErrors.investmentDate && (
                  <small className="field-error">{formErrors.investmentDate}</small>
                )}
              </label>
              <label className="field">
                <span>Maturity date</span>
                <input
                  name="maturityDate"
                  type="date"
                  value={formValues.maturityDate}
                  onChange={handleFormChange}
                  autoComplete="off"
                />
                {formErrors.maturityDate && (
                  <small className="field-error">{formErrors.maturityDate}</small>
                )}
              </label>
              <div className="field full">
                <span>Calculated tenure</span>
                <div className="editor-summary-card">
                  <strong>{tenureSummary}</strong>
                  <small>
                    {computedEditorTenure.years}Y • {computedEditorTenure.months}M •{' '}
                    {computedEditorTenure.days}D
                  </small>
                </div>
              </div>
            </div>

            <div className="editor-grid">
              <label className="field">
                <span>Maturity before TDS</span>
                <input
                  name="maturityBeforeTax"
                  type="number"
                  value={formValues.maturityBeforeTax}
                  onChange={handleFormChange}
                  autoComplete="off"
                />
                <small className="field-help">
                  Gross maturity amount before tax deduction.
                </small>
              </label>
              <label className="field">
                <span>Maturity received after TDS</span>
                <input
                  name="maturityAfterTax"
                  type="number"
                  value={formValues.maturityAfterTax}
                  onChange={handleFormChange}
                  autoComplete="off"
                />
                <small className="field-help">
                  Net amount actually received. The difference from gross is treated as TDS.
                </small>
                {formErrors.maturityAfterTax && (
                  <small className="field-error">{formErrors.maturityAfterTax}</small>
                )}
              </label>
            </div>
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Funded from</h3>
              <p>Link realized maturity cash or prior interest receipts used to create this deposit.</p>
            </div>
            <div className="editor-funding-summary">
              <div>
                <span>Linked funding</span>
                <strong>{formatCurrency(linkedFundingAmount)}</strong>
              </div>
              <div>
                <span>Deposit amount</span>
                <strong>{formatCurrency(formValues.principalAmount)}</strong>
              </div>
              <div>
                <span>Difference</span>
                <strong
                  className={
                    fundingDifference === 0 || fundingDifference === null
                      ? 'amount-ok'
                      : 'amount-warning'
                  }
                >
                  {fundingDifference === null ? '--' : formatCurrency(fundingDifference)}
                </strong>
              </div>
            </div>
            {suggestedFundingSources.length > 0 && (
              <div className="editor-suggestion-strip">
                <span>Recent realized cash</span>
                <div className="editor-suggestion-list">
                  {suggestedFundingSources.map((option) => (
                    <button
                      key={option.eventId}
                      type="button"
                      className={
                        selectedFundingEventId === option.eventId
                          ? 'editor-suggestion-chip selected'
                          : 'editor-suggestion-chip'
                      }
                      onClick={() => handleSuggestedFundingSource(option.eventId)}
                    >
                      {option.bankName} • {formatDate(option.date)} •{' '}
                      {formatCurrency(option.availableAmount)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {formErrors.allocationsText && (
              <p className="field-error funding-error">{formErrors.allocationsText}</p>
            )}
            <div className="funding-picker">
              <div className="field funding-source-field">
                <span>Source</span>
                <input
                  type="search"
                  value={fundingSourceSearch}
                  onChange={(event) => setFundingSourceSearch(event.target.value)}
                  placeholder="Search by account no., bank, holder, or date"
                  autoComplete="off"
                />
                <p className="field-help funding-search-help">
                  {fundingSourceSearch.trim()
                    ? `${filteredFundingSourceOptions.length} matching source${
                        filteredFundingSourceOptions.length === 1 ? '' : 's'
                      }`
                    : 'Search maturity cash or interest receipts already realized in the portfolio.'}
                </p>
                <select value={selectedFundingEventId} onChange={handleFundingSourceSelect}>
                  <option value="">Choose maturity cash or interest receipt</option>
                  {filteredFundingSourceOptions.map((option) => (
                    <option key={option.eventId} value={option.eventId}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="field">
                <span>Amount to use</span>
                <input
                  type="number"
                  value={fundingAmountDraft}
                  onChange={(event) => setFundingAmountDraft(event.target.value)}
                  placeholder="e.g. 5000"
                  autoComplete="off"
                />
              </label>
              <div className="field funding-picker-action">
                <span className="funding-picker-action-label" aria-hidden="true">
                  Action
                </span>
                <button type="button" className="secondary-btn compact" onClick={addFundingEntry}>
                  {isEditingFundingEntry ? 'Update link' : 'Link cash'}
                </button>
              </div>
            </div>

            {fundingSourceOptions.length === 0 && (
              <p className="field-help">
                No realized maturity cash or interest receipts are available to link right now.
              </p>
            )}
            {fundingSourceOptions.length > 0 &&
              fundingSourceSearch.trim() &&
              filteredFundingSourceOptions.length === 0 && (
                <p className="field-help">
                  No source matched that search. Try account number, bank, holder, or date.
                </p>
              )}

            {fundingEntries.length > 0 && (
              <div className="allocation-breakdown-list">
                {fundingEntries.map((entry) => {
                  const sourceEvent = cashFlowMap.get(entry.eventId)

                  return (
                    <div key={entry.eventId} className="editor-source-chip">
                      <div>
                        <strong>{sourceEvent?.bankName || entry.eventId}</strong>
                        <span>
                          {sourceEvent
                            ? `${sourceEvent.accountNumber || 'No account number'} | ${
                                sourceEvent.type === 'Interest' ? 'Interest' : 'Maturity'
                              } | ${formatDate(sourceEvent.date)}`
                            : entry.eventId}
                        </span>
                      </div>
                      <div className="editor-source-chip-actions">
                        <strong>{formatCurrency(entry.amount)}</strong>
                        <div className="editor-source-chip-links">
                          <button
                            type="button"
                            className="mini-link"
                            onClick={() => editFundingEntry(entry.eventId)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="mini-link"
                            onClick={() => removeFundingEntry(entry.eventId)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <details className="editor-more">
              <summary>Advanced manual entry</summary>
              <label className="field full">
                <span>Funded from</span>
                <textarea
                  name="allocationsText"
                  value={formValues.allocationsText}
                  onChange={handleFormChange}
                  rows="4"
                  autoComplete="off"
                  placeholder={`maturity:fd-2=3000\ninterest:fd-5:2025-12-31=4000`}
                />
                <small className="field-help">
                  One source per line. Use `maturity:depositId=amount` or
                  `interest:depositId:yyyy-mm-dd=amount`.
                </small>
              </label>
            </details>
          </section>

          <details className="editor-section editor-more">
            <summary>Optional details</summary>
            <div className="editor-grid">
              <label className="field">
                <span>Branch city</span>
                <select
                  name="branchCity"
                  value={formValues.branchCity}
                  onChange={handleMasterBoundFieldChange}
                  disabled={!formValues.bankName}
                >
                  <option value="">
                    {formValues.bankName ? 'Choose branch' : 'Choose bank or issuer first'}
                  </option>
                  {branchOptions.map((branchName) => (
                    <option key={branchName} value={branchName}>
                      {branchName}
                    </option>
                  ))}
                  {formValues.bankName && (
                    <option value={addNewMasterValue}>Add new branch...</option>
                  )}
                </select>
                <small className="field-help">
                  Branch options are scoped to the selected bank or issuer.
                </small>
              </label>
              <label className="field">
                <span>Account or certificate no.</span>
                <input
                  name="accountNumber"
                  value={formValues.accountNumber}
                  onChange={handleFormChange}
                  placeholder="Optional"
                  autoComplete="off"
                />
                {formErrors.accountNumber && (
                  <small className="field-error">{formErrors.accountNumber}</small>
                )}
              </label>
              <label className="field">
                <span>Serial number</span>
                <input name="srNo" value={formValues.srNo} readOnly autoComplete="off" />
              </label>
              <label className="field">
                <span>Net interest after TDS</span>
                <input
                  name="totalInterestEarned"
                  type="number"
                  value={computedEditorInterestEarned}
                  readOnly
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>TDS amount</span>
                <input
                  name="tdsAmount"
                  type="number"
                  value={computedEditorTdsAmount}
                  readOnly
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>TDS %</span>
                <input
                  name="tdsPercent"
                  type="number"
                  step="0.01"
                  value={computedEditorTdsPercent}
                  readOnly
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select name="status" value={formValues.status} onChange={handleFormChange}>
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
              </label>
            </div>
          </details>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Notes</h3>
              <p>Anything useful to remember later.</p>
            </div>
            <label className="field full">
              <span>Notes</span>
              <textarea
                name="notes"
                value={formValues.notes}
                onChange={handleFormChange}
                rows="4"
                autoComplete="off"
              />
            </label>
          </section>

          <div className={isMobileEditorScreen ? 'editor-actions mobile-editor-actions' : 'editor-actions'}>
            <button type="submit" className="primary-btn">
              {editingId ? 'Update investment' : 'Save investment'}
            </button>
            <button type="button" className="secondary-btn" onClick={resetForm}>
              {editingId ? 'Reset form' : 'Clear form'}
            </button>
          </div>
        </form>
      </article>
    </section>
  )
}
