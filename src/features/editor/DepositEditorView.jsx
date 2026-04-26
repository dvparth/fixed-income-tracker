export default function DepositEditorView({
  isMobileEditorScreen,
  mobileEditorTitle,
  editingId,
  leaveEditorScreen,
  formValues,
  sourcePreviewEvents,
  formatCurrency,
  formatDate,
  formErrors,
  handleFormChange,
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
  removeFundingEntry,
  computedEditorInterestEarned,
  computedEditorTdsAmount,
  handleSave,
  resetForm,
}) {
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
        <div className={isMobileEditorScreen ? 'section-head editor-intro mobile-editor-intro' : 'section-head editor-intro'}>
          <div>
            <h2>{editingId ? 'Edit deposit' : 'Add deposit'}</h2>
            <p>
              Choose the product behavior first. Periodic interest products generate reusable
              cash-flow events that can later fund new deposits.
            </p>
            {!editingId && formValues.bankName && (
              <p className="inline-warning">
                Clone mode keeps the reusable investment setup but clears account, dates,
                maturity results, and all prior funding lineage.
              </p>
            )}
          </div>
        </div>

        <form className="editor-form" onSubmit={handleSave}>
          <div className="editor-summary">
            <div className="editor-summary-card">
              <span>New investment</span>
              <strong>{formValues.instrumentType || 'Bank FD'}</strong>
              <small>{formValues.holderName || 'Choose holder'}</small>
            </div>
            <div className="editor-summary-card">
              <span>Amount to invest</span>
              <strong>{formatCurrency(formValues.principalAmount)}</strong>
              <small>{formValues.fundingSource || 'No source selected yet'}</small>
            </div>
            {sourcePreviewEvents.length > 0 && (
              <div className="editor-summary-card">
                <span>Using source</span>
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
              <p>Start with who owns it and where it was placed.</p>
            </div>
            <div className="editor-grid">
              <label className="field">
                <span>Holder</span>
                <input name="holderName" value={formValues.holderName} onChange={handleFormChange} placeholder="Me" />
                {formErrors.holderName && <small className="field-error">{formErrors.holderName}</small>}
              </label>
              <label className="field">
                <span>Bank or issuer</span>
                <input name="bankName" value={formValues.bankName} onChange={handleFormChange} placeholder="e.g. HDFC Bank" />
                {formErrors.bankName && <small className="field-error">{formErrors.bankName}</small>}
              </label>
              <label className="field">
                <span>Funded by</span>
                <input name="fundingSource" value={formValues.fundingSource} onChange={handleFormChange} placeholder="Me, Wife, Mixed" />
              </label>
              <label className="field">
                <span>Account or certificate no.</span>
                <input name="accountNumber" value={formValues.accountNumber} onChange={handleFormChange} placeholder="e.g. ICICI-FD-8127" />
                {formErrors.accountNumber && <small className="field-error">{formErrors.accountNumber}</small>}
              </label>
            </div>
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Product</h3>
              <p>Choose the investment type and how interest is paid.</p>
            </div>
            <div className="editor-grid">
              <label className="field">
                <span>Instrument</span>
                <select name="instrumentType" value={formValues.instrumentType} onChange={handleFormChange}>
                  <option value="Bank FD">Bank FD</option>
                  <option value="SCSS">SCSS</option>
                  <option value="Bond">Bond</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="field">
                <span>When is interest paid?</span>
                <select name="payoutMode" value={formValues.payoutMode} onChange={handleFormChange}>
                  <option value="on-maturity">On maturity only</option>
                  <option value="quarterly-fy">Quarterly</option>
                  <option value="yearly-fixed">Yearly on fixed date</option>
                </select>
              </label>
              <label className="field">
                <span>Tenure</span>
                <input name="tenure" value={formValues.tenure} onChange={handleFormChange} placeholder="e.g. 1 year or 444 days" />
              </label>
              <label className="field">
                <span>Interest rate %</span>
                <input name="interestRate" type="number" step="0.01" value={formValues.interestRate} onChange={handleFormChange} placeholder="e.g. 7.3" />
              </label>
              {effectiveEditorPayoutMode === 'yearly-fixed' && (
                <label className="field">
                  <span>Interest payment date</span>
                  <input name="yearlyPayoutMonthDay" value={formValues.yearlyPayoutMonthDay} onChange={handleFormChange} placeholder="07-15" />
                  {formErrors.yearlyPayoutMonthDay && <small className="field-error">{formErrors.yearlyPayoutMonthDay}</small>}
                </label>
              )}
              {isPeriodicEditor && (
                <>
                  <label className="field">
                    <span>Interest paid before TDS</span>
                    <input name="interestPayoutBeforeTds" type="number" value={formValues.interestPayoutBeforeTds} onChange={handleFormChange} placeholder="e.g. 30750" />
                  </label>
                  <label className="field">
                    <span>Amount received each payout</span>
                    <input name="interestPayoutAfterTds" type="number" value={formValues.interestPayoutAfterTds} onChange={handleFormChange} placeholder="e.g. 27675" />
                    {formErrors.interestPayoutAfterTds && <small className="field-error">{formErrors.interestPayoutAfterTds}</small>}
                  </label>
                </>
              )}
            </div>
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Amount and dates</h3>
              <p>Capture the core investment amount and timeline.</p>
            </div>
            <div className="editor-grid">
              <label className="field">
                <span>Principal amount</span>
                <input name="principalAmount" type="number" value={formValues.principalAmount} onChange={handleFormChange} placeholder="e.g. 100000" />
                {formErrors.principalAmount && <small className="field-error">{formErrors.principalAmount}</small>}
              </label>
              <label className="field">
                <span>Investment date</span>
                <input name="investmentDate" type="date" value={formValues.investmentDate} onChange={handleFormChange} />
                {formErrors.investmentDate && <small className="field-error">{formErrors.investmentDate}</small>}
              </label>
              <label className="field">
                <span>Maturity date</span>
                <input name="maturityDate" type="date" value={formValues.maturityDate} onChange={handleFormChange} />
                {formErrors.maturityDate && <small className="field-error">{formErrors.maturityDate}</small>}
              </label>
              <label className="field">
                <span>Amount at maturity before TDS</span>
                <input name="maturityBeforeTax" type="number" value={formValues.maturityBeforeTax} onChange={handleFormChange} />
              </label>
              <label className="field">
                <span>Amount received at maturity</span>
                <input name="maturityAfterTax" type="number" value={formValues.maturityAfterTax} onChange={handleFormChange} />
              </label>
              <label className="field">
                <span>TDS %</span>
                <input name="tdsPercent" type="number" step="0.01" value={formValues.tdsPercent} onChange={handleFormChange} />
              </label>
            </div>
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <h3>Funded from</h3>
              <p>Link the maturity cash or interest used for this investment.</p>
            </div>
            <div className="editor-funding-summary">
              <div><span>Linked funding</span><strong>{formatCurrency(linkedFundingAmount)}</strong></div>
              <div><span>Deposit amount</span><strong>{formatCurrency(formValues.principalAmount)}</strong></div>
              <div>
                <span>Difference</span>
                <strong className={fundingDifference === 0 || fundingDifference === null ? 'amount-ok' : 'amount-warning'}>
                  {fundingDifference === null ? '--' : formatCurrency(fundingDifference)}
                </strong>
              </div>
            </div>
            {formErrors.allocationsText && <p className="field-error funding-error">{formErrors.allocationsText}</p>}
            <div className="funding-picker">
              <label className="field">
                <span>Source</span>
                <select value={selectedFundingEventId} onChange={handleFundingSourceSelect}>
                  <option value="">Choose maturity cash or interest receipt</option>
                  {fundingSourceOptions.map((option) => (
                    <option key={option.eventId} value={option.eventId}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Amount to use</span>
                <input type="number" value={fundingAmountDraft} onChange={(event) => setFundingAmountDraft(event.target.value)} placeholder="e.g. 5000" />
              </label>
              <div className="funding-picker-action">
                <button type="button" className="secondary-btn compact" onClick={addFundingEntry}>
                  Add source
                </button>
              </div>
            </div>

            {fundingSourceOptions.length === 0 && (
              <p className="field-help">No realized maturity cash or interest receipts are available to link right now.</p>
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
                            ? `${sourceEvent.type === 'Interest' ? 'Interest' : 'Maturity'} • ${formatDate(sourceEvent.date)}`
                            : entry.eventId}
                        </span>
                      </div>
                      <div className="editor-source-chip-actions">
                        <strong>{formatCurrency(entry.amount)}</strong>
                        <button type="button" className="mini-link" onClick={() => removeFundingEntry(entry.eventId)}>
                          Remove
                        </button>
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
                  placeholder={`maturity:fd-2=3000\ninterest:fd-5:2025-12-31=4000`}
                />
                <small className="field-help">
                  One source per line. Use `maturity:depositId=amount` or `interest:depositId:yyyy-mm-dd=amount`.
                </small>
              </label>
            </details>
          </section>

          <details className="editor-section editor-more">
            <summary>More details</summary>
            <div className="editor-grid">
              <label className="field">
                <span>Branch city</span>
                <input name="branchCity" value={formValues.branchCity} onChange={handleFormChange} />
              </label>
              <label className="field">
                <span>Sr. No</span>
                <input name="srNo" value={formValues.srNo} readOnly />
              </label>
              <label className="field">
                <span>Total interest earned</span>
                <input name="totalInterestEarned" type="number" value={computedEditorInterestEarned} readOnly />
              </label>
              <label className="field">
                <span>TDS amount</span>
                <input name="tdsAmount" type="number" value={computedEditorTdsAmount} readOnly />
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
              <textarea name="notes" value={formValues.notes} onChange={handleFormChange} rows="4" />
            </label>
          </section>

          <div className={isMobileEditorScreen ? 'editor-actions mobile-editor-actions' : 'editor-actions'}>
            <button type="submit" className="primary-btn">
              {editingId ? 'Save changes' : 'Create deposit'}
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
