import { useEffect, useMemo, useState } from 'react'
import BulkImportPanel from '../import/BulkImportPanel.jsx'
import { formatInterestRate, generateInterestEvents, getCalculationFrequencyLabel, getEffectiveMaturityDate } from './depositModel.js'

const SHOW_BULK_IMPORT = false
const parsePositiveEnvNumber = (key, fallback) => {
  const number = Number(import.meta.env[key])
  return Number.isFinite(number) && number > 0 ? number : fallback
}
const DEPOSIT_MATURING_SOON_WINDOW_DAYS = Math.floor(
  parsePositiveEnvNumber('VITE_DEPOSIT_MATURING_SOON_WINDOW_DAYS', 45),
)
const DEPOSIT_GROUP_SECTION_LIMIT = Math.floor(
  parsePositiveEnvNumber('VITE_DEPOSIT_GROUP_SECTION_LIMIT', 5),
)
const DETAIL_EVENT_PREVIEW_LIMIT = 3
const toInputDate = (date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
  depositFilterResetSeed,
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
  setSelectedId,
  selectedDeposit,
  selectedSourceEvents,
  selectedReinvestmentSummary,
  selectedInterestEvents,
  selectedInterestSummary,
  archiveTargetId,
  isArchiving,
  deleteTargetId,
  isDeleting,
  closingInvestmentId,
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
  closeInvestment,
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
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [investmentTypeFilter, setInvestmentTypeFilter] = useState('all')
  const [showAllDepositGroups, setShowAllDepositGroups] = useState(false)
  const [showAllTimelineItems, setShowAllTimelineItems] = useState(false)
  const [showAllInterestEvents, setShowAllInterestEvents] = useState(false)
  const [expandedGroupKeys, setExpandedGroupKeys] = useState({})
  const [expandedStatusSections, setExpandedStatusSections] = useState({})
  const [expandedTimelineItems, setExpandedTimelineItems] = useState({})
  const [closeTargetId, setCloseTargetId] = useState('')
  const [closeDraft, setCloseDraft] = useState({
    closureDate: '',
    maturityBeforeTax: '',
    maturityAfterTax: '',
    notes: '',
  })
  const [closeError, setCloseError] = useState('')
  const hasViewFilters =
    hasActiveDepositFilters ||
    ownerFilter !== 'all' ||
    investmentTypeFilter !== 'all'

  const clearDepositFilters = () => {
    setSearchScope('all')
    setSearchText('')
    setInvestmentDateFrom('')
    setInvestmentDateTo('')
    setMaturityDateFrom('')
    setMaturityDateTo('')
    setShowClosed(true)
    setOwnerFilter('all')
    setInvestmentTypeFilter('all')
  }

  useEffect(() => {
    setOwnerFilter('all')
    setInvestmentTypeFilter('all')
  }, [depositFilterResetSeed])

  const getContributionAmount = (deposit) => {
    const grossMaturity = Number(deposit.maturityBeforeTax || 0)
    const principal = Number(deposit.principalAmount || 0)
    const totalInterestEarned = Number(deposit.totalInterestEarned || 0)

    if (grossMaturity > 0 && principal > 0) {
      return Math.max(grossMaturity - principal, 0)
    }

    return Math.max(totalInterestEarned, 0)
  }

  const ownerOptions = useMemo(
    () => Array.from(new Set(filteredDeposits.map((deposit) => String(deposit.holderName || '').trim()).filter(Boolean))).sort(),
    [filteredDeposits],
  )

  const investmentTypeOptions = useMemo(
    () => Array.from(new Set(filteredDeposits.map((deposit) => String(deposit.instrumentType || '').trim()).filter(Boolean))).sort(),
    [filteredDeposits],
  )

  const viewFilteredDeposits = useMemo(
    () =>
      filteredDeposits.filter((deposit) => {
        const ownerMatches =
          ownerFilter === 'all' || String(deposit.holderName || '').trim() === ownerFilter
        const typeMatches =
          investmentTypeFilter === 'all' || String(deposit.instrumentType || '').trim() === investmentTypeFilter

        return ownerMatches && typeMatches
      }),
    [filteredDeposits, investmentTypeFilter, ownerFilter],
  )

  const detailDeposit = selectedDeposit ?? null

  useEffect(() => {
    if (!selectedId) {
      return
    }

    if (!selectedDeposit) {
      setSelectedId(null)
    }
  }, [selectedDeposit, selectedId, setSelectedId])

  useEffect(() => {
    setShowAllTimelineItems(false)
    setShowAllInterestEvents(false)
    setExpandedTimelineItems({})
    setCloseTargetId('')
    setCloseError('')
  }, [selectedId])

  const groupedDeposits = useMemo(() => {
    const groupMap = new Map()

    viewFilteredDeposits.forEach((deposit) => {
      const groupKey = [
        String(deposit.holderName || '').trim(),
        String(deposit.bankName || '').trim(),
        String(deposit.instrumentType || '').trim(),
        Number(deposit.principalAmount || 0),
        Number(deposit.interestRate || 0).toFixed(2),
        String(getPayoutModeLabel(deposit) || '').trim(),
        String(deposit.status || '').trim(),
      ].join('::')

      const current = groupMap.get(groupKey) || {
        id: groupKey,
        ownerLabel: String(deposit.holderName || 'Unassigned').trim() || 'Unassigned',
        institutionName: String(deposit.bankName || 'Bank not set').trim() || 'Bank not set',
        instrumentType: String(deposit.instrumentType || 'Investment').trim() || 'Investment',
        principalAmount: Number(deposit.principalAmount || 0),
        interestRate: Number(deposit.interestRate || 0),
        payoutLabel: getPayoutModeLabel(deposit),
        status: deposit.status,
        count: 0,
        totalPrincipal: 0,
        totalContribution: 0,
        nextMaturityDate: deposit.maturityDate,
        nextInterestDate: '',
        nextInterestAmount: 0,
        items: [],
      }

      current.count += 1
      current.totalPrincipal += Number(deposit.principalAmount || 0)
      current.totalContribution += getContributionAmount(deposit)
      current.items.push(deposit)

      if (
        !current.nextMaturityDate ||
        (deposit.maturityDate && new Date(`${deposit.maturityDate}T00:00:00`) < new Date(`${current.nextMaturityDate}T00:00:00`))
      ) {
        current.nextMaturityDate = deposit.maturityDate
      }

      const nextInterestEvent = generateInterestEvents(deposit).find(
        (event) => new Date(`${event.date}T00:00:00`).getTime() >= todayTime,
      )

      if (
        nextInterestEvent &&
        (!current.nextInterestDate ||
          new Date(`${nextInterestEvent.date}T00:00:00`).getTime() <
            new Date(`${current.nextInterestDate}T00:00:00`).getTime())
      ) {
        current.nextInterestDate = nextInterestEvent.date
        current.nextInterestAmount = Number(nextInterestEvent.amount || 0)
      } else if (
        nextInterestEvent &&
        current.nextInterestDate &&
        nextInterestEvent.date === current.nextInterestDate
      ) {
        current.nextInterestAmount += Number(nextInterestEvent.amount || 0)
      }

      groupMap.set(groupKey, current)
    })

    return Array.from(groupMap.values()).sort((left, right) => {
      if (right.totalContribution !== left.totalContribution) {
        return right.totalContribution - left.totalContribution
      }

      return right.totalPrincipal - left.totalPrincipal
    })
  }, [getPayoutModeLabel, todayTime, viewFilteredDeposits])

  const statusGroupedDeposits = useMemo(() => {
    const upcomingCutoff = new Date(todayTime)
    upcomingCutoff.setDate(upcomingCutoff.getDate() + DEPOSIT_MATURING_SOON_WINDOW_DAYS)
    const getMaturitySortValue = (group) => {
      if (!group.nextMaturityDate) {
        return Number.MAX_SAFE_INTEGER
      }

      const time = new Date(`${group.nextMaturityDate}T00:00:00`).getTime()
      return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time
    }
    const getInterestSortValue = (group) => {
      if (!group.nextInterestDate) {
        return Number.MAX_SAFE_INTEGER
      }

      const time = new Date(`${group.nextInterestDate}T00:00:00`).getTime()
      return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time
    }
    const sortByNearestMaturity = (left, right) => {
      const maturityDifference = getMaturitySortValue(left) - getMaturitySortValue(right)
      if (maturityDifference !== 0) {
        return maturityDifference
      }

      if (right.totalPrincipal !== left.totalPrincipal) {
        return right.totalPrincipal - left.totalPrincipal
      }

      return right.count - left.count
    }
    const sortByIncomingCashPriority = (left, right) => {
      const interestDifference = getInterestSortValue(left) - getInterestSortValue(right)
      if (interestDifference !== 0) {
        return interestDifference
      }

      const maturityDifference = getMaturitySortValue(left) - getMaturitySortValue(right)
      if (maturityDifference !== 0) {
        return maturityDifference
      }

      if (right.totalContribution !== left.totalContribution) {
        return right.totalContribution - left.totalContribution
      }

      return right.totalPrincipal - left.totalPrincipal
    }
    const sortByActiveOperationalPriority = (left, right) => {
      const maturityDifference = getMaturitySortValue(left) - getMaturitySortValue(right)
      if (maturityDifference !== 0) {
        return maturityDifference
      }

      if (right.totalPrincipal !== left.totalPrincipal) {
        return right.totalPrincipal - left.totalPrincipal
      }

      return right.totalContribution - left.totalContribution
    }

    const isMaturingSoon = (group) => {
      if (String(group.status || '').trim().toLowerCase() === 'closed' || !group.nextMaturityDate) {
        return false
      }

      const maturityDate = new Date(`${group.nextMaturityDate}T00:00:00`)
      return maturityDate >= new Date(todayTime) && maturityDate <= upcomingCutoff
    }

    const isInterestIncoming = (group) =>
      String(group.status || '').trim().toLowerCase() !== 'closed' &&
      Boolean(group.nextInterestDate)

    const maturingSoon = groupedDeposits.filter(isMaturingSoon).sort(sortByNearestMaturity)
    const interestIncoming = groupedDeposits.filter(isInterestIncoming).sort(sortByIncomingCashPriority)
    const activeDeposits = groupedDeposits.filter(
      (group) =>
        String(group.status || '').trim().toLowerCase() !== 'closed' &&
        !isMaturingSoon(group) &&
        !isInterestIncoming(group),
    ).sort(sortByActiveOperationalPriority)
    const closedDeposits = groupedDeposits.filter(
      (group) => String(group.status || '').trim().toLowerCase() === 'closed',
    ).sort(sortByNearestMaturity)

    return [
      {
        key: 'maturingSoon',
        title: 'Maturing soon',
        description: 'Deposits that may need rollover or reinvestment planning shortly.',
        groups: maturingSoon,
      },
      {
        key: 'interestIncoming',
        title: 'Interest incoming',
        description: 'Payout deposits that can bring cash back before maturity.',
        groups: interestIncoming,
      },
      {
        key: 'active',
        title: 'Running deposits',
        description: 'Open deposits that are still running without an immediate cash event.',
        groups: activeDeposits,
      },
      ...(showClosed
        ? [{
            key: 'closed',
            title: 'Archived deposits',
            description: 'Completed deposits kept for reference and lineage.',
            groups: closedDeposits,
          }]
        : []),
    ]
  }, [groupedDeposits, showClosed, todayTime])

  const toggleDepositGroup = (groupId) => {
    setExpandedGroupKeys((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  const toggleStatusSection = (sectionKey) => {
    setExpandedStatusSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const toggleTimelineItem = (itemKey) => {
    setExpandedTimelineItems((current) => ({
      ...current,
      [itemKey]: !current[itemKey],
    }))
  }

  const renderStatusBucketPreview = (group, sectionKey) => {
    const previewDate =
      sectionKey === 'interestIncoming'
        ? (group.nextInterestDate || group.nextMaturityDate)
        : group.nextMaturityDate
    const previewAmount =
      sectionKey === 'interestIncoming' ? group.nextInterestAmount : group.totalPrincipal
    const previewVerb =
      sectionKey === 'interestIncoming'
        ? `${formatCurrency(previewAmount)} payout`
        : `Matures ${formatDate(previewDate)}`

    return (
      <div key={`${sectionKey}-${group.id}`} className="deposit-status-preview-item">
        <strong>{group.institutionName} {formatCurrency(group.principalAmount)}</strong>
        <span>{group.ownerLabel} • {previewVerb}</span>
      </div>
    )
  }

  const renderDepositGroupCard = (group, sectionKey = 'active') => {
    const isExpanded = Boolean(expandedGroupKeys[group.id])
    const principalMetricLabel = group.count > 1 ? 'Total principal' : 'Principal amount'
    const actionDateLabel = sectionKey === 'interestIncoming' ? 'Next cash' : 'Next maturity'
    const actionDateValue =
      sectionKey === 'interestIncoming'
        ? (group.nextInterestDate || group.nextMaturityDate)
        : group.nextMaturityDate
    const middleMetricLabel =
      sectionKey === 'interestIncoming'
        ? 'Upcoming cash'
        : (group.count > 1 ? 'Total interest' : 'Interest earned')
    const middleMetricValue = sectionKey === 'interestIncoming'
      ? group.nextInterestAmount
      : group.totalContribution

    return (
      <article key={group.id} className="deposit-group-card">
        <button
          type="button"
          className="deposit-group-head"
          onClick={() => toggleDepositGroup(group.id)}
        >
          <div className="deposit-group-copy">
            <strong className="deposit-group-amount">{formatCurrency(group.principalAmount)}</strong>
            <div className="deposit-group-title-row">
              <strong>{group.instrumentType}{group.count > 1 ? ` (${group.count})` : ''}</strong>
            </div>
            <span>{group.ownerLabel} • {group.institutionName} • {formatInterestRate(group.interestRate)} • {group.payoutLabel}</span>
          </div>
          <div className="deposit-group-metrics">
            <div>
              <span>{principalMetricLabel}</span>
              <strong>{formatCurrency(group.totalPrincipal)}</strong>
            </div>
            <div>
              <span>{middleMetricLabel}</span>
              <strong>{formatCurrency(middleMetricValue)}</strong>
            </div>
            <div>
              <span>{actionDateLabel}</span>
              <strong>{formatDate(actionDateValue)}</strong>
            </div>
          </div>
        </button>

        {isExpanded ? (
          <div className="deposit-group-items">
            {group.items.map((deposit) => (
              <button
                key={deposit.id}
                type="button"
                className={selectedId === deposit.id ? 'deposit-card selected clickable-surface deposit-item-row' : 'deposit-card clickable-surface deposit-item-row'}
                onClick={() => openDepositDetail(deposit.id)}
              >
                {renderDepositCard(deposit)}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    )
  }

  const renderMaturityUsageContent = () => {
    if (selectedReinvestmentSummary?.availableAmount === null) {
      return <p>Add final post-TDS maturity amount after closure to track unused maturity cash.</p>
    }

    if (!selectedReinvestmentSummary.isRealized) {
      return (
        <>
          <p><strong>Expected maturity cash:</strong> {formatCurrency(selectedReinvestmentSummary.availableAmount)}</p>
          <p><strong>Expected cash date:</strong> {formatDate(selectedReinvestmentSummary.realizationDate || selectedDeposit.maturityDate)}</p>
          <p>This cash is not available to reinvest yet because the maturity has not been realized.</p>
        </>
      )
    }

    return (
      <>
        <p><strong>Maturity cash received:</strong> {formatCurrency(selectedReinvestmentSummary.availableAmount)}</p>
        <p><strong>Cash received on:</strong> {formatDate(selectedReinvestmentSummary.realizationDate || selectedDeposit.maturityDate)}</p>
        <p><strong>Already reinvested:</strong> {formatCurrency(selectedReinvestmentSummary.reinvestedAmount)}</p>
        <p><strong>Settled outside YieldFlow:</strong> {formatCurrency(selectedReinvestmentSummary.settledAmount)}</p>
        <p>
          <strong>Available to reinvest:</strong>{' '}
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
          {(deposit.status === 'Closed' || isPastMaturityOpen(deposit)) && (
            <span className={deposit.status === 'Closed' ? 'pill closed' : 'pill open'}>
              {deposit.status === 'Closed' ? 'Closed' : 'Review'}
            </span>
          )}
          <span className="deposit-time-remaining">{formatTenure(deposit)}</span>
        </div>
      </div>
      <div className="deposit-amount-row">
        <strong className="deposit-amount">{formatCurrency(deposit.principalAmount)}</strong>
      </div>
      <div className="deposit-meta">
        <span>{deposit.holderName}</span>
        <span>Maturity {formatDate(deposit.maturityDate)}</span>
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

  const nextPendingInterestEvent = selectedInterestSummary?.eventRows.find((event) => !event.isDue) || null

  const nextActionConfig = selectedDeposit
    ? selectedReinvestmentSummary?.isRealized && selectedReinvestmentSummary.uninvestedAmount > 0
      ? {
          title: `Reinvest ${formatCurrency(selectedReinvestmentSummary.uninvestedAmount)}`,
          detail: 'Maturity cash is available and waiting to be allocated into the next investment.',
          ctaLabel: isReadOnly ? '' : 'Allocate maturity cash',
          onClick: isReadOnly ? null : fillFromSelectedMaturity,
        }
      : selectedInterestSummary?.totalDueUnallocated > 0
        ? {
            title: `Reinvest ${formatCurrency(selectedInterestSummary.totalDueUnallocated)}`,
            detail: 'Interest cash has been received and is still available to fund another deposit.',
            ctaLabel: isReadOnly ? '' : 'Allocate interest cash',
            onClick: isReadOnly ? null : fillFromAllAvailableInterest,
          }
        : isPastMaturityOpen(selectedDeposit)
          ? {
              title: 'Review this matured deposit',
              detail: 'The maturity date has passed but the deposit is still marked open.',
              ctaLabel: '',
              onClick: null,
            }
          : nextPendingInterestEvent
            ? {
                title: `Upcoming payout ${formatDate(nextPendingInterestEvent.date)}`,
                detail: `Upcoming payout ${formatCurrency(nextPendingInterestEvent.amount)} after TDS.`,
                ctaLabel: '',
                onClick: null,
              }
            : null
    : null

  const cashStatusSummary = selectedDeposit
    ? {
        received:
          (selectedReinvestmentSummary?.isRealized ? Number(selectedReinvestmentSummary.availableAmount || 0) : 0) +
          Number(selectedInterestSummary?.totalDueExpected || 0),
        reinvested:
          Number(selectedReinvestmentSummary?.reinvestedAmount || 0) +
          Number(selectedInterestSummary?.totalDueAllocated || 0),
        upcoming:
          (!selectedReinvestmentSummary?.isRealized
            ? Number(selectedReinvestmentSummary?.availableAmount || 0)
            : 0) + Number(selectedInterestSummary?.totalFutureExpected || 0),
        availableToReinvest:
          (selectedReinvestmentSummary?.isRealized
            ? Number(selectedReinvestmentSummary?.uninvestedAmount || 0)
            : 0) + Number(selectedInterestSummary?.totalDueUnallocated || 0),
      }
    : null

  const hasPositiveAmount = (value) => Number(value || 0) > 0
  const isPeriodicDeposit = selectedDeposit
    ? String(selectedDeposit.payoutMode || 'on-maturity') !== 'on-maturity'
    : false
  const isClosedDeposit = selectedDeposit?.status === 'Closed'
  const canCloseSelectedDeposit = Boolean(!isReadOnly && selectedDeposit && selectedDeposit.status === 'Open')
  const showCashStatusSummary = cashStatusSummary
    ? Number(cashStatusSummary.received || 0) > 0 ||
      Number(cashStatusSummary.reinvested || 0) > 0 ||
      Number(cashStatusSummary.upcoming || 0) > 0 ||
      Number(cashStatusSummary.availableToReinvest || 0) > 0
    : false
  const closePrincipalAmount = Number(selectedDeposit?.principalAmount || 0)
  const closeMaturityBeforeTax = Number(closeDraft.maturityBeforeTax || 0)
  const closeMaturityAfterTax = Number(closeDraft.maturityAfterTax || 0)
  const closeGrossInterest = Math.max(closeMaturityBeforeTax - closePrincipalAmount, 0)
  const closeTdsDeducted = Math.max(closeMaturityBeforeTax - closeMaturityAfterTax, 0)
  const closeNetInterest = Math.max(closeMaturityAfterTax - closePrincipalAmount, 0)
  const selectedEffectiveMaturityDate = selectedDeposit ? getEffectiveMaturityDate(selectedDeposit) : ''
  const isClosingSelectedDeposit = closingInvestmentId === selectedDeposit?.id

  const openCloseInvestmentPanel = () => {
    if (!selectedDeposit) {
      return
    }

    setCloseTargetId(selectedDeposit.id)
    setCloseError('')
    setCloseDraft({
      closureDate: selectedDeposit.closureDate || toInputDate(new Date(todayTime)),
      maturityBeforeTax: selectedDeposit.maturityBeforeTax || '',
      maturityAfterTax: selectedDeposit.maturityAfterTax || '',
      notes: selectedDeposit.notes || '',
    })
  }

  const cancelCloseInvestment = () => {
    setCloseTargetId('')
    setCloseError('')
  }

  const handleCloseDraftChange = (event) => {
    const { name, value } = event.target
    setCloseDraft((current) => ({
      ...current,
      [name]: value,
    }))
    setCloseError('')
  }

  const submitCloseInvestment = async (event) => {
    event.preventDefault()

    if (!selectedDeposit) {
      return
    }

    if (closeMaturityBeforeTax <= 0) {
      setCloseError('Enter maturity amount before TDS.')
      return
    }
    if (closeMaturityAfterTax <= 0) {
      setCloseError('Enter maturity amount received after TDS.')
      return
    }
    if (closeMaturityBeforeTax < closePrincipalAmount) {
      setCloseError('Maturity before TDS cannot be less than principal.')
      return
    }
    if (closeMaturityAfterTax > closeMaturityBeforeTax) {
      setCloseError('Maturity after TDS cannot exceed maturity before TDS.')
      return
    }
    if (!closeDraft.closureDate) {
      setCloseError('Enter the date cash was received.')
      return
    }
    if (
      selectedDeposit.investmentDate &&
      new Date(`${closeDraft.closureDate}T00:00:00`).getTime() <
        new Date(`${selectedDeposit.investmentDate}T00:00:00`).getTime()
    ) {
      setCloseError('Closure date cannot be before investment date.')
      return
    }
    if (new Date(`${closeDraft.closureDate}T00:00:00`).getTime() > todayTime) {
      setCloseError('Closure date cannot be in the future.')
      return
    }

    try {
      await closeInvestment(selectedDeposit, closeDraft)
      setCloseTargetId('')
      setCloseError('')
    } catch (error) {
      setCloseError(error.message)
    }
  }

  const detailTimelineItems = selectedDeposit
    ? [
        {
          key: `maturity-${selectedDeposit.id}`,
          kind: 'Maturity',
          date: selectedEffectiveMaturityDate,
          amount:
            selectedDeposit.maturityAfterTax ||
            selectedDeposit.maturityBeforeTax ||
            selectedDeposit.principalAmount,
          status:
            selectedReinvestmentSummary?.isRealized
              ? 'Received'
              : selectedDeposit.status === 'Closed'
                ? 'Closed'
                : 'Expected',
          detail: selectedReinvestmentSummary?.isRealized
              ? `Available to reinvest ${formatCurrency(selectedReinvestmentSummary.uninvestedAmount)} after reinvested and settled amounts.`
            : 'Maturity cash has not been received yet.',
          canAllocate: Boolean(
            !isReadOnly &&
              selectedReinvestmentSummary?.isRealized &&
              selectedReinvestmentSummary.uninvestedAmount > 0,
          ),
          onAllocate: fillFromSelectedMaturity,
        },
        ...(selectedInterestSummary?.eventRows || []).map((event) => ({
          key: event.eventId,
          kind: 'Interest',
          date: event.date,
          amount: event.amount,
          status: event.isDue ? 'Received' : 'Upcoming',
          detail: event.isDue
            ? `Reinvested ${formatCurrency(event.allocatedWithinEventAmount)} • Left ${formatCurrency(event.unallocatedAmount)}`
            : `Before TDS ${formatCurrency(event.grossAmount)} • After TDS ${formatCurrency(event.amount)}`,
          canAllocate: Boolean(!isReadOnly && event.isDue && event.unallocatedAmount > 0),
          onAllocate: () => applyCashFlowSource(event),
        })),
      ].sort(
        (left, right) =>
          new Date(`${left.date}T00:00:00`).getTime() - new Date(`${right.date}T00:00:00`).getTime(),
      )
    : []
  const visibleDetailTimelineItems = showAllTimelineItems
    ? detailTimelineItems
    : detailTimelineItems.slice(0, DETAIL_EVENT_PREVIEW_LIMIT)
  const interestEventRows = selectedInterestSummary?.eventRows || []
  const visibleInterestEventRows = showAllInterestEvents
    ? interestEventRows
    : interestEventRows.slice(0, DETAIL_EVENT_PREVIEW_LIMIT)

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

  const depositDetailPanel = (
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
              </div>

              <section className="deposit-timeline-panel">
                <div className="section-head section-head-split">
                  <div>
                    <h3>Cashflow timeline</h3>
                    <p>Select an event to review allocation details.</p>
                  </div>
                </div>
                <div className="deposit-timeline-list">
                  {visibleDetailTimelineItems.map((item) => {
                    const isExpanded = Boolean(expandedTimelineItems[item.key])

                    return (
                      <article key={item.key} className="deposit-timeline-card">
                        <button
                          type="button"
                          className="deposit-timeline-toggle"
                          onClick={() => toggleTimelineItem(item.key)}
                        >
                          <div>
                            <strong>{item.kind}</strong>
                            <span>{formatDate(item.date)} • {item.status}</span>
                          </div>
                          <div className="deposit-timeline-amount">
                            <strong>{formatCurrency(item.amount)}</strong>
                            <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                          </div>
                        </button>
                        {isExpanded ? (
                          <div className="deposit-timeline-body">
                            <p>{item.detail}</p>
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
                  {detailTimelineItems.length > DETAIL_EVENT_PREVIEW_LIMIT ? (
                    <button
                      type="button"
                      className="mini-link timeline-preview-more"
                      onClick={() => setShowAllTimelineItems((current) => !current)}
                    >
                      {showAllTimelineItems ? 'Show fewer timeline events' : 'View full timeline'}
                    </button>
                  ) : null}
                </div>
              </section>

              <div className="allocation-card">
                <p className="allocation-title">Maturity usage</p>
                {renderMaturityUsageContent()}
              </div>

              {selectedInterestEvents.length > 0 && (
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
