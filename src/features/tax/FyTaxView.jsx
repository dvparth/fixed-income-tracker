import { useMemo, useState } from 'react'
import { formatInterestRate } from '../deposits/depositModel.js'

const getCalculationFrequencyFromAppliedRule = (appliedRule) => {
  const normalizedRule = String(appliedRule || '').trim().toUpperCase()

  if (normalizedRule.includes('_MONTHLY_')) {
    return 'MONTHLY'
  }

  if (normalizedRule.includes('_QUARTERLY_')) {
    return 'QUARTERLY'
  }

  if (normalizedRule.includes('_YEARLY_')) {
    return 'YEARLY'
  }

  if (normalizedRule.includes('_SIMPLE_')) {
    return 'SIMPLE'
  }

  return ''
}

const formatPayoutFrequencyLabel = (value) => {
  switch (String(value || '').trim().toUpperCase()) {
    case 'CUMULATIVE':
      return 'At maturity'
    case 'QUARTERLY':
      return 'Quarterly'
    case 'YEARLY':
      return 'Yearly'
    default:
      return 'At maturity'
  }
}

const getPayoutFrequencyFromAppliedRule = (appliedRule) => {
  const normalizedRule = String(appliedRule || '').trim().toUpperCase()

  if (normalizedRule.endsWith('_CUMULATIVE')) {
    return 'CUMULATIVE'
  }

  if (normalizedRule.includes('_PERIODIC_PAYOUT')) {
    if (normalizedRule.includes('_QUARTERLY_')) {
      return 'QUARTERLY'
    }

    if (normalizedRule.includes('_YEARLY_')) {
      return 'YEARLY'
    }
  }

  if (normalizedRule.includes('_YEARLY_PAYOUT')) {
    return 'YEARLY'
  }

  if (normalizedRule.includes('_QUARTERLY_PAYOUT')) {
    return 'QUARTERLY'
  }

  return ''
}

const buildInstitutionSummaries = (investmentBreakdown = []) => {
  const institutionMap = new Map()

  investmentBreakdown.forEach((investment) => {
    const key = String(investment.institutionName || 'Institution not set').trim() || 'Institution not set'
    const current = institutionMap.get(key) || {
      institutionName: key,
      investmentCount: 0,
      totalEstimatedInterestPaid: 0,
      totalEstimatedInterestAccrued: 0,
      totalEstimatedTaxableInterest: 0,
      totalEstimatedTds: 0,
      totalEstimatedAdditionalTaxLiability: 0,
      investmentBreakdown: [],
    }

    current.investmentCount += 1
    current.totalEstimatedInterestPaid += investment.estimatedInterestPaid
    current.totalEstimatedInterestAccrued += investment.estimatedInterestAccrued
    current.totalEstimatedTaxableInterest += investment.estimatedTaxableInterest
    current.totalEstimatedTds += investment.estimatedTds
    current.totalEstimatedAdditionalTaxLiability += investment.estimatedAdditionalTaxLiability
    current.investmentBreakdown.push(investment)
    institutionMap.set(key, current)
  })

  return Array.from(institutionMap.values()).sort(
    (left, right) => right.totalEstimatedTaxableInterest - left.totalEstimatedTaxableInterest,
  )
}

const buildInvestmentGroups = (investmentBreakdown = []) => {
  const groupMap = new Map()

  investmentBreakdown.forEach((investment) => {
    const calculationFrequency =
      investment.calculationFrequency || getCalculationFrequencyFromAppliedRule(investment.appliedRule)
    const payoutFrequency =
      investment.payoutFrequency || getPayoutFrequencyFromAppliedRule(investment.appliedRule)
    const principal = Number(investment.principal || 0)
    const interestRate = Number(investment.interestRate || 0)
    const key = [
      String(investment.investmentType || 'Investment').trim(),
      principal,
      interestRate,
      String(calculationFrequency || '').trim().toUpperCase(),
      String(payoutFrequency || '').trim().toUpperCase(),
      String(investment.status || '').trim().toUpperCase(),
    ].join('::')

    const current = groupMap.get(key) || {
      groupKey: key,
      investmentType: String(investment.investmentType || 'Investment').trim() || 'Investment',
      principal,
      interestRate,
      calculationFrequency,
      payoutFrequency,
      status: String(investment.status || '').trim() || 'Open',
      investmentCount: 0,
      totalEstimatedTaxableInterest: 0,
      totalEstimatedTds: 0,
      totalEstimatedAdditionalTaxLiability: 0,
      items: [],
    }

    current.investmentCount += 1
    current.totalEstimatedTaxableInterest += investment.estimatedTaxableInterest
    current.totalEstimatedTds += investment.estimatedTds
    current.totalEstimatedAdditionalTaxLiability += investment.estimatedAdditionalTaxLiability
    current.items.push(investment)
    groupMap.set(key, current)
  })

  return Array.from(groupMap.values()).sort(
    (left, right) => right.totalEstimatedTaxableInterest - left.totalEstimatedTaxableInterest,
  )
}

