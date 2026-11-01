import { useEffect, useMemo, useState } from 'react'
import DepositListPanel from './DepositListPanel.jsx'
import DepositDetailPanel from './DepositDetailPanel.jsx'
import { buildDepositTimelineItems } from './depositTimeline.js'
import {
  formatInterestRate,
  generateInterestEvents,
  getCalculationFrequencyLabel,
  getEffectiveMaturityDate,
} from './depositModel.js'

const parsePositiveEnvNumber = (key, fallback) => {
  const number = Number(import.meta.env[key])
  return Number.isFinite(number) && number > 0 ? number : fallback
}
const DEPOSIT_MATURING_SOON_WINDOW_DAYS = Math.floor(
  parsePositiveEnvNumber('VITE_DEPOSIT_MATURING_SOON_WINDOW_DAYS', 45),
)
const DETAIL_EVENT_PREVIEW_LIMIT = 3
const DETAIL_TIMELINE_PREVIEW_LIMIT = 5
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
  renewInvestment,
  salarySavings,
  renewingInvestmentId,
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
  const [renewTargetId, setRenewTargetId] = useState('')
  const [renewDraft, setRenewDraft] = useState({
    principalAmount: '',
    maturityBeforeTax: '',
    actualMaturityCash: '',
    salaryAllocations: [],
  })
  const [renewError, setRenewError] = useState('')
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

  const getRenewalDefaultAmount = (deposit) => {
    const maturityAfterTax = Number(deposit?.maturityAfterTax || 0)
    if (maturityAfterTax > 0) {
      return maturityAfterTax
    }

    const maturityBeforeTax = Number(deposit?.maturityBeforeTax || 0)
    if (maturityBeforeTax > 0) {
      return maturityBeforeTax
    }

    return Number(deposit?.principalAmount || 0)
  }

  const addExistingTenureToDate = (dateValue, deposit) => {
    if (!dateValue) {
      return ''
    }

    const baseDate = new Date(`${dateValue}T00:00:00`)
    if (Number.isNaN(baseDate.getTime())) {
      return ''
    }

    const targetMonthIndex = baseDate.getMonth() + Number(deposit?.tenureMonths || 0)
    const targetYear =
      baseDate.getFullYear() +
      Number(deposit?.tenureYears || 0) +
      Math.floor(targetMonthIndex / 12)
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
    const daysInTargetMonth = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate()
    const targetDate = new Date(
      targetYear,
      normalizedMonthIndex,
      Math.min(baseDate.getDate(), daysInTargetMonth),
    )
    targetDate.setDate(targetDate.getDate() + Number(deposit?.tenureDays || 0))

    return toInputDate(targetDate)
  }

  const openRenewInvestmentPopup = (deposit) => {
    const defaultAmount = getRenewalDefaultAmount(deposit)
    const salaryAllocations = salarySavings.flatMap((saving) => {
      const linkedAmount = (saving.investmentAllocations || [])
        .filter((allocation) => allocation.investmentId === deposit.id && !allocation.isHistorical)
        .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
      return linkedAmount > 0
        ? [{ salarySavingId: saving.id, salaryMonth: saving.salaryMonth, linkedAmount, amount: String(linkedAmount) }]
        : []
    })
    setRenewTargetId(deposit.id)
    setRenewDraft({
      principalAmount: defaultAmount > 0 ? String(defaultAmount) : '',
      maturityBeforeTax: defaultAmount > 0 ? String(defaultAmount) : '',
      actualMaturityCash: defaultAmount > 0 ? String(defaultAmount) : '',
      salaryAllocations,
    })
    setRenewError('')
  }

  const cancelRenewInvestment = () => {
    setRenewTargetId('')
    setRenewDraft({
      principalAmount: '',
      maturityBeforeTax: '',
      actualMaturityCash: '',
      salaryAllocations: [],
    })
    setRenewError('')
  }

  const handleRenewDraftChange = (event) => {
    const { name, value } = event.target
    setRenewDraft((current) => ({
      ...current,
      [name]: value,
    }))
    setRenewError('')
  }

  const submitRenewInvestment = async (event) => {
    event.preventDefault()

    if (!selectedDeposit || renewTargetId !== selectedDeposit.id) {
      return
    }

    if (Number(renewDraft.principalAmount || 0) <= 0) {
      setRenewError('Enter the new investment amount.')
      return
    }
    if (Number(renewDraft.maturityBeforeTax || 0) <= 0) {
      setRenewError('Enter the new maturity value.')
      return
    }
    if (Number(renewDraft.actualMaturityCash || 0) <= 0) {
      setRenewError('Enter the actual maturity cash received.')
      return
    }
    if (Number(renewDraft.principalAmount || 0) > Number(renewDraft.actualMaturityCash || 0)) {
      setRenewError('New investment value cannot exceed actual maturity cash.')
      return
    }
    const salaryAllocationTotal = renewDraft.salaryAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.amount || 0),
      0,
    )
    if (salaryAllocationTotal > Number(renewDraft.principalAmount || 0) + 0.0001) {
      setRenewError('Salary amounts assigned cannot exceed the new investment value.')
      return
    }
    if (renewDraft.salaryAllocations.some((allocation) =>
      Number(allocation.amount || 0) > allocation.linkedAmount + 0.0001,
    )) {
      setRenewError('Each salary amount cannot exceed its amount linked to the existing investment.')
      return
    }

    try {
      await renewInvestment(selectedDeposit, renewDraft)
      cancelRenewInvestment()
    } catch (error) {
      setRenewError(error.message)
    }
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
    setRenewTargetId('')
    setRenewError('')
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
  const renewalInvestmentDate = selectedDeposit?.maturityDate || ''
  const renewalMaturityDate = selectedDeposit
    ? addExistingTenureToDate(renewalInvestmentDate, selectedDeposit)
    : ''
  const isRenewingSelectedDeposit = renewingInvestmentId === selectedDeposit?.id

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

  const detailTimelineItems = buildDepositTimelineItems({
    deposit: selectedDeposit,
    effectiveMaturityDate: selectedEffectiveMaturityDate,
    interestEvents: selectedInterestSummary?.eventRows || [],
    reinvestmentSummary: selectedReinvestmentSummary,
    sourceEvents: selectedSourceEvents,
    formatCurrency,
  }).map((item) => {
    if (item.kind === 'Interest') {
      const event = selectedInterestSummary?.eventRows.find((row) => row.eventId === item.key)
      return {
        ...item,
        canAllocate: Boolean(!isReadOnly && event?.isDue && event.unallocatedAmount > 0),
        onAllocate: event ? () => applyCashFlowSource(event) : null,
        detail: event?.isDue
          ? `${item.detail} Reinvested ${formatCurrency(event.allocatedWithinEventAmount)} · Left ${formatCurrency(event.unallocatedAmount)}.`
          : item.detail,
      }
    }

    if (item.kind === 'Maturity' || item.kind === 'Closed early') {
      return {
        ...item,
        canAllocate: Boolean(
          !isReadOnly &&
          selectedReinvestmentSummary?.isRealized &&
          selectedReinvestmentSummary.uninvestedAmount > 0,
        ),
        onAllocate: fillFromSelectedMaturity,
      }
    }

    return item
  })
  const visibleDetailTimelineItems = showAllTimelineItems
    ? detailTimelineItems
    : detailTimelineItems.slice(0, DETAIL_TIMELINE_PREVIEW_LIMIT)
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

  const listPanelProps = {
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
  }
  const depositsListPanel = <DepositListPanel {...listPanelProps} />

  const detailPanelProps = {
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
  }
  const depositDetailPanel = <DepositDetailPanel {...detailPanelProps} />

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
