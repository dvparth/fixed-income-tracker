import { useMemo, useState } from 'react'

const formatTenureFromDates = (startDate, endDate) => {
  const start = new Date(`${String(startDate || '').trim()}T00:00:00`)
  const end = new Date(`${String(endDate || '').trim()}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return ''
  }

  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  let days = end.getDate() - start.getDate()

  if (days < 0) {
    months -= 1
    const previousMonth = new Date(end.getFullYear(), end.getMonth(), 0)
    days += previousMonth.getDate()
  }

  if (months < 0) {
    years -= 1
    months += 12
  }

  return [years ? `${years}Y` : '', months ? `${months}M` : '', days ? `${days}D` : '']
    .filter(Boolean)
    .join(' ') || '0D'
}

const formatCalculationFrequencyLabel = (value) => {
  switch (String(value || '').trim().toUpperCase()) {
    case 'MONTHLY':
      return 'Monthly'
    case 'QUARTERLY':
      return 'Quarterly'
    case 'YEARLY':
      return 'Yearly'
    case 'SIMPLE':
      return 'Simple'
    default:
      return 'Not set'
  }
}

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

export default function FyTaxView({
  summary,
  selectedFinancialYear,
  isLoading,
  error,
  formatCurrency,
  isOpen,
  onOpen,
  onClose,
}) {
  const [expandedInstitutionKeys, setExpandedInstitutionKeys] = useState({})

  const consolidated = summary?.consolidatedPortfolioSummary || null

  const ownerSummariesWithInstitutions = useMemo(
    () =>
      (summary?.ownerWiseSummary || []).map((ownerSummary) => ({
        ...ownerSummary,
        institutionSummary: buildInstitutionSummaries(ownerSummary.investmentBreakdown || []),
      })),
    [summary],
  )

  const toggleInstitution = (ownerId, institutionName) => {
    const key = `${ownerId}::${institutionName}`
    setExpandedInstitutionKeys((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const logInstitutionInvestmentDetails = (ownerSummary, institution) => {
    const payload = institution.investmentBreakdown.map((investment, index) => {
      const resolvedCalculationFrequency =
        investment.calculationFrequency || getCalculationFrequencyFromAppliedRule(investment.appliedRule)
      const resolvedPayoutFrequency =
        investment.payoutFrequency || getPayoutFrequencyFromAppliedRule(investment.appliedRule)

      return {
        serialNumber: index + 1,
        tenure: formatTenureFromDates(investment.valueDate, investment.maturityDate),
        startDate: investment.valueDate,
        endDate: investment.maturityDate,
        interest: investment.estimatedTotalInterest,
        interestCalculationFrequency: formatCalculationFrequencyLabel(resolvedCalculationFrequency),
        interestPayoutFrequency: formatPayoutFrequencyLabel(resolvedPayoutFrequency),
        taxableInterest: investment.estimatedTaxableInterest,
        principalAmount: investment.principal,
      }
    })

    console.group(
      `FY Tax validation | ${ownerSummary.ownerName} | ${institution.institutionName} | FY ${selectedFinancialYear}`,
    )
    console.log(JSON.stringify(payload, null, 2))
    console.groupEnd()
  }

  if (!isOpen) {
    return (
      <article className="panel tax-teaser-panel">
        <div className="section-head">
          <div>
            <h2>FY tax estimation</h2>
            <p>
              Open the CA-style tax planning view for FY {selectedFinancialYear} when you want taxable-interest estimates.
            </p>
          </div>
          <button type="button" className="secondary-btn compact dashboard-action-btn" onClick={onOpen}>
            Open tax view
          </button>
        </div>
      </article>
    )
  }

  if (isLoading) {
    return (
      <article className="panel tax-panel">
        <div className="section-head">
          <div>
            <h2>FY tax estimation</h2>
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
            <h2>FY tax estimation</h2>
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

  return (
    <article className="panel tax-panel">
      <div className="section-head">
        <div>
          <h2>FY tax estimation</h2>
          <p>
            Institution-wise summary per owner for FY {selectedFinancialYear}. Open details only when you need investment-level review.
          </p>
        </div>
        <button type="button" className="secondary-btn compact ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {consolidated ? (
        <div className="tax-summary-grid">
          <div className="stat-card">
            <span>Total taxable interest</span>
            <strong>{formatCurrency(consolidated.totalEstimatedTaxableInterest)}</strong>
            <small>{consolidated.investmentCount} investments covered</small>
          </div>
          <div className="stat-card">
            <span>Total TDS</span>
            <strong>{formatCurrency(consolidated.totalEstimatedTds)}</strong>
            <small>{consolidated.ownerCount} owners in scope</small>
          </div>
          <div className="stat-card warning">
            <span>Additional tax liability</span>
            <strong>{formatCurrency(consolidated.totalEstimatedAdditionalTaxLiability)}</strong>
            <small>After estimated TDS credit</small>
          </div>
        </div>
      ) : null}

      {ownerSummariesWithInstitutions.length > 0 ? (
        <div className="tax-owner-stack">
          {ownerSummariesWithInstitutions.map((ownerSummary) => (
            <section key={ownerSummary.ownerId} className="tax-owner-card">
              <div className="tax-owner-head">
                <div>
                  <h3>{ownerSummary.ownerName}</h3>
                  <p>
                    {ownerSummary.ownerType} | Tax slab {ownerSummary.ownerTaxSlabRate || 0}% | {ownerSummary.investmentCount} investments
                  </p>
                </div>
                <div className="tax-owner-head-actions">
                  {!ownerSummary.hasConfiguredTaxProfile && (
                    <span className="pill warning">Default slab used</span>
                  )}
                </div>
              </div>

              <div className="tax-owner-metrics">
                <div>
                  <span>Taxable interest</span>
                  <strong>{formatCurrency(ownerSummary.totalEstimatedTaxableInterest)}</strong>
                </div>
                <div>
                  <span>TDS</span>
                  <strong>{formatCurrency(ownerSummary.totalEstimatedTds)}</strong>
                </div>
                <div>
                  <span>Additional tax</span>
                  <strong>{formatCurrency(ownerSummary.totalEstimatedAdditionalTaxLiability)}</strong>
                </div>
              </div>

              <div className="tax-institution-list">
                {ownerSummary.institutionSummary.map((institution) => {
                  const expandKey = `${ownerSummary.ownerId}::${institution.institutionName}`
                  const isExpanded = Boolean(expandedInstitutionKeys[expandKey])

                  return (
                    <article key={expandKey} className="tax-institution-card">
                      <div className="tax-breakdown-head">
                        <div>
                          <strong>{institution.institutionName}</strong>
                          <p>{institution.investmentCount} investment{institution.investmentCount === 1 ? '' : 's'}</p>
                        </div>
                        <div className="tax-owner-head-actions">
                          <button
                            type="button"
                            className="secondary-btn compact ghost-btn"
                            onClick={() => logInstitutionInvestmentDetails(ownerSummary, institution)}
                          >
                            Log investments
                          </button>
                          <button
                            type="button"
                            className="secondary-btn compact ghost-btn"
                            onClick={() => toggleInstitution(ownerSummary.ownerId, institution.institutionName)}
                          >
                            {isExpanded ? 'Hide details' : 'View details'}
                          </button>
                        </div>
                      </div>

                      <div className="tax-breakdown-grid tax-breakdown-grid-summary">
                        <p><span>Taxable interest</span><strong>{formatCurrency(institution.totalEstimatedTaxableInterest)}</strong></p>
                        <p><span>TDS</span><strong>{formatCurrency(institution.totalEstimatedTds)}</strong></p>
                        <p><span>Additional tax</span><strong>{formatCurrency(institution.totalEstimatedAdditionalTaxLiability)}</strong></p>
                      </div>

                      {isExpanded && (
                        <div className="tax-breakdown-list">
                          {institution.investmentBreakdown.map((investment) => (
                            <article
                              key={investment.investmentId || `${investment.ownerId}-${investment.accountNumber}-${investment.valueDate}`}
                              className="tax-breakdown-card"
                            >
                              <div className="tax-breakdown-head">
                                <div>
                                  <strong>{investment.accountNumber || 'No account no.'}</strong>
                                  <p>{investment.investmentType || 'Investment'} | {investment.valueDate} to {investment.maturityDate}</p>
                                </div>
                              </div>
                              <div className="tax-breakdown-grid">
                                <p><span>Principal</span><strong>{formatCurrency(investment.principal)}</strong></p>
                                <p><span>Rate</span><strong>{investment.interestRate}%</strong></p>
                                <p><span>Taxable interest</span><strong>{formatCurrency(investment.estimatedTaxableInterest)}</strong></p>
                                <p><span>TDS</span><strong>{formatCurrency(investment.estimatedTds)}</strong></p>
                                <p><span>Additional tax</span><strong>{formatCurrency(investment.estimatedAdditionalTaxLiability)}</strong></p>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon" aria-hidden="true">◌</div>
          <p className="lineage-empty">No investments overlap this financial year.</p>
          <p className="masters-empty-copy">Switch FY or add investments with dates in scope.</p>
        </div>
      )}
    </article>
  )
}