const formatContributionPercent = (amount, total) => {
  if (!total || total <= 0) {
    return '0%'
  }

  const percent = (amount / total) * 100
  return `${percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)}%`
}

const formatCompactCurrencyLabel = (value) => {
  const amount = Number(value || 0)

  if (!amount) {
    return 'Rs 0'
  }

  return `Rs ${new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: amount >= 100000 ? 1 : 0,
  }).format(amount)}`
}

const buildTopContributors = (ownerSummariesWithInstitutions = []) => {
  const contributors = []

  ownerSummariesWithInstitutions.forEach((ownerSummary) => {
    ownerSummary.institutionSummary.forEach((institution) => {
      institution.groupedInvestments.forEach((group) => {
        contributors.push({
          id: `${ownerSummary.ownerId}::${institution.institutionName}::${group.groupKey}`,
          ownerId: ownerSummary.ownerId,
          ownerName: ownerSummary.ownerName,
          institutionName: institution.institutionName,
          groupKey: group.groupKey,
          label: `${formatCompactCurrencyLabel(group.principal)} ${group.investmentType}${group.investmentCount > 1 ? ` (${group.investmentCount})` : ''}`,
          subtitle: `${formatInterestRate(group.interestRate)} • ${formatPayoutFrequencyLabel(group.payoutFrequency)} • ${institution.institutionName}`,
          totalEstimatedTaxableInterest: group.totalEstimatedTaxableInterest,
        })
      })
    })
  })

  return contributors.sort((left, right) => right.totalEstimatedTaxableInterest - left.totalEstimatedTaxableInterest)
}

const toDomId = (value) => String(value || '').replace(/[^a-z0-9_-]+/gi, '-')

