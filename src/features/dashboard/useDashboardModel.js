import { useMemo } from 'react'
import {
  TODAY,
  addDays,
  formatTenure,
  generateInterestEvents,
  getCashSettlements,
  getDateSortValue,
  getEffectiveMaturityDate,
  getFinancialYearLabelFromDate,
  getFinancialYearRangeFromLabel,
  getFundingAllocations,
  getHolderSearchTokens,
  getMaturitySourceEventId,
  getPostTdsAmount,
  needsPeriodicPayoutSetup,
} from '../deposits/depositModel.js'
import {
  summarizeActiveInvestmentsByIssuer,
  summarizeUpcomingInterestEvents,
} from './dashboardModel.js'

const getSearchDateTokens = (value) => {
  if (!value) {
    return []
  }

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return [String(value)]
  }

  const day = `${date.getDate()}`.padStart(2, '0')
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const year = `${date.getFullYear()}`
  const monthShort = date.toLocaleDateString('en-IN', { month: 'short' }).toLowerCase()

  return [
    value,
    `${day}/${month}/${year}`,
    `${day}-${month}-${year}`,
    `${day} ${monthShort} ${year}`,
    `${day} ${date.toLocaleDateString('en-IN', { month: 'long' }).toLowerCase()} ${year}`,
  ]
}

const getDateFilterTime = (value, boundary = 'start') => {
  if (!value) {
    return null
  }

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999)
  }

  return date.getTime()
}

