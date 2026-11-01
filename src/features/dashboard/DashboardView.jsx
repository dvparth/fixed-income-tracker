import FyTaxView from '../tax/FyTaxView.jsx'

export default function DashboardView({
  dashboardPreviewLimit,
  dashboardUpcomingCashWindowDays,
  dashboardTaxHighlights,
  effectiveTaxSummary,
  effectiveTaxSummaryError,
  financialYearOptions,
  formatCurrency,
  formatDate,
  formatInterestRate,
  formatWholeNumber,
  getDateSortValue,
  handleActionCardKeyDown,
  interestDashboardItems,
  interestFocusMode,
  isEffectiveTaxSummaryLoading,
  isMobileEditorScreen,
  isReinvestmentDrilldownOpen,
  isTaxViewOpen,
  maturityDashboardItems,
  maturityFocusMode,
  normalizedSelectedDashboardOwner,
  openDepositDrilldown,
  openDepositFromInterestEvent,
  ownerDashboardCards,
  ownerInvestmentIssuerBreakdown,
  realizedInterestInvestmentGroups,
  reinvestmentDashboardItems,
  renderHelpHint,
  selectedDashboardOwner,
  selectedFinancialYear,
  setInterestFocusMode,
  setIsReinvestmentDrilldownOpen,
  setIsTaxViewOpen,
  setMaturityFocusMode,
  setSelectedDashboardOwner,
  setSelectedFinancialYear,
  setShowAllInterestItems,
  setShowAllMaturityItems,
  setShowAllReinvestmentItems,
  showAllInterestItems,
  showAllMaturityItems,
  showAllReinvestmentItems,
  showRealizedInterestDrilldown,
  showReinvestmentDrilldown,
  showUpcomingMaturityDrilldown,
  showUpcomingPayoutsDrilldown,
  stats,
  visibleInterestDashboardItems,
  visibleMaturityDashboardItems,
  visibleReinvestmentDashboardItems,
}) {
  return (
    <section className="dashboard-layout view-stage">
      <div className="stack">
        <article className="panel">
          <div className="section-head">
            <div>
              <h2>Overview</h2>
              <p>Select the financial year.</p>
              {selectedDashboardOwner ? (
                <div className="dashboard-filter-chips">
                  <span className="pill open">{selectedDashboardOwner}</span>
                  <button
                    type="button"
                    className="mini-link"
                    onClick={() => setSelectedDashboardOwner('')}
                  >
                    Clear selection
                  </button>
                </div>
              ) : null}
            </div>
            <label className="field fy-select">
              <span>Financial year</span>
              <select
                value={selectedFinancialYear}
                onChange={(event) => setSelectedFinancialYear(event.target.value)}
              >
                {financialYearOptions.map((label) => (
                  <option key={label} value={label}>
                    FY {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <section className="panel dashboard-attention" aria-labelledby="dashboard-attention-title">
          <div className="section-head">
            <div>
              <h2 id="dashboard-attention-title">Needs attention</h2>
              <p>Time-sensitive decisions and cash actions for the next {dashboardUpcomingCashWindowDays} days.</p>
            </div>
          </div>
          <div className="dashboard-attention-list">
            {stats.uninvestedMaturityCash + stats.uninvestedInterestCash > 0 ? (
              <button
                type="button"
                className="dashboard-attention-item"
                onClick={showReinvestmentDrilldown}
              >
                <span className="dashboard-attention-label">Cash ready to reinvest</span>
                <strong>{formatCurrency(stats.uninvestedMaturityCash + stats.uninvestedInterestCash)}</strong>
                <span className="dashboard-attention-detail">
                  Maturity {formatCurrency(stats.uninvestedMaturityCash)} · Interest {formatCurrency(stats.uninvestedInterestCash)}
                </span>
                <span className="dashboard-attention-action">Review available cash</span>
              </button>
            ) : null}
            {stats.maturingSoonCount > 0 ? (
              <button
                type="button"
                className="dashboard-attention-item"
                onClick={showUpcomingMaturityDrilldown}
              >
                <span className="dashboard-attention-label">Maturities coming up</span>
                <strong>{stats.maturingSoonCount} {stats.maturingSoonCount === 1 ? 'investment' : 'investments'}</strong>
                <span className="dashboard-attention-detail">
                  {formatCurrency(stats.maturingSoonAmount)} principal maturing soon
                </span>
                <span className="dashboard-attention-action">Review maturity timeline</span>
              </button>
            ) : null}
            {stats.upcomingInterestEventsNextWindow.length > 0 ? (
              <button
                type="button"
                className="dashboard-attention-item"
                onClick={showUpcomingPayoutsDrilldown}
              >
                <span className="dashboard-attention-label">Interest payouts expected</span>
                <strong>
                  {formatCurrency(
                    stats.upcomingInterestEventsNextWindow.reduce(
                      (sum, event) => sum + Number(event.amount || 0),
                      0,
                    ),
                  )}
                </strong>
                <span className="dashboard-attention-detail">
                  {stats.upcomingInterestEventsNextWindow.length} payout{stats.upcomingInterestEventsNextWindow.length === 1 ? '' : 's'} in the next {dashboardUpcomingCashWindowDays} days
                </span>
                <span className="dashboard-attention-action">Review upcoming payouts</span>
              </button>
            ) : null}
            {stats.uninvestedMaturityCash + stats.uninvestedInterestCash <= 0 &&
            stats.maturingSoonCount === 0 &&
            stats.upcomingInterestEventsNextWindow.length === 0 ? (
              <div className="dashboard-attention-clear" role="status">
                <strong>You’re all caught up</strong>
                <span>No reinvestment, maturity, or payout actions are due in this window.</span>
              </div>
            ) : null}
          </div>
        </section>

        <div className="stats-grid">
          <article className="stat-card accent">
            <span className="stat-label-row">
              <span>Current investments</span>
              {renderHelpHint('active-principal', 'This is the total amount currently invested in open deposits.')}
            </span>
            <strong>{formatCurrency(stats.openPrincipal)}</strong>
            <small>{stats.openDeposits} active</small>
          </article>
          <article
            className="stat-card stat-card-action stat-card-wider fy-interest-card clickable-surface"
            role="button"
            tabIndex={0}
            onClick={showRealizedInterestDrilldown}
            onKeyDown={(event) => handleActionCardKeyDown(event, showRealizedInterestDrilldown)}
          >
            <span className="stat-label-row">
              <span>Interest earned to date this FY</span>
              {renderHelpHint('interest-realised', 'Actual gross interest earned to date in the selected FY, before TDS.')}
            </span>
            <div className="stat-metric-grid">
              <div className="stat-metric-primary">
                <span>Gross</span>
                <strong>{formatCurrency(stats.realisedInterest)}</strong>
              </div>
              <div>
                <span>TDS deducted</span>
                <strong>{formatCurrency(stats.realisedInterestTds)}</strong>
              </div>
              <div>
                <span>Net</span>
                <strong>{formatCurrency(stats.realisedNetInterest)}</strong>
              </div>
            </div>
            <small>FY {stats.currentFinancialYearLabel} | View receipts</small>
          </article>
          <article
            className="stat-card stat-card-action warning clickable-surface"
            role="button"
            tabIndex={0}
            onClick={showReinvestmentDrilldown}
            onKeyDown={(event) => handleActionCardKeyDown(event, showReinvestmentDrilldown)}
          >
            <span className="stat-label-row">
              <span>Cash to reinvest</span>
              {renderHelpHint(
                'cash-to-reinvest',
                'Maturity cash and interest cash already received but not yet fully used in new investments.',
              )}
            </span>
            <strong>{formatCurrency(stats.uninvestedMaturityCash + stats.uninvestedInterestCash)}</strong>
            <small>
              Maturity {formatCurrency(stats.uninvestedMaturityCash)} | Interest {formatCurrency(stats.uninvestedInterestCash)}
            </small>
          </article>
        </div>

        <article className="panel owner-investment-breakdown">
          <div className="section-head">
            <div>
              <h2>Investment value by bank / issuer</h2>
              <p>
                {selectedDashboardOwner
                  ? `Active principal for ${selectedDashboardOwner}.`
                  : 'Active principal across all owners.'}
              </p>
            </div>
          </div>
          {ownerInvestmentIssuerBreakdown.length > 0 ? (
            <ul className="owner-investment-breakdown-list">
              {ownerInvestmentIssuerBreakdown.map((issuer) => (
                <li className="owner-investment-breakdown-row" key={issuer.issuerName}>
                  <div className="owner-investment-breakdown-copy">
                    <strong>{issuer.issuerName}</strong>
                    <span>
                      {issuer.investmentCount} active investment{issuer.investmentCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <strong className="owner-investment-breakdown-value">
                    {formatCurrency(issuer.principalAmount)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lineage-empty">
              {selectedDashboardOwner
                ? `No active investments to show for ${selectedDashboardOwner}.`
                : 'No active investments to show.'}
            </p>
          )}
        </article>

        {!isTaxViewOpen ? (
        <article className="panel tax-inline-summary-card">
          <div className="tax-inline-summary-copy">
            <span className="eyebrow">FY {selectedFinancialYear}</span>
            <strong>{formatCurrency(dashboardTaxHighlights.totalTaxableInterest)}</strong>
            <p>
              {`Cash in next ${dashboardUpcomingCashWindowDays} days ${formatCurrency(stats.upcomingCashNext30Days)}`}
              {' | '}
              {`Maturing soon ${stats.maturingSoonCount} ${stats.maturingSoonCount === 1 ? 'deposit' : 'deposits'}`}
            </p>
          </div>
          <button
            type="button"
            className="secondary-btn compact dashboard-action-btn"
            onClick={() => setIsTaxViewOpen(true)}
          >
            View tax details
          </button>
        </article>
        ) : null}

        <FyTaxView
          summary={effectiveTaxSummary}
          selectedFinancialYear={selectedFinancialYear}
          isLoading={isEffectiveTaxSummaryLoading}
          error={effectiveTaxSummaryError}
          formatCurrency={formatCurrency}
          isOpen={isTaxViewOpen}
          onClose={() => setIsTaxViewOpen(false)}
          selectedOwnerName={selectedDashboardOwner}
          onSelectOwner={setSelectedDashboardOwner}
          onOpenInvestmentDetail={(investment) =>
            openDepositDrilldown(
              investment.investmentId,
              investment.accountNumber || investment.investmentId,
            )
          }
        />

        {isReinvestmentDrilldownOpen ? (
          <article id="dashboard-reinvestment-section" className="panel">
            <div className="section-head">
              <div>
                <div className="section-title-row">
                  <h2>Cash to reinvest</h2>
                  {renderHelpHint(
                    'cash-to-reinvest-section',
                    'Maturity cash and interest cash already received but not yet fully used in new investments.',
                  )}
                </div>
                <p>Available maturity and interest cash, shown together in date order.</p>
              </div>
              <div className="section-head-actions">
                {reinvestmentDashboardItems.length > dashboardPreviewLimit ? (
                  <button
                    type="button"
                    className="secondary-btn compact ghost-btn dashboard-toggle-btn"
                    onClick={() => setShowAllReinvestmentItems((current) => !current)}
                  >
                    {showAllReinvestmentItems ? 'Show fewer' : 'View all cash'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary-btn compact ghost-btn dashboard-toggle-btn"
                  onClick={() => {
                    setIsReinvestmentDrilldownOpen(false)
                    setMaturityFocusMode('all')
                    setInterestFocusMode('all')
                  }}
                >
                  Back to timelines
                </button>
              </div>
            </div>
            <div className="list timeline-preview-list">
              {visibleReinvestmentDashboardItems.length > 0 ? (
                visibleReinvestmentDashboardItems.map((event) => (
                  <button
                    key={event.eventId}
                    type="button"
                    className="deposit-card clickable-surface"
                    onClick={() =>
                      openDepositDrilldown(
                        event.depositId,
                        event.accountNumber || event.depositId,
                      )
                    }
                  >
                    <div className="deposit-topline">
                      <strong>{event.bankName}</strong>
                      <span className={event.reinvestmentType === 'Maturity cash' ? 'pill closed' : 'pill open'}>
                        {event.reinvestmentType}
                      </span>
                    </div>
                    <p>{event.holderName} | {event.accountNumber || 'No account number'}</p>
                    <p>{event.instrumentType || event.sourceLabel || 'Interest'}</p>
                    <p>
                      Received {formatDate(event.date)} | Available to reinvest {formatCurrency(event.availableAmount)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="empty-state-card">
                  <div className="empty-state-icon" aria-hidden="true">○</div>
                  <p className="lineage-empty">No received maturity or interest cash is available to reinvest.</p>
                </div>
              )}
            </div>
          </article>
        ) : (
          <>
        <article id="dashboard-maturity-section" className="panel">
          <div className="section-head">
            <div>
              <div className="section-title-row">
                <h2>
                  {maturityFocusMode === 'pending' ? 'Maturity to reinvest' : 'Maturity timeline'}
                </h2>
                {renderHelpHint(
                  'maturity-section',
                  maturityFocusMode === 'pending'
                    ? 'These are deposits whose maturity money has come in but is still not fully used.'
                    : 'These are the next deposits that will mature soon.',
                )}
              </div>
              <p>
                {maturityFocusMode === 'pending'
                  ? 'Closed deposits whose maturity cash is still waiting to be reused.'
                  : 'Next maturities and reinvestment opportunities.'}
              </p>
            </div>
            <div className="section-head-actions">
            {maturityDashboardItems.length > dashboardPreviewLimit ? (
                <button
                  type="button"
                  className="secondary-btn compact ghost-btn dashboard-toggle-btn"
                  onClick={() => setShowAllMaturityItems((current) => !current)}
                >
                  {showAllMaturityItems ? 'Show fewer' : 'View all maturities'}
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-btn compact dashboard-action-btn dashboard-toggle-btn"
                onClick={showReinvestmentDrilldown}
              >
                View cash to reinvest
              </button>
            </div>
          </div>
          <div className="list timeline-preview-list">
            {visibleMaturityDashboardItems.map((deposit) => (
              <button
                key={maturityFocusMode === 'pending' ? deposit.eventId : deposit.id}
                  type="button"
                  className="deposit-card clickable-surface"
                  onClick={() =>
                    openDepositDrilldown(
                      maturityFocusMode === 'pending' ? deposit.depositId : deposit.id,
                      deposit.accountNumber || (maturityFocusMode === 'pending' ? deposit.depositId : deposit.id),
                    )
                  }
                >
                <div className="deposit-topline">
                  <strong>{deposit.bankName}</strong>
                  <span className={deposit.status === 'Closed' ? 'pill closed' : 'pill open'}>
                    {deposit.status === 'Open' ? 'Active' : deposit.status || deposit.type}
                  </span>
                </div>
                <p>
                  {deposit.holderName} | {deposit.accountNumber || 'No account number'}
                </p>
                <p>
                  {deposit.instrumentType || 'Maturity'}
                </p>
                <p>
                  {maturityFocusMode === 'pending'
                    ? `Maturity date ${formatDate(deposit.date)} | Still to reinvest ${formatCurrency(deposit.unallocatedAmount)}`
                    : `Maturity date ${formatDate(deposit.maturityDate)}`}
                </p>
              </button>
            ))}
            {!showAllMaturityItems && maturityDashboardItems.length > visibleMaturityDashboardItems.length ? (
              <p className="timeline-preview-more">
                View all maturities
              </p>
            ) : null}
          </div>
        </article>

        <article id="dashboard-interest-section" className="panel">
          <div className="section-head">
            <div>
              <div className="section-title-row">
                <h2>
                  {interestFocusMode === 'upcoming'
                    ? `Payouts in the next ${dashboardUpcomingCashWindowDays} days`
                    : interestFocusMode === 'realizing'
                    ? 'Interest earned to date this FY'
                    : interestFocusMode === 'pending'
                      ? 'Interest to reinvest'
                      : 'Interest timeline'}
                </h2>
                {renderHelpHint(
                  'interest-section',
                  interestFocusMode === 'upcoming'
                    ? 'Periodic interest payouts expected soon.'
                    : interestFocusMode === 'realizing'
                    ? 'Actual gross interest earned to date in the selected FY, before TDS.'
                    : interestFocusMode === 'pending'
                    ? 'These are interest amounts already received but not yet fully used in new deposits.'
                    : 'These are future interest payouts expected from deposits that pay before maturity.',
                )}
              </div>
              <p>
                {interestFocusMode === 'upcoming'
                  ? `Upcoming interest payouts expected in the next ${dashboardUpcomingCashWindowDays} days.`
                  : interestFocusMode === 'realizing'
                  ? 'Maturity interest and periodic payouts earned so far in the selected FY, shown before TDS.'
                  : interestFocusMode === 'pending'
                  ? 'Interest cash already received and available to reinvest.'
                  : 'Upcoming interest payouts that may be reused.'}
              </p>
            </div>
            <div className="section-head-actions">
            {interestFocusMode !== 'realizing' && interestDashboardItems.length > dashboardPreviewLimit ? (
                <button
                  type="button"
                  className="secondary-btn compact ghost-btn dashboard-toggle-btn"
                  onClick={() => setShowAllInterestItems((current) => !current)}
                >
                  {showAllInterestItems
                    ? 'Show fewer'
                    : interestFocusMode === 'realizing'
                    ? 'View all receipts'
                      : 'View all payouts'}
                </button>
              ) : null}
              <button
                type="button"
                className={interestFocusMode !== 'all' ? 'secondary-btn compact ghost-btn dashboard-toggle-btn' : 'secondary-btn compact dashboard-action-btn dashboard-toggle-btn'}
                onClick={() => {
                  if (interestFocusMode !== 'all') {
                    setShowAllInterestItems(false)
                    setInterestFocusMode('all')
                    return
                  }
                  showReinvestmentDrilldown()
                }}
              >
                {interestFocusMode !== 'all' ? 'Back to timeline' : 'View cash to reinvest'}
              </button>
            </div>
          </div>
          {interestFocusMode === 'realizing' ? (
            realizedInterestInvestmentGroups.length > 0 ? (
              <div className="interest-contribution-groups">
                {realizedInterestInvestmentGroups.map((group) => (
                  <section key={group.ownerName} className="interest-contribution-group">
                    <div className="interest-contribution-group-head">
                      <h3>{group.ownerName}</h3>
                      <span>
                        {group.investments.length} contributing investment{group.investments.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="interest-contribution-table-wrap">
                      <table className="interest-contribution-table">
                        <thead>
                          <tr>
                            <th>Bank</th>
                            <th>Account</th>
                            <th>Instrument</th>
                            <th>Investment date</th>
                            <th>Maturity date</th>
                            <th>Principal</th>
                            <th>Rate</th>
                            <th>Status</th>
                            <th>Receipts</th>
                            <th>Receipt dates</th>
                            <th className="interest-contribution-amount">Gross interest</th>
                            <th className="interest-contribution-amount">TDS</th>
                            <th className="interest-contribution-amount">Net interest</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.investments.map((contribution) => {
                            const { deposit } = contribution
                            const receiptSummary = [
                              contribution.maturityReceiptCount > 0
                                ? `${contribution.maturityReceiptCount} maturity`
                                : '',
                              contribution.periodicReceiptCount > 0
                                ? `${contribution.periodicReceiptCount} periodic`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' + ')
                            const receiptDates = [...contribution.receiptEvents]
                              .sort((left, right) => getDateSortValue(left.date) - getDateSortValue(right.date))
                              .map((receipt) => formatDate(receipt.date))

                            return (
                              <tr key={deposit.id}>
                                <td>{deposit.bankName || '—'}</td>
                                <td>
                                  {deposit.accountNumber ? (
                                    <button
                                      type="button"
                                      className="interest-contribution-account-link"
                                      onClick={() =>
                                        openDepositDrilldown(
                                          deposit.id,
                                          deposit.accountNumber || deposit.id,
                                        )
                                      }
                                    >
                                      {deposit.accountNumber}
                                    </button>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td>
                                  {String(deposit.instrumentType || '').trim().toLowerCase() === 'term deposit'
                                    ? 'FD'
                                    : deposit.instrumentType || '—'}
                                </td>
                                <td>{formatDate(deposit.investmentDate)}</td>
                                <td>{formatDate(deposit.maturityDate)}</td>
                                <td>{formatCurrency(deposit.principalAmount)}</td>
                                <td>{formatInterestRate(deposit.interestRate)}</td>
                                <td>{deposit.status || '—'}</td>
                                <td>{receiptSummary || '—'}</td>
                                <td>
                                  <div className="interest-contribution-receipts">
                                    {receiptDates.map((receiptDate, index) => (
                                      <span key={`${receiptDate}-${index}`}>{receiptDate}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="interest-contribution-amount">
                                  {formatWholeNumber(contribution.grossInterest)}
                                </td>
                                <td className="interest-contribution-amount">
                                  {formatWholeNumber(contribution.tdsAmount)}
                                </td>
                                <td className="interest-contribution-amount">
                                  {formatWholeNumber(contribution.netInterest)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="lineage-empty">No gross interest receipts are scheduled in this financial year.</p>
            )
          ) : (
          <div className="list timeline-preview-list">
            {interestDashboardItems.length > 0 ? (
              visibleInterestDashboardItems.map((event) => (
                <button
                  key={event.eventId || event.depositId}
                  type="button"
                  className="deposit-card clickable-surface"
                  onClick={() => openDepositFromInterestEvent(event)}
                >
                  <div className="deposit-topline">
                    <strong>{event.bankName}</strong>
                    <span className="pill open">
                      {interestFocusMode === 'upcoming'
                        ? 'Upcoming interest'
                        : interestFocusMode === 'pending'
                          ? 'Pending interest'
                          : event.type}
                    </span>
                  </div>
                  <p>
                    {event.holderName} | {event.accountNumber || 'No account number'}
                  </p>
                  <p>
                    {interestFocusMode === 'realizing'
                      ? `Gross interest ${formatCurrency(event.amount)}`
                      : formatCurrency(
                          interestFocusMode === 'pending' ? event.pendingAmount : event.futureAmount,
                        )}
                  </p>
                  <p>
                    {interestFocusMode === 'realizing'
                      ? `${event.instrumentType || event.sourceLabel || 'Interest'} | ${event.type === 'Maturity interest' ? 'Maturity' : 'Receipt'} ${formatDate(event.date)}`
                      : interestFocusMode === 'pending'
                      ? `${event.receiptCount} received interest payout${event.receiptCount === 1 ? '' : 's'} available`
                      : `${event.receiptCount} upcoming payout${event.receiptCount === 1 ? '' : 's'} | ${formatDate(event.nextPaymentDate)}`}
                  </p>
                  {interestFocusMode === 'pending' && (
                    <p className="inline-warning">
                      Total pending for this investment {formatCurrency(event.pendingAmount)}
                    </p>
                  )}
                </button>
              ))
            ) : (
              interestFocusMode === 'pending' ? (
                <div className="empty-state-card">
                  <div className="empty-state-icon" aria-hidden="true">○</div>
                  <p className="lineage-empty">No received interest cash is available to reinvest.</p>
                </div>
              ) : (
                <p className="lineage-empty">
                  {interestFocusMode === 'upcoming'
                    ? `No interest payouts expected in the next ${dashboardUpcomingCashWindowDays} days.`
                    : 'No upcoming periodic interest payouts in the schedule.'}
                </p>
              )
            )}
            {!showAllInterestItems && interestDashboardItems.length > visibleInterestDashboardItems.length ? (
              <p className="timeline-preview-more">
                {`View ${interestDashboardItems.length - visibleInterestDashboardItems.length} more payout${interestDashboardItems.length - visibleInterestDashboardItems.length === 1 ? '' : 's'}`}
              </p>
            ) : null}
          </div>
          )}
        </article>
          </>
        )}
      </div>

      <aside className="stack">
        <div className={isMobileEditorScreen ? 'section-head editor-intro mobile-editor-intro' : 'section-head editor-intro'}>
          <div>
            <h2>Owners</h2>
            <p>Active principal by holder.</p>
          </div>
        </div>
        <div className="owner-grid">
          {ownerDashboardCards.map((owner) => {
            const isOwnerSelected =
              String(owner.holderName || '').trim().toLowerCase() === normalizedSelectedDashboardOwner

            return (
            <button
              key={owner.holderName}
              type="button"
              className={isOwnerSelected ? 'owner-card clickable-surface selected' : 'owner-card clickable-surface'}
              onClick={() =>
                setSelectedDashboardOwner((current) =>
                  String(current || '').trim().toLowerCase() === String(owner.holderName || '').trim().toLowerCase()
                    ? ''
                    : owner.holderName,
                )
              }
            >
              <div className="owner-card-head">
                <strong>{owner.holderName}</strong>
                {isOwnerSelected ? (
                  <div className="owner-card-filter-state">
                    <span className="pill open">Active filter</span>
                    <span className="owner-card-filter-copy">
                      {formatCurrency(owner.fyContribution)}
                      {owner.fyContributionShare > 0
                        ? ` • ${owner.fyContributionShare >= 10 ? owner.fyContributionShare.toFixed(0) : owner.fyContributionShare.toFixed(1)}% of FY total`
                        : ''}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="owner-card-value">{formatCurrency(owner.principalAmount)}</div>
              <p className="owner-card-subtitle">
                <span className="owner-card-icon-label" aria-hidden="true">💰</span>
                <span>Principal</span>
              </p>
              <div className="owner-card-bar-block">
                <div className="owner-card-bar-head">
                  <span>FY contribution</span>
                  <strong>
                    {owner.fyContributionShare > 0
                      ? `${owner.fyContributionShare >= 10 ? owner.fyContributionShare.toFixed(0) : owner.fyContributionShare.toFixed(1)}%`
                      : '0%'}
                  </strong>
                </div>
                <div className="owner-card-bar-track" aria-hidden="true">
                  <span
                    className="owner-card-bar-fill"
                    style={{ width: `${Math.max(owner.fyContributionShare, owner.fyContributionShare > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
              <div className="owner-card-details">
                <p>
                  <strong>
                    <span className="owner-card-icon-label" aria-hidden="true">◌</span>
                    <span>Active</span>
                  </strong>
                  <span>{owner.openDeposits} investments</span>
                </p>
                <p>
                  <strong>
                    <span className="owner-card-icon-label" aria-hidden="true">📅</span>
                    <span>Maturity</span>
                  </strong>
                  <span>{formatDate(owner.nextMaturityDate)}</span>
                </p>
                <p>
                  <strong>
                    <span className="owner-card-icon-label" aria-hidden="true">FY</span>
                  <span>Share of taxable interest</span>
                  </strong>
                  <span>
                    {formatCurrency(owner.fyContribution)}
                    {owner.fyContributionShare > 0
                      ? ` • ${owner.fyContributionShare >= 10 ? owner.fyContributionShare.toFixed(0) : owner.fyContributionShare.toFixed(1)}%`
                      : ''}
                  </span>
                </p>
              </div>
              <div className="owner-card-insight">
                <strong>Largest investment group</strong>
                <span>{owner.largestSourceLabel || 'Largest investment group not available yet'}</span>
              </div>
              {isOwnerSelected ? (
                <span
                  role="button"
                  tabIndex={-1}
                  className="owner-card-reset"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedDashboardOwner('')
                  }}
                >
                  Reset filter
                </span>
              ) : null}
            </button>
          )})}
        </div>
      </aside>
    </section>
  )
}