export default function FyTaxView({
  summary,
  selectedFinancialYear,
  isLoading,
  error,
  formatCurrency,
  isOpen,
  onClose,
  onOpenInvestmentDetail,
  selectedOwnerName,
  onSelectOwner,
}) {
  const [expandedOwnerKeys, setExpandedOwnerKeys] = useState({})
  const [expandedInstitutionKeys, setExpandedInstitutionKeys] = useState({})
  const [expandedGroupKeys, setExpandedGroupKeys] = useState({})

  const consolidated = summary?.consolidatedPortfolioSummary || null

  const ownerSummariesWithInstitutions = useMemo(
    () =>
      (summary?.ownerWiseSummary || []).map((ownerSummary) => ({
        ...ownerSummary,
        institutionSummary: buildInstitutionSummaries(ownerSummary.investmentBreakdown || []).map((institution) => ({
          ...institution,
          groupedInvestments: buildInvestmentGroups(institution.investmentBreakdown || []),
        })),
      })),
    [summary],
  )

  const normalizedSelectedOwnerName = String(selectedOwnerName || '').trim().toLowerCase()

  const visibleOwnerSummaries = useMemo(
    () =>
      normalizedSelectedOwnerName
        ? ownerSummariesWithInstitutions.filter(
            (ownerSummary) =>
              String(ownerSummary.ownerName || '').trim().toLowerCase() === normalizedSelectedOwnerName,
          )
        : ownerSummariesWithInstitutions,
    [normalizedSelectedOwnerName, ownerSummariesWithInstitutions],
  )

  const visibleTotalTaxableInterest = useMemo(
    () =>
      visibleOwnerSummaries.reduce(
        (total, ownerSummary) => total + Number(ownerSummary.totalEstimatedTaxableInterest || 0),
        0,
      ),
    [visibleOwnerSummaries],
  )

  const visibleInvestmentCount = useMemo(
    () =>
      visibleOwnerSummaries.reduce(
        (total, ownerSummary) => total + Number(ownerSummary.investmentCount || 0),
        0,
      ),
    [visibleOwnerSummaries],
  )

  const topContributors = useMemo(
    () => buildTopContributors(visibleOwnerSummaries),
    [visibleOwnerSummaries],
  )
  const selectedContributorId = ''
  const showAllContributors = false
  const setShowAllContributors = () => {}

  const toggleOwner = (ownerId) => {
    setExpandedOwnerKeys((current) => ({
      ...current,
      [ownerId]: !current[ownerId],
    }))
  }

  const toggleInstitution = (ownerId, institutionName) => {
    const key = `${ownerId}::${institutionName}`
    setExpandedInstitutionKeys((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const toggleGroup = (ownerId, institutionName, groupKey) => {
    const key = `${ownerId}::${institutionName}::${groupKey}`
    setExpandedGroupKeys((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const handleOwnerToggle = (ownerSummary) => {
    const normalizedOwner = String(ownerSummary.ownerName || '').trim().toLowerCase()
    const isSelected = normalizedOwner === normalizedSelectedOwnerName

    onSelectOwner?.(isSelected ? '' : ownerSummary.ownerName)
    toggleOwner(ownerSummary.ownerId)
  }

  const focusContributor = () => {}

  const handleInvestmentCardKeyDown = (event, investment) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    onOpenInvestmentDetail?.(investment)
  }

  if (!isOpen) {
    return null
  }

  if (isLoading) {
    return (
      <article className="panel tax-panel">
        <div className="section-head">
          <div>
            <h2>FY taxable interest</h2>
            <p>Loading owner-wise taxable interest estimates for FY {selectedFinancialYear}.</p>
          </div>
          <button type="button" className="secondary-btn compact ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="empty-state-card">
          <div className="empty-state-icon" aria-hidden="true">◌</div>
          <p className="lineage-empty">Preparing the FY tax view.</p>
        </div>
      </article>
    )
  }

  if (error) {
    return (
      <article className="panel tax-panel">
        <div className="section-head">
          <div>
            <h2>FY taxable interest</h2>
            <p>Tax-planning estimate for FY {selectedFinancialYear}.</p>
          </div>
          <button type="button" className="secondary-btn compact ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="status-banner error">{error}</div>
      </article>
    )
  }

  const totalTaxableInterest = visibleTotalTaxableInterest || consolidated?.totalEstimatedTaxableInterest || 0

  return (
    <article className="panel tax-panel tax-panel-redesigned">
      <div className="section-head">
        <div>
          <h2>FY taxable interest</h2>
          <p>
            Estimated taxable interest for FY {selectedFinancialYear}.
          </p>
        </div>
        <button type="button" className="secondary-btn compact ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {consolidated ? (
        <section className="tax-summary-hero">
          <div className="tax-summary-hero-main">
            <span className="eyebrow">FY {selectedFinancialYear}</span>
            <p className="tax-summary-kicker">Total taxable interest</p>
            <strong className="tax-summary-dominant">{formatCurrency(totalTaxableInterest)}</strong>
            <small>
              {visibleInvestmentCount} investments across {visibleOwnerSummaries.length} owner{visibleOwnerSummaries.length === 1 ? '' : 's'}
            </small>
            {selectedOwnerName ? (
              <div className="dashboard-filter-chips tax-filter-chip-row">
                <span className="pill open">{selectedOwnerName}</span>
                <button type="button" className="mini-link" onClick={() => onSelectOwner?.('')}>
                  Clear selection
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {visibleOwnerSummaries.length > 0 ? (
        <div className="tax-layout-stack">
          <section className="tax-contribution-panel">
            <div className="section-head section-head-split">
              <div>
                <h3>Top contributors</h3>
                <p>Largest contributing investment groups this year.</p>
              </div>
            </div>
            <div className="tax-contribution-list">
              {(showAllContributors ? topContributors : topContributors.slice(0, 3)).map((contributor) => {
                const contributionPercent = totalTaxableInterest > 0
                  ? (contributor.totalEstimatedTaxableInterest / totalTaxableInterest) * 100
                  : 0

                return (
                  <button
                    key={contributor.id}
                    type="button"
                    className={selectedContributorId === contributor.id ? 'tax-contribution-row selected' : 'tax-contribution-row'}
                    onClick={() => focusContributor(contributor)}
                  >
                    <div className="tax-contribution-copy">
                      <strong>{contributor.label}</strong>
                      <span>{contributor.ownerName} • {contributor.subtitle}</span>
                    </div>
                    <div className="tax-contribution-bar-track" aria-hidden="true">
                      <span
                        className="tax-contribution-bar-fill"
                        style={{ width: `${Math.max(contributionPercent, contributionPercent > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <strong className="tax-contribution-value">
                      {formatCurrency(contributor.totalEstimatedTaxableInterest)}
                    </strong>
                  </button>
                )
              })}
            </div>
            {topContributors.length > 3 ? (
              <button
                type="button"
                className="mini-link tax-show-more"
                onClick={() => setShowAllContributors((current) => !current)}
              >
                {showAllContributors ? 'Show fewer' : `View full list (${topContributors.length})`}
              </button>
            ) : null}
          </section>

          {!selectedOwnerName ? (
          <section className="tax-owner-table-panel">
            <div className="section-head section-head-split">
              <div>
                <h3>Owner breakdown</h3>
                <p>Click an owner row to filter the entire dashboard and reveal grouped investment details below it.</p>
              </div>
            </div>
            <div className="tax-owner-table-head">
              <span>Owner</span>
              <span>Investments</span>
              <span>Taxable interest</span>
              <span>Share of taxable interest</span>
            </div>
            <div className="tax-owner-stack">
          {visibleOwnerSummaries.map((ownerSummary) => {
            const isSelected =
              String(ownerSummary.ownerName || '').trim().toLowerCase() === normalizedSelectedOwnerName
            const contributionPercent = totalTaxableInterest > 0
              ? (ownerSummary.totalEstimatedTaxableInterest / totalTaxableInterest) * 100
              : 0

            return (
            <section key={ownerSummary.ownerId} className="tax-owner-card tax-owner-card-condensed">
              <button
                type="button"
                className={isSelected ? 'tax-owner-summary-row selected' : 'tax-owner-summary-row'}
                onClick={() => handleOwnerToggle(ownerSummary)}
              >
                <div className="tax-owner-summary-cell tax-owner-summary-cell-primary">
                  <strong>{ownerSummary.ownerName}</strong>
                  <span>{ownerSummary.ownerType}</span>
                </div>
                <div className="tax-owner-summary-cell">
                  <strong>{ownerSummary.investmentCount}</strong>
                  <span>Investments</span>
                </div>
                <div className="tax-owner-summary-cell">
                  <strong>{formatCurrency(ownerSummary.totalEstimatedTaxableInterest)}</strong>
                  <span>Taxable interest</span>
                </div>
                <div className="tax-owner-summary-cell">
                  <strong>{formatContributionPercent(ownerSummary.totalEstimatedTaxableInterest, totalTaxableInterest)}</strong>
                  <div className="tax-owner-summary-bar" aria-hidden="true">
                    <span
                      className="tax-owner-summary-bar-fill"
                      style={{ width: `${Math.max(contributionPercent, contributionPercent > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
              </button>

              {expandedOwnerKeys[ownerSummary.ownerId] ? (
                <div className="tax-owner-detail">
                  <div className="tax-institution-list">
                {ownerSummary.institutionSummary.map((institution) => {
                  const expandKey = `${ownerSummary.ownerId}::${institution.institutionName}`
                  const isExpanded = Boolean(expandedInstitutionKeys[expandKey])
                  const visibleGroups = institution.groupedInvestments.slice(0, 5)
                  const hiddenGroupCount = Math.max(institution.groupedInvestments.length - visibleGroups.length, 0)

                  return (
                    <article key={expandKey} className="tax-institution-card">
                      <button
                        type="button"
                        className="tax-institution-summary-btn"
                        onClick={() => toggleInstitution(ownerSummary.ownerId, institution.institutionName)}
                      >
                        <div>
                          <strong>{institution.institutionName}</strong>
                          <p>{institution.investmentCount} investment{institution.investmentCount === 1 ? '' : 's'}</p>
                        </div>
                        <div className="tax-institution-summary-metrics">
                          <span>{formatCurrency(institution.totalEstimatedTaxableInterest)}</span>
                          <small>{institution.groupedInvestments.length} group{institution.groupedInvestments.length === 1 ? '' : 's'}</small>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="tax-group-list">
                          {visibleGroups.map((group) => {
                            const groupExpandKey = `${ownerSummary.ownerId}::${institution.institutionName}::${group.groupKey}`
                            const isGroupExpanded = Boolean(expandedGroupKeys[groupExpandKey])

                                      return (
                                        <article
                                          key={groupExpandKey}
                                          id={`tax-group-${toDomId(groupExpandKey)}`}
                                          className={selectedContributorId === groupExpandKey ? 'tax-group-card selected' : 'tax-group-card'}
                                        >
                                <button
                                  type="button"
                                  className="tax-group-summary"
                                  onClick={() => toggleGroup(ownerSummary.ownerId, institution.institutionName, group.groupKey)}
                                >
                                  <div>
                                    <strong>{formatCompactCurrencyLabel(group.principal)} {group.investmentType}{group.investmentCount > 1 ? ` (${group.investmentCount})` : ''}</strong>
                                    <span>
                                      {formatInterestRate(group.interestRate)} | {formatPayoutFrequencyLabel(group.payoutFrequency)} | {group.status}
                                    </span>
                                  </div>
                                  <div className="tax-group-summary-metrics">
                                    <strong>{formatCurrency(group.totalEstimatedTaxableInterest)}</strong>
                                        <small>Total interest from this group</small>
                                  </div>
                                </button>

                                {isGroupExpanded && (
                                  <div className="tax-breakdown-list">
                                    {group.items.map((investment) => (
                                      <article
                                        key={investment.investmentId || `${investment.ownerId}-${investment.accountNumber}-${investment.valueDate}`}
                                        className={`tax-breakdown-card ${investment.investmentId ? 'clickable-surface tax-breakdown-card-action' : ''}`}
                                        role={investment.investmentId ? 'button' : undefined}
                                        tabIndex={investment.investmentId ? 0 : undefined}
                                        onClick={investment.investmentId ? () => onOpenInvestmentDetail?.(investment) : undefined}
                                        onKeyDown={investment.investmentId ? (event) => handleInvestmentCardKeyDown(event, investment) : undefined}
                                      >
                                        <div className="tax-breakdown-head">
                                          <div>
                                            <strong>{investment.accountNumber || 'No account number'}</strong>
                                            <p>{investment.investmentType || 'Investment'} | {investment.valueDate} to {investment.maturityDate}</p>
                                          </div>
                                          <span className={`pill ${String(investment.status || '').trim().toUpperCase() === 'CLOSED' ? 'closed' : 'open'}`}>
                                            {investment.status || 'Open'}
                                          </span>
                                        </div>
                                        <div className="tax-breakdown-grid">
                                          <p><span>Principal</span><strong>{formatCurrency(investment.principal)}</strong></p>
                                          <p><span>Rate</span><strong>{formatInterestRate(investment.interestRate)}</strong></p>
                                          <p><span>Taxable interest</span><strong>{formatCurrency(investment.estimatedTaxableInterest)}</strong></p>
                                          <p><span>Calculation frequency</span><strong>{investment.calculationFrequency || getCalculationFrequencyFromAppliedRule(investment.appliedRule) || 'QUARTERLY'}</strong></p>
                                          <p><span>Interest payout</span><strong>{formatPayoutFrequencyLabel(investment.payoutFrequency || getPayoutFrequencyFromAppliedRule(investment.appliedRule))}</strong></p>
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                )}
                              </article>
                            )
                          })}
                          {hiddenGroupCount > 0 ? (
                            <p className="tax-hidden-note">
                              View {hiddenGroupCount} more interest group{hiddenGroupCount === 1 ? '' : 's'}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
                </div>
              ) : null}
            </section>
            )
          })}
            </div>
          </section>
          ) : null}

          {selectedOwnerName ? (
            <section className="tax-owner-table-panel">
              <div className="section-head section-head-split">
                <div>
                  <h3>{selectedOwnerName} details</h3>
                  <p>Owner is filtered, so the grouped investment drilldown is shown directly.</p>
                </div>
              </div>
              <div className="tax-owner-stack">
                {visibleOwnerSummaries.map((ownerSummary) => (
                  <section key={`filtered-${ownerSummary.ownerId}`} className="tax-owner-card tax-owner-card-condensed tax-owner-card-focused">
                    <div className="tax-owner-detail">
                      <div className="tax-institution-list">
                        {ownerSummary.institutionSummary.map((institution) => {
                          const expandKey = `${ownerSummary.ownerId}::${institution.institutionName}`
                          const isExpanded = Boolean(expandedInstitutionKeys[expandKey])
                          const visibleGroups = institution.groupedInvestments.slice(0, 5)
                          const hiddenGroupCount = Math.max(institution.groupedInvestments.length - visibleGroups.length, 0)

                          return (
                            <article key={`filtered-${expandKey}`} className="tax-institution-card">
                              <button
                                type="button"
                                className="tax-institution-summary-btn"
                                onClick={() => toggleInstitution(ownerSummary.ownerId, institution.institutionName)}
                              >
                                <div>
                                  <strong>{institution.institutionName}</strong>
                                  <p>{institution.investmentCount} investment{institution.investmentCount === 1 ? '' : 's'}</p>
                                </div>
                                <div className="tax-institution-summary-metrics">
                                  <span>{formatCurrency(institution.totalEstimatedTaxableInterest)}</span>
                                  <small>{institution.groupedInvestments.length} group{institution.groupedInvestments.length === 1 ? '' : 's'}</small>
                                </div>
                              </button>

                              {isExpanded ? (
                                <div className="tax-group-list">
                                  {visibleGroups.map((group) => {
                                    const groupExpandKey = `${ownerSummary.ownerId}::${institution.institutionName}::${group.groupKey}`
                                    const isGroupExpanded = Boolean(expandedGroupKeys[groupExpandKey])

                                    return (
                                      <article
                                        key={`filtered-${groupExpandKey}`}
                                        id={`tax-group-${toDomId(groupExpandKey)}`}
                                        className={selectedContributorId === groupExpandKey ? 'tax-group-card selected' : 'tax-group-card'}
                                      >
                                        <button
                                          type="button"
                                          className="tax-group-summary"
                                          onClick={() => toggleGroup(ownerSummary.ownerId, institution.institutionName, group.groupKey)}
                                        >
                                          <div>
                                            <strong>{formatCompactCurrencyLabel(group.principal)} {group.investmentType}{group.investmentCount > 1 ? ` (${group.investmentCount})` : ''}</strong>
                                            <span>
                                              {formatInterestRate(group.interestRate)} | {formatPayoutFrequencyLabel(group.payoutFrequency)} | {group.status}
                                            </span>
                                          </div>
                                          <div className="tax-group-summary-metrics">
                                            <strong>{formatCurrency(group.totalEstimatedTaxableInterest)}</strong>
                                            <small>Total interest from this group</small>
                                          </div>
                                        </button>

                                        {isGroupExpanded ? (
                                          <div className="tax-breakdown-list">
                                            {group.items.map((investment) => (
                                              <article
                                                key={investment.investmentId || `${investment.ownerId}-${investment.accountNumber}-${investment.valueDate}`}
                                                className={`tax-breakdown-card ${investment.investmentId ? 'clickable-surface tax-breakdown-card-action' : ''}`}
                                                role={investment.investmentId ? 'button' : undefined}
                                                tabIndex={investment.investmentId ? 0 : undefined}
                                                onClick={investment.investmentId ? () => onOpenInvestmentDetail?.(investment) : undefined}
                                                onKeyDown={investment.investmentId ? (event) => handleInvestmentCardKeyDown(event, investment) : undefined}
                                              >
                                                <div className="tax-breakdown-head">
                                                  <div>
                                                    <strong>{investment.accountNumber || 'No account number'}</strong>
                                                    <p>{investment.investmentType || 'Investment'} | {investment.valueDate} to {investment.maturityDate}</p>
                                                  </div>
                                                  <span className={`pill ${String(investment.status || '').trim().toUpperCase() === 'CLOSED' ? 'closed' : 'open'}`}>
                                                    {investment.status || 'Open'}
                                                  </span>
                                                </div>
                                                <div className="tax-breakdown-grid">
                                                  <p><span>Principal</span><strong>{formatCurrency(investment.principal)}</strong></p>
                                                  <p><span>Rate</span><strong>{formatInterestRate(investment.interestRate)}</strong></p>
                                                  <p><span>Taxable interest</span><strong>{formatCurrency(investment.estimatedTaxableInterest)}</strong></p>
                                                  <p><span>Calculation frequency</span><strong>{investment.calculationFrequency || getCalculationFrequencyFromAppliedRule(investment.appliedRule) || 'QUARTERLY'}</strong></p>
                                                  <p><span>Interest payout</span><strong>{formatPayoutFrequencyLabel(investment.payoutFrequency || getPayoutFrequencyFromAppliedRule(investment.appliedRule))}</strong></p>
                                                </div>
                                              </article>
                                            ))}
                                          </div>
                                        ) : null}
                                      </article>
                                    )
                                  })}
                                  {hiddenGroupCount > 0 ? (
                                    <p className="tax-hidden-note">
                                      View {hiddenGroupCount} more interest group{hiddenGroupCount === 1 ? '' : 's'}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon" aria-hidden="true">◌</div>
          <p className="lineage-empty">No investments overlap this financial year.</p>
          <p className="masters-empty-copy">Switch FY or clear the owner filter to see more investments.</p>
        </div>
      )}
    </article>
  )
}