export default function useDashboardModel({
  DASHBOARD_PREVIEW_LIMIT,
  DASHBOARD_UPCOMING_CASH_WINDOW_DAYS,
  activeDeposits,
  currentFinancialYear,
  deferredSearch,
  effectiveTaxSummary,
  interestFocusMode,
  investmentDateFrom,
  investmentDateTo,
  maturityDateFrom,
  maturityDateTo,
  maturityFocusMode,
  ownerAliasLookup,
  searchScope,
  selectedDashboardOwner,
  selectedFinancialYear,
  selectedId,
  showAllInterestItems,
  showAllMaturityItems,
  showAllReinvestmentItems,
  showClosed,
}) {
  const cashFlowEvents = useMemo(() => {
    const events = []

    activeDeposits.forEach((deposit) => {
      const interestEvents = generateInterestEvents(deposit)
      events.push(...interestEvents)

      const postTdsAmount = getPostTdsAmount(deposit)
      if (postTdsAmount !== null) {
        const realizationDate = getEffectiveMaturityDate(deposit)
        events.push({
          eventId: getMaturitySourceEventId(deposit.id),
          depositId: deposit.id,
          type: 'Maturity',
          date: realizationDate,
          contractualMaturityDate: deposit.maturityDate,
          closureDate: deposit.closureDate || '',
          amount: postTdsAmount,
          grossAmount: Number(deposit.maturityBeforeTax || postTdsAmount),
          holderName: deposit.holderName,
          bankName: deposit.bankName,
          accountNumber: deposit.accountNumber,
          sourceLabel: 'Post-TDS maturity pool',
          title: `${deposit.bankName} maturity`,
        })
      }
    })

    return events.sort((left, right) => new Date(left.date) - new Date(right.date))
  }, [activeDeposits])

  const normalizedSelectedDashboardOwner = String(selectedDashboardOwner || '').trim().toLowerCase()

  const dashboardScopedDeposits = useMemo(
    () =>
      normalizedSelectedDashboardOwner
        ? activeDeposits.filter(
            (deposit) =>
              String(deposit.holderName || '').trim().toLowerCase() === normalizedSelectedDashboardOwner,
          )
        : activeDeposits,
    [activeDeposits, normalizedSelectedDashboardOwner],
  )

  const dashboardScopedCashFlowEvents = useMemo(
    () =>
      normalizedSelectedDashboardOwner
        ? cashFlowEvents.filter(
            (event) =>
              String(event.holderName || '').trim().toLowerCase() === normalizedSelectedDashboardOwner,
          )
        : cashFlowEvents,
    [cashFlowEvents, normalizedSelectedDashboardOwner],
  )

  const financialYearOptions = useMemo(() => {
    const labels = new Set([currentFinancialYear.label])

    activeDeposits.forEach((deposit) => {
      ;[
        deposit.investmentDate,
        deposit.maturityDate,
        deposit.closureDate,
      ].forEach((value) => {
        const label = getFinancialYearLabelFromDate(value)
        if (label) {
          labels.add(label)
        }
      })
    })

    cashFlowEvents.forEach((event) => {
      const label = getFinancialYearLabelFromDate(event.date)
      if (label) {
        labels.add(label)
      }
    })

    return Array.from(labels).sort().reverse()
  }, [activeDeposits, cashFlowEvents, currentFinancialYear.label])

  const selectedFinancialYearRange = useMemo(
    () => getFinancialYearRangeFromLabel(selectedFinancialYear),
    [selectedFinancialYear],
  )

  const cashFlowMap = useMemo(
    () => new Map(cashFlowEvents.map((event) => [event.eventId, event])),
    [cashFlowEvents],
  )

  const settlementMap = useMemo(() => {
    const map = new Map()

    activeDeposits.forEach((deposit) => {
      getCashSettlements(deposit).forEach((settlement) => {
        const current = map.get(settlement.eventId) ?? []
        map.set(settlement.eventId, [...current, { deposit, ...settlement }])
      })
    })

    return map
  }, [activeDeposits])

  const allocationMap = useMemo(() => {
    const map = new Map()

    activeDeposits.forEach((deposit) => {
      getFundingAllocations(deposit).forEach((allocation) => {
        const eventId = allocation.eventId
        const current = map.get(eventId) ?? []
        map.set(eventId, [...current, { deposit, amount: Number(allocation.amount || 0) }])
      })
    })

    return map
  }, [activeDeposits])

  const filteredDeposits = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const queryTerms = query.split(/\s+/).filter(Boolean)
    const investmentFromTime = getDateFilterTime(investmentDateFrom, 'start')
    const investmentToTime = getDateFilterTime(investmentDateTo, 'end')
    const maturityFromTime = getDateFilterTime(maturityDateFrom, 'start')
    const maturityToTime = getDateFilterTime(maturityDateTo, 'end')

    return activeDeposits
      .filter((deposit) => (showClosed ? true : deposit.status !== 'Closed'))
      .filter((deposit) => {
        const investmentTime = getDateFilterTime(deposit.investmentDate, 'start')
        const maturityTime = getDateFilterTime(deposit.maturityDate, 'start')

        if (investmentFromTime !== null && (investmentTime === null || investmentTime < investmentFromTime)) {
          return false
        }
        if (investmentToTime !== null && (investmentTime === null || investmentTime > investmentToTime)) {
          return false
        }
        if (maturityFromTime !== null && (maturityTime === null || maturityTime < maturityFromTime)) {
          return false
        }
        if (maturityToTime !== null && (maturityTime === null || maturityTime > maturityToTime)) {
          return false
        }

        return true
      })
      .filter((deposit) => {
        if (queryTerms.length === 0) {
          return true
        }

        const holderTokens = getHolderSearchTokens(deposit.holderName, ownerAliasLookup)
        const fundingSourceTokens = getHolderSearchTokens(deposit.fundingSource, ownerAliasLookup)
        const dateTokens = [
          ...getSearchDateTokens(deposit.investmentDate),
          ...getSearchDateTokens(deposit.maturityDate),
        ]

        const searchableFields = {
          all: [
            deposit.bankName,
            deposit.branchCity,
            deposit.holderName,
            deposit.fundingSource,
            deposit.accountNumber,
            deposit.id,
            deposit.instrumentType,
            deposit.payoutMode,
            deposit.investmentDate,
            deposit.maturityDate,
            ...dateTokens,
            ...holderTokens,
            ...fundingSourceTokens,
            ...getFundingAllocations(deposit).map((allocation) => allocation.eventId),
          ],
          holder: [...holderTokens, deposit.holderName],
          funding: [...fundingSourceTokens, deposit.fundingSource],
          bank: [deposit.bankName, deposit.branchCity, deposit.accountNumber],
          dates: dateTokens,
          instrument: [
            deposit.instrumentType,
            formatTenure(deposit),
            deposit.tenureYears,
            deposit.tenureMonths,
            deposit.tenureDays,
            deposit.payoutMode,
          ],
          group: [deposit.id, ...getFundingAllocations(deposit).map((allocation) => allocation.eventId)],
        }

        const haystack = (searchableFields[searchScope] || searchableFields.all)
          .join(' ')
          .toLowerCase()

        return queryTerms.every((term) => haystack.includes(term))
      })
      .sort((left, right) => getDateSortValue(left.maturityDate) - getDateSortValue(right.maturityDate))
  }, [activeDeposits, deferredSearch, investmentDateFrom, investmentDateTo, maturityDateFrom, maturityDateTo, ownerAliasLookup, searchScope, showClosed])

  const selectedDeposit =
    activeDeposits.find((deposit) => deposit.id === selectedId) ?? null

  const selectedInterestEvents = useMemo(
    () => (selectedDeposit ? generateInterestEvents(selectedDeposit) : []),
    [selectedDeposit],
  )

  const selectedInterestSummary = useMemo(() => {
    const eventRows = selectedInterestEvents.map((event) => {
      const isDue = new Date(event.date) <= TODAY
      const allocations = (allocationMap.get(event.eventId) ?? []).map((entry) => ({
        ...entry,
        amount: Number(entry.amount || 0),
      }))
      const settlements = (settlementMap.get(event.eventId) ?? []).map((entry) => ({
        ...entry,
        amount: Number(entry.amount || 0),
      }))
      const allocatedAmount = allocations.reduce((sum, entry) => sum + entry.amount, 0)
      const settledAmount = settlements.reduce((sum, entry) => sum + entry.amount, 0)
      const allocatedWithinEventAmount = Math.min(allocatedAmount, Number(event.amount || 0))
      const externalTopUpAmount = Math.max(allocatedAmount - Number(event.amount || 0), 0)
      const unallocatedAmount = Math.max(event.amount - allocatedAmount - settledAmount, 0)

      return {
        ...event,
        isDue,
        allocations,
        settlements,
        allocatedAmount,
        allocatedWithinEventAmount,
        settledAmount,
        externalTopUpAmount,
        unallocatedAmount,
      }
    })

    return {
      totalExpected: eventRows.reduce((sum, event) => sum + Number(event.amount || 0), 0),
      totalAllocated: eventRows.reduce((sum, event) => sum + event.allocatedAmount, 0),
      totalSettled: eventRows.reduce((sum, event) => sum + event.settledAmount, 0),
      totalUnallocated: eventRows.reduce((sum, event) => sum + event.unallocatedAmount, 0),
      totalExternalTopUp: eventRows.reduce((sum, event) => sum + event.externalTopUpAmount, 0),
      totalDueExpected: eventRows.reduce(
        (sum, event) => sum + (event.isDue ? Number(event.amount || 0) : 0),
        0,
      ),
      totalDueAllocated: eventRows.reduce(
        (sum, event) => sum + (event.isDue ? event.allocatedWithinEventAmount : 0),
        0,
      ),
      totalDueSettled: eventRows.reduce(
        (sum, event) => sum + (event.isDue ? event.settledAmount : 0),
        0,
      ),
      totalDueUnallocated: eventRows.reduce(
        (sum, event) => sum + (event.isDue ? event.unallocatedAmount : 0),
        0,
      ),
      totalFutureExpected: eventRows.reduce(
        (sum, event) => sum + (event.isDue ? 0 : Number(event.amount || 0)),
        0,
      ),
      eventRows,
    }
  }, [allocationMap, selectedInterestEvents, settlementMap])

  const stats = useMemo(() => {
    const openDeposits = dashboardScopedDeposits.filter((deposit) => deposit.status === 'Open')
    const closedDeposits = dashboardScopedDeposits.filter((deposit) => deposit.status === 'Closed')
    const missingPeriodicPayoutDeposits = dashboardScopedDeposits.filter(needsPeriodicPayoutSetup)
    const isWithinCurrentFy = (value) => {
      const time = new Date(value).getTime()
      return (
        !Number.isNaN(time) &&
        time >= selectedFinancialYearRange.start.getTime() &&
        time <= selectedFinancialYearRange.end.getTime()
      )
    }
    const openPrincipal = openDeposits.reduce(
      (sum, deposit) => sum + Number(deposit.principalAmount || 0),
      0,
    )
    const nextCashWindowCutoff = addDays(TODAY, DASHBOARD_UPCOMING_CASH_WINDOW_DAYS)
    const upcomingMaturities = [...openDeposits]
      .sort((left, right) => getDateSortValue(left.maturityDate) - getDateSortValue(right.maturityDate))
    const maturityInterestRealizationEvents = dashboardScopedDeposits
      .filter((deposit) => isWithinCurrentFy(getEffectiveMaturityDate(deposit)))
      .map((deposit) => {
        const principalAmount = Number(deposit.principalAmount || 0)
        const maturityBeforeTax = Number(deposit.maturityBeforeTax || 0)
        const grossInterestAmount = Math.max(maturityBeforeTax - principalAmount, 0)
        const netInterestAmount = Math.max(Number(deposit.maturityAfterTax || 0) - principalAmount, 0)
        const realizationDate = getEffectiveMaturityDate(deposit)

        return {
          eventId: `realized-maturity-interest:${deposit.id}`,
          depositId: deposit.id,
          type: 'Maturity interest',
          date: realizationDate,
          contractualMaturityDate: deposit.maturityDate,
          closureDate: deposit.closureDate || '',
          amount: grossInterestAmount,
          grossAmount: grossInterestAmount,
          netAmount: netInterestAmount,
          tdsAmount: Math.max(grossInterestAmount - netInterestAmount, 0),
          holderName: deposit.holderName,
          bankName: deposit.bankName,
          accountNumber: deposit.accountNumber,
          instrumentType: deposit.instrumentType,
          status: deposit.status,
          receiptCount: 1,
          sourceLabel: 'Maturity interest',
        }
      })
      .filter((event) => event.amount > 0 || event.grossAmount > 0)
    const periodicInterestRealizationEvents = dashboardScopedCashFlowEvents
      .filter((event) => event.type === 'Interest' && isWithinCurrentFy(event.date))
      .map((event) => {
        const grossAmount = Number(event.grossAmount || 0)
        const netAmount = Number(event.amount || 0)

        return {
          ...event,
          type: 'Periodic interest',
          amount: grossAmount,
          grossAmount,
          netAmount,
          tdsAmount: Math.max(grossAmount - netAmount, 0),
          instrumentType: event.sourceLabel || 'Interest payout',
          receiptCount: 1,
        }
      })
    const interestRealizationEvents = [
      ...maturityInterestRealizationEvents,
      ...periodicInterestRealizationEvents,
    ].sort((left, right) => new Date(left.date) - new Date(right.date))
    const realizedInterestToDateEvents = interestRealizationEvents.filter((event) => new Date(event.date) <= TODAY)
    const realisedInterest = realizedInterestToDateEvents.reduce(
      (sum, event) => sum + Number(event.amount || 0),
      0,
    )
    const realisedInterestTds = realizedInterestToDateEvents.reduce(
      (sum, event) => sum + Number(event.tdsAmount || 0),
      0,
    )
    const realisedNetInterest = realizedInterestToDateEvents.reduce(
      (sum, event) => sum + Number(event.netAmount ?? event.amount ?? 0),
      0,
    )
    const maturedWithPostTds = dashboardScopedCashFlowEvents.filter(
      (event) =>
        event.type === 'Maturity' &&
        new Date(event.date) <= TODAY &&
        isWithinCurrentFy(event.date),
    )
    const uninvestedMaturityCash = maturedWithPostTds.reduce((sum, event) => {
      const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
        (childSum, child) => childSum + Number(child.amount || 0),
        0,
      )
      const settled = (settlementMap.get(event.eventId) ?? []).reduce(
        (settlementSum, entry) => settlementSum + Number(entry.amount || 0),
        0,
      )
      return sum + Math.max(event.amount - allocated - settled, 0)
    }, 0)
    const maturityAwaitingReinvestment = maturedWithPostTds
      .map((event) => {
        const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
          (childSum, child) => childSum + Number(child.amount || 0),
          0,
        )
        const settled = (settlementMap.get(event.eventId) ?? []).reduce(
          (settlementSum, entry) => settlementSum + Number(entry.amount || 0),
          0,
        )

        return {
          ...event,
          allocatedAmount: Math.min(allocated, Number(event.amount || 0)),
          settledAmount: settled,
          unallocatedAmount: Math.max(Number(event.amount || 0) - allocated - settled, 0),
        }
      })
      .filter((event) => event.unallocatedAmount > 0)
      .sort((left, right) => new Date(left.date) - new Date(right.date))
    const dueInterestEvents = dashboardScopedCashFlowEvents.filter(
      (event) => event.type === 'Interest' && new Date(event.date) <= TODAY && isWithinCurrentFy(event.date),
    )
    const futureInterestEvents = dashboardScopedCashFlowEvents.filter(
      (event) => event.type === 'Interest' && new Date(event.date) > TODAY && isWithinCurrentFy(event.date),
    )
    const upcomingCashFlowNext30Days = dashboardScopedCashFlowEvents.filter((event) => {
      const eventDate = new Date(event.date)
      return eventDate >= TODAY && eventDate <= nextCashWindowCutoff
    })
    const maturingSoonDeposits = openDeposits
      .filter((deposit) => {
        if (!deposit.maturityDate) {
          return false
        }

        const maturityDate = new Date(`${deposit.maturityDate}T00:00:00`)
        return maturityDate >= TODAY && maturityDate <= nextCashWindowCutoff
      })
      .sort((left, right) => getDateSortValue(left.maturityDate) - getDateSortValue(right.maturityDate))
    const uninvestedInterestCash = dueInterestEvents.reduce((sum, event) => {
      const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
        (childSum, child) => childSum + Number(child.amount || 0),
        0,
      )
      const settled = (settlementMap.get(event.eventId) ?? []).reduce(
        (settlementSum, entry) => settlementSum + Number(entry.amount || 0),
        0,
      )
      return sum + Math.max(event.amount - allocated - settled, 0)
    }, 0)
    const futureInterestCash = futureInterestEvents.reduce(
      (sum, event) => sum + Number(event.amount || 0),
      0,
    )
    const dueInterestAwaitingReinvestment = dueInterestEvents
      .map((event) => {
        const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
          (childSum, child) => childSum + Number(child.amount || 0),
          0,
        )
        const settled = (settlementMap.get(event.eventId) ?? []).reduce(
          (settlementSum, entry) => settlementSum + Number(entry.amount || 0),
          0,
        )

        return {
          ...event,
          allocatedAmount: Math.min(allocated, Number(event.amount || 0)),
          settledAmount: settled,
          unallocatedAmount: Math.max(Number(event.amount || 0) - allocated - settled, 0),
        }
      })
      .filter((event) => event.unallocatedAmount > 0)
      .sort((left, right) => new Date(left.date) - new Date(right.date))

    const dueInterestAwaitingReinvestmentSummary = Array.from(
      dueInterestAwaitingReinvestment.reduce((map, event) => {
        const current = map.get(event.depositId)
        if (current) {
          current.pendingAmount += event.unallocatedAmount
          current.receiptCount += 1
          if (new Date(event.date) < new Date(current.oldestPendingDate)) {
            current.oldestPendingDate = event.date
          }
          return map
        }

        map.set(event.depositId, {
          depositId: event.depositId,
          bankName: event.bankName,
          holderName: event.holderName,
          accountNumber: event.accountNumber,
          pendingAmount: event.unallocatedAmount,
          receiptCount: 1,
          oldestPendingDate: event.date,
        })
        return map
      }, new Map()).values(),
    ).sort((left, right) => new Date(left.oldestPendingDate) - new Date(right.oldestPendingDate))

    const upcomingInterestEvents = dashboardScopedCashFlowEvents
      .filter((event) => event.type === 'Interest' && new Date(event.date) >= addDays(TODAY, -1))
    const upcomingInterestSummary = Array.from(
      futureInterestEvents.reduce((map, event) => {
        const current = map.get(event.depositId)
        if (current) {
          current.futureAmount += Number(event.amount || 0)
          current.receiptCount += 1
          if (new Date(event.date) < new Date(current.nextPaymentDate)) {
            current.nextPaymentDate = event.date
          }
          return map
        }

        map.set(event.depositId, {
          depositId: event.depositId,
          bankName: event.bankName,
          holderName: event.holderName,
          accountNumber: event.accountNumber,
          futureAmount: Number(event.amount || 0),
          receiptCount: 1,
          nextPaymentDate: event.date,
          type: event.type,
        })
        return map
      }, new Map()).values(),
    )
      .sort((left, right) => new Date(left.nextPaymentDate) - new Date(right.nextPaymentDate))

    const ownerSummary = Array.from(
      activeDeposits.reduce((map, deposit) => {
        const key = deposit.holderName || 'Unknown'
        const current = map.get(key) ?? {
          holderName: key,
          totalDeposits: 0,
          openDeposits: 0,
          principalAmount: 0,
          pendingInterestAmount: 0,
          futureInterestAmount: 0,
          upcomingCashAmount: 0,
          nextMaturityDate: '',
        }

        current.totalDeposits += 1
        if (deposit.status === 'Open') {
          current.openDeposits += 1
          current.principalAmount += Number(deposit.principalAmount || 0)

          if (
            deposit.maturityDate &&
            (!current.nextMaturityDate ||
              getDateSortValue(deposit.maturityDate) < getDateSortValue(current.nextMaturityDate))
          ) {
            current.nextMaturityDate = deposit.maturityDate
          }
        }

        map.set(key, current)
        return map
      }, new Map()).values(),
    )

    dueInterestAwaitingReinvestment.forEach((event) => {
      const owner = ownerSummary.find((entry) => entry.holderName === event.holderName)
      if (owner) {
        owner.pendingInterestAmount += event.unallocatedAmount
      }
    })

    futureInterestEvents.forEach((event) => {
      const owner = ownerSummary.find((entry) => entry.holderName === event.holderName)
      if (owner) {
        owner.futureInterestAmount += Number(event.amount || 0)
      }
    })

    upcomingCashFlowNext30Days.forEach((event) => {
      const owner = ownerSummary.find((entry) => entry.holderName === event.holderName)
      if (owner) {
        owner.upcomingCashAmount += Number(event.amount || 0)
      }
    })

    ownerSummary.sort((left, right) => left.holderName.localeCompare(right.holderName))

    return {
      totalDeposits: dashboardScopedDeposits.length,
      openDeposits: openDeposits.length,
      closedDeposits: closedDeposits.length,
      openPrincipal,
      realisedInterest,
      realisedInterestTds,
      realisedNetInterest,
      upcomingCashNext30Days: upcomingCashFlowNext30Days.reduce(
        (sum, event) => sum + Number(event.amount || 0),
        0,
      ),
      upcomingInterestEventsNextWindow: upcomingCashFlowNext30Days.filter(
        (event) => event.type === 'Interest',
      ),
      maturingSoonCount: maturingSoonDeposits.length,
      maturingSoonAmount: maturingSoonDeposits.reduce(
        (sum, deposit) => sum + Number(deposit.principalAmount || 0),
        0,
      ),
      upcomingMaturities,
      uninvestedMaturityCash,
      maturityAwaitingReinvestment,
      uninvestedInterestCash,
      futureInterestCash,
      interestRealizationEvents: realizedInterestToDateEvents,
      dueInterestAwaitingReinvestment,
      dueInterestAwaitingReinvestmentSummary,
      upcomingInterestEvents,
      upcomingInterestSummary,
      missingPeriodicPayoutDeposits,
      ownerSummary,
      currentFinancialYearLabel: selectedFinancialYearRange.label,
    }
  }, [activeDeposits, allocationMap, DASHBOARD_UPCOMING_CASH_WINDOW_DAYS, dashboardScopedCashFlowEvents, dashboardScopedDeposits, selectedFinancialYearRange.end, selectedFinancialYearRange.label, selectedFinancialYearRange.start, settlementMap])

  const ownerInvestmentIssuerBreakdown = useMemo(
    () => summarizeActiveInvestmentsByIssuer(dashboardScopedDeposits),
    [dashboardScopedDeposits],
  )

  const ownerDashboardCards = useMemo(() => {
    return stats.ownerSummary.map((owner) => ({
      ...owner,
      fyContribution: 0,
      fyContributionShare: 0,
      largestSourceLabel: '',
    }))
  }, [stats.ownerSummary])

  const dashboardTaxHighlights = useMemo(() => {
    return {
      totalTaxableInterest: Number(
        effectiveTaxSummary?.consolidatedPortfolioSummary?.totalEstimatedTaxableInterest || 0,
      ),
    }
  }, [effectiveTaxSummary])

  const maturityDashboardItems =
    maturityFocusMode === 'pending'
      ? stats.maturityAwaitingReinvestment
      : stats.upcomingMaturities

  const visibleMaturityDashboardItems = showAllMaturityItems
    ? maturityDashboardItems
    : maturityDashboardItems.slice(0, DASHBOARD_PREVIEW_LIMIT)

  const realizedInterestInvestmentGroups = useMemo(() => {
    const depositsById = new Map(
      dashboardScopedDeposits.map((deposit) => [deposit.id, deposit]),
    )
    const contributionsByDepositId = new Map()

    stats.interestRealizationEvents.forEach((event) => {
      const deposit = depositsById.get(event.depositId)
      if (!deposit) {
        return
      }

      const grossInterest = Number(event.amount || 0)
      const tdsAmount = Number(event.tdsAmount || 0)
      const netInterest = Number(event.netAmount ?? event.amount ?? 0)
      if (grossInterest <= 0 && tdsAmount <= 0 && netInterest <= 0) {
        return
      }

      const current = contributionsByDepositId.get(deposit.id) ?? {
        deposit,
        grossInterest: 0,
        tdsAmount: 0,
        netInterest: 0,
        maturityReceiptCount: 0,
        periodicReceiptCount: 0,
        receiptEvents: [],
      }

      current.grossInterest += grossInterest
      current.tdsAmount += tdsAmount
      current.netInterest += netInterest
      if (event.type === 'Maturity interest') {
        current.maturityReceiptCount += 1
      } else {
        current.periodicReceiptCount += 1
      }
      current.receiptEvents.push({ type: event.type, date: event.date })
      contributionsByDepositId.set(deposit.id, current)
    })

    const groupsByOwner = new Map()
    contributionsByDepositId.forEach((contribution) => {
      const ownerName = contribution.deposit.holderName || 'Unassigned owner'
      const group = groupsByOwner.get(ownerName) ?? { ownerName, investments: [] }
      group.investments.push(contribution)
      groupsByOwner.set(ownerName, group)
    })

    return Array.from(groupsByOwner.values())
      .map((group) => ({
        ...group,
        investments: group.investments.sort(
          (left, right) =>
            getDateSortValue(left.deposit.maturityDate) -
              getDateSortValue(right.deposit.maturityDate) ||
            String(left.deposit.bankName || '').localeCompare(String(right.deposit.bankName || '')),
        ),
      }))
      .sort((left, right) => left.ownerName.localeCompare(right.ownerName))
  }, [dashboardScopedDeposits, stats.interestRealizationEvents])

  const interestDashboardItems =
    interestFocusMode === 'pending'
      ? stats.dueInterestAwaitingReinvestmentSummary
      : interestFocusMode === 'realizing'
        ? stats.interestRealizationEvents
        : interestFocusMode === 'upcoming'
          ? summarizeUpcomingInterestEvents(stats.upcomingInterestEventsNextWindow)
          : stats.upcomingInterestSummary

  const visibleInterestDashboardItems = showAllInterestItems
    ? interestDashboardItems
    : interestDashboardItems.slice(0, DASHBOARD_PREVIEW_LIMIT)

  const reinvestmentDashboardItems = useMemo(
    () =>
      [
        ...stats.maturityAwaitingReinvestment.map((event) => ({
          ...event,
          reinvestmentType: 'Maturity cash',
          availableAmount: event.unallocatedAmount,
        })),
        ...stats.dueInterestAwaitingReinvestment.map((event) => ({
          ...event,
          reinvestmentType: 'Interest cash',
          availableAmount: event.unallocatedAmount,
        })),
      ].sort((left, right) => new Date(left.date) - new Date(right.date)),
    [stats.dueInterestAwaitingReinvestment, stats.maturityAwaitingReinvestment],
  )

  const visibleReinvestmentDashboardItems = showAllReinvestmentItems
    ? reinvestmentDashboardItems
    : reinvestmentDashboardItems.slice(0, DASHBOARD_PREVIEW_LIMIT)

  const selectedReinvestmentSummary = selectedDeposit
    ? (() => {
        const children = allocationMap.get(getMaturitySourceEventId(selectedDeposit.id)) ?? []
        const settlements = settlementMap.get(getMaturitySourceEventId(selectedDeposit.id)) ?? []
        const availableAmount = getPostTdsAmount(selectedDeposit)
        const realizationDate = getEffectiveMaturityDate(selectedDeposit)
        const reinvestedAmount = children.reduce(
          (sum, child) => sum + Number(child.amount || 0),
          0,
        )
        const settledAmount = settlements.reduce(
          (sum, entry) => sum + Number(entry.amount || 0),
          0,
        )

        return {
          availableAmount,
          reinvestedAmount,
          settledAmount,
          settlements,
          uninvestedAmount: availableAmount === null ? null : Math.max(availableAmount - reinvestedAmount - settledAmount, 0),
          childCount: children.length,
          children,
          realizationDate,
          isRealized: new Date(`${realizationDate}T00:00:00`) <= TODAY,
        }
      })()
    : null

  const selectedSourceEvents = useMemo(
    () =>
      selectedDeposit
        ? getFundingAllocations(selectedDeposit)
            .map((allocation) => {
              const event = cashFlowMap.get(allocation.eventId)
              return event ? { ...event, allocatedAmount: allocation.amount } : null
            })
            .filter(Boolean)
        : [],
    [cashFlowMap, selectedDeposit],
  )

  return {
    allocationMap,
    cashFlowEvents,
    cashFlowMap,
    dashboardTaxHighlights,
    filteredDeposits,
    financialYearOptions,
    interestDashboardItems,
    maturityDashboardItems,
    normalizedSelectedDashboardOwner,
    ownerDashboardCards,
    ownerInvestmentIssuerBreakdown,
    realizedInterestInvestmentGroups,
    reinvestmentDashboardItems,
    selectedDeposit,
    selectedInterestEvents,
    selectedInterestSummary,
    selectedReinvestmentSummary,
    selectedSourceEvents,
    settlementMap,
    stats,
    visibleInterestDashboardItems,
    visibleMaturityDashboardItems,
    visibleReinvestmentDashboardItems,
  }
}
