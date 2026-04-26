import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import './App.css'
import DepositsView from './features/deposits/DepositsView.jsx'
import DepositEditorView from './features/editor/DepositEditorView.jsx'
import { TODAY, addDays, emptyForm, formatAllocationsText, formatCurrency, formatDate, generateInterestEvents, getCurrentFinancialYearRange, getDateSortValue, getEffectivePayoutMode, getFinancialYearLabelFromDate, getFinancialYearRangeFromLabel, getFundingAllocations, getHolderSearchTokens, getMaturitySourceEventId, getPayoutModeLabel, getPostTdsAmount, hydrateDeposit, needsPeriodicPayoutSetup, normalizeDeposit, parseAllocationEntries, requestJson, sampleDeposits, toYmd } from './features/deposits/depositModel.js'

function App() {
  const [deposits, setDeposits] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 780)
  const [mobileDepositsScreen, setMobileDepositsScreen] = useState('list')
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [mobileDetailSections, setMobileDetailSections] = useState({
    summary: true,
    funding: false,
    maturity: false,
    interest: false,
  })
  const [editorReturnTab, setEditorReturnTab] = useState('dashboard')
  const [editorReturnDepositsScreen, setEditorReturnDepositsScreen] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [searchScope, setSearchScope] = useState('all')
  const [showClosed, setShowClosed] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formValues, setFormValues] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [selectedFundingEventId, setSelectedFundingEventId] = useState('')
  const [fundingAmountDraft, setFundingAmountDraft] = useState('')
  const [archiveTargetId, setArchiveTargetId] = useState(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [interestFocusMode, setInterestFocusMode] = useState('all')
  const [maturityFocusMode, setMaturityFocusMode] = useState('all')
  const currentFinancialYear = useMemo(() => getCurrentFinancialYearRange(TODAY), [])
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(currentFinancialYear.label)
  const activeDeposits = useMemo(
    () => deposits.filter((deposit) => !deposit.isDeleted),
    [deposits],
  )
  const nextSrNo = useMemo(() => {
    const highestSrNo = deposits.reduce((max, deposit) => {
      const srNo = Number(deposit.srNo)
      return Number.isFinite(srNo) ? Math.max(max, srNo) : max
    }, 0)

    return highestSrNo + 1
  }, [deposits])

  useEffect(() => {
    const loadDeposits = async () => {
      try {
        setIsLoading(true)
        setLoadError('')
        const data = await requestJson('/api/deposits')
        const nextDeposits = data.map(hydrateDeposit)
        setDeposits(nextDeposits)
        setSelectedId((current) =>
          current && nextDeposits.some((deposit) => deposit.id === current)
            ? current
            : nextDeposits[0]?.id ?? null,
        )
      } catch (error) {
        const fallbackDeposits = sampleDeposits.map(hydrateDeposit)
        setDeposits(fallbackDeposits)
        setSelectedId(fallbackDeposits[0]?.id ?? null)
        setLoadError(`${error.message}. Showing demo data in memory.`)
      } finally {
        setIsLoading(false)
      }
    }

    loadDeposits()
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth <= 780
      setIsMobile(nextIsMobile)
      if (!nextIsMobile) {
        setMobileDepositsScreen('list')
        setIsMobileFiltersOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const deferredSearch = useDeferredValue(searchText)

  const cashFlowEvents = useMemo(() => {
    const events = []

    activeDeposits.forEach((deposit) => {
      const interestEvents = generateInterestEvents(deposit)
      events.push(...interestEvents)

      const postTdsAmount = getPostTdsAmount(deposit)
      if (postTdsAmount !== null) {
        events.push({
          eventId: getMaturitySourceEventId(deposit.id),
          depositId: deposit.id,
          type: 'Maturity',
          date: deposit.maturityDate,
          amount: postTdsAmount,
          grossAmount: Number(deposit.maturityBeforeTax || postTdsAmount),
          holderName: deposit.holderName,
          bankName: deposit.bankName,
          sourceLabel: 'Post-TDS maturity pool',
          title: `${deposit.bankName} maturity`,
        })
      }
    })

    return events.sort((left, right) => new Date(left.date) - new Date(right.date))
  }, [activeDeposits])

  const financialYearOptions = useMemo(() => {
    const labels = new Set([currentFinancialYear.label])

    activeDeposits.forEach((deposit) => {
      ;[
        deposit.investmentDate,
        deposit.maturityDate,
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

    return activeDeposits
      .filter((deposit) => (showClosed ? true : deposit.status !== 'Closed'))
      .filter((deposit) => {
        if (!query) {
          return true
        }

        const holderTokens = getHolderSearchTokens(deposit.holderName)
        const fundingSourceTokens = getHolderSearchTokens(deposit.fundingSource)

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
            ...holderTokens,
            ...fundingSourceTokens,
            ...getFundingAllocations(deposit).map((allocation) => allocation.eventId),
          ],
          holder: [...holderTokens, deposit.holderName],
          funding: [...fundingSourceTokens, deposit.fundingSource],
          bank: [deposit.bankName, deposit.branchCity, deposit.accountNumber],
          instrument: [deposit.instrumentType, deposit.tenure, deposit.payoutMode],
          group: [deposit.id, ...getFundingAllocations(deposit).map((allocation) => allocation.eventId)],
        }

        return (searchableFields[searchScope] || searchableFields.all)
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((left, right) => getDateSortValue(left.maturityDate) - getDateSortValue(right.maturityDate))
  }, [activeDeposits, deferredSearch, searchScope, showClosed])

  const selectedDeposit =
    activeDeposits.find((deposit) => deposit.id === selectedId) ?? activeDeposits[0] ?? null

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
      const allocatedAmount = allocations.reduce((sum, entry) => sum + entry.amount, 0)
      const allocatedWithinEventAmount = Math.min(allocatedAmount, Number(event.amount || 0))
      const externalTopUpAmount = Math.max(allocatedAmount - Number(event.amount || 0), 0)
      const unallocatedAmount = Math.max(event.amount - allocatedAmount, 0)

      return {
        ...event,
        isDue,
        allocations,
        allocatedAmount,
        allocatedWithinEventAmount,
        externalTopUpAmount,
        unallocatedAmount,
      }
    })

    return {
      totalExpected: eventRows.reduce((sum, event) => sum + Number(event.amount || 0), 0),
      totalAllocated: eventRows.reduce((sum, event) => sum + event.allocatedAmount, 0),
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
  }, [allocationMap, selectedInterestEvents])

  const stats = useMemo(() => {
    const openDeposits = activeDeposits.filter((deposit) => deposit.status === 'Open')
    const closedDeposits = activeDeposits.filter((deposit) => deposit.status === 'Closed')
    const missingPeriodicPayoutDeposits = activeDeposits.filter(needsPeriodicPayoutSetup)
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
    const upcomingMaturities = [...openDeposits]
      .sort((left, right) => getDateSortValue(left.maturityDate) - getDateSortValue(right.maturityDate))
      .slice(0, 3)
    const realisedInterest = closedDeposits
      .filter((deposit) => isWithinCurrentFy(deposit.maturityDate))
      .reduce(
      (sum, deposit) => sum + Number(deposit.totalInterestEarned || 0),
      0,
    )
    const maturedWithPostTds = cashFlowEvents.filter(
      (event) => event.type === 'Maturity' && isWithinCurrentFy(event.date),
    )
    const uninvestedMaturityCash = maturedWithPostTds.reduce((sum, event) => {
      const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
        (childSum, child) => childSum + Number(child.amount || 0),
        0,
      )
      return sum + Math.max(event.amount - allocated, 0)
    }, 0)
    const maturityAwaitingReinvestment = maturedWithPostTds
      .map((event) => {
        const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
          (childSum, child) => childSum + Number(child.amount || 0),
          0,
        )

        return {
          ...event,
          allocatedAmount: Math.min(allocated, Number(event.amount || 0)),
          unallocatedAmount: Math.max(Number(event.amount || 0) - allocated, 0),
        }
      })
      .filter((event) => event.unallocatedAmount > 0)
      .sort((left, right) => new Date(left.date) - new Date(right.date))
    const dueInterestEvents = cashFlowEvents.filter(
      (event) => event.type === 'Interest' && new Date(event.date) <= TODAY && isWithinCurrentFy(event.date),
    )
    const futureInterestEvents = cashFlowEvents.filter(
      (event) => event.type === 'Interest' && new Date(event.date) > TODAY && isWithinCurrentFy(event.date),
    )
    const uninvestedInterestCash = dueInterestEvents.reduce((sum, event) => {
      const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
        (childSum, child) => childSum + Number(child.amount || 0),
        0,
      )
      return sum + Math.max(event.amount - allocated, 0)
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

        return {
          ...event,
          allocatedAmount: Math.min(allocated, Number(event.amount || 0)),
          unallocatedAmount: Math.max(Number(event.amount || 0) - allocated, 0),
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
          pendingAmount: event.unallocatedAmount,
          receiptCount: 1,
          oldestPendingDate: event.date,
        })
        return map
      }, new Map()).values(),
    ).sort((left, right) => new Date(left.oldestPendingDate) - new Date(right.oldestPendingDate))

    const upcomingInterestEvents = cashFlowEvents
      .filter((event) => event.type === 'Interest' && new Date(event.date) >= addDays(TODAY, -1))
      .slice(0, 4)

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

    ownerSummary.sort((left, right) => left.holderName.localeCompare(right.holderName))

    return {
      totalDeposits: activeDeposits.length,
      openDeposits: openDeposits.length,
      closedDeposits: closedDeposits.length,
      openPrincipal,
      realisedInterest,
      upcomingMaturities,
      uninvestedMaturityCash,
      maturityAwaitingReinvestment,
      uninvestedInterestCash,
      futureInterestCash,
      dueInterestAwaitingReinvestment,
      dueInterestAwaitingReinvestmentSummary,
      upcomingInterestEvents,
      missingPeriodicPayoutDeposits,
      ownerSummary,
      currentFinancialYearLabel: selectedFinancialYearRange.label,
    }
  }, [activeDeposits, allocationMap, cashFlowEvents, selectedFinancialYearRange.end, selectedFinancialYearRange.label, selectedFinancialYearRange.start])

  const selectedReinvestmentSummary = selectedDeposit
    ? (() => {
        const children = allocationMap.get(getMaturitySourceEventId(selectedDeposit.id)) ?? []
        const availableAmount = getPostTdsAmount(selectedDeposit)
        const reinvestedAmount = children.reduce(
          (sum, child) => sum + Number(child.amount || 0),
          0,
        )

        return {
          availableAmount,
          reinvestedAmount,
          uninvestedAmount: availableAmount === null ? null : availableAmount - reinvestedAmount,
          childCount: children.length,
          children,
          isRealized: new Date(`${selectedDeposit.maturityDate}T00:00:00`) <= TODAY,
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

  const resetForm = () => {
    setEditingId(null)
    setFormValues(createFreshForm())
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setArchiveTargetId(null)
  }

  const loadDemoData = async () => {
    try {
      setLoadError('')
      setIsLoading(true)
      const nextDeposits = (await requestJson('/api/deposits/reset-demo', {
        method: 'POST',
      })).map(hydrateDeposit)
      setDeposits(nextDeposits)
      setSelectedId(nextDeposits[0]?.id ?? null)
      setActiveTab('dashboard')
      setSelectedFinancialYear(currentFinancialYear.label)
      setInterestFocusMode('all')
      setMaturityFocusMode('all')
      resetForm()
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const startNewDeposit = () => {
    setEditorReturnTab(activeTab)
    setEditorReturnDepositsScreen(mobileDepositsScreen)
    setActiveTab('editor')
    setMobileDepositsScreen('list')
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    resetForm()
  }

  const startEditing = (deposit) => {
    setEditorReturnTab(activeTab)
    setEditorReturnDepositsScreen(mobileDepositsScreen)
    setActiveTab('editor')
    setMobileDepositsScreen('list')
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setEditingId(deposit.id)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setFormValues({
      srNo: deposit.srNo ?? '',
      bankName: deposit.bankName ?? '',
      branchCity: deposit.branchCity ?? '',
      holderName: deposit.holderName ?? '',
      fundingSource: deposit.fundingSource ?? '',
      instrumentType: deposit.instrumentType ?? 'Bank FD',
      payoutMode: getEffectivePayoutMode(deposit) ?? 'on-maturity',
      yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay ?? '',
      interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
      interestPayoutAfterTds: deposit.interestPayoutAfterTds ?? '',
      accountNumber: deposit.accountNumber ?? '',
      tenure: deposit.tenure ?? '',
      interestRate: deposit.interestRate ?? '',
      principalAmount: deposit.principalAmount ?? '',
      investmentDate: deposit.investmentDate ?? '',
      maturityDate: deposit.maturityDate ?? '',
      maturityBeforeTax: deposit.maturityBeforeTax ?? '',
      maturityAfterTax: deposit.maturityAfterTax ?? '',
      totalInterestEarned: deposit.totalInterestEarned ?? '',
      tdsPercent: deposit.tdsPercent ?? '',
      tdsAmount: deposit.tdsAmount ?? '',
      status: deposit.status ?? 'Open',
      allocationsText: formatAllocationsText(getFundingAllocations(deposit)),
      notes: deposit.notes ?? '',
    })
  }

  const startCloning = (deposit) => {
    setEditorReturnTab(activeTab)
    setEditorReturnDepositsScreen(mobileDepositsScreen)
    setActiveTab('editor')
    setMobileDepositsScreen('list')
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setEditingId(null)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setFormValues({
      ...createFreshForm(),
      bankName: deposit.bankName ?? '',
      branchCity: deposit.branchCity ?? '',
      holderName: deposit.holderName ?? '',
      fundingSource: deposit.fundingSource ?? '',
      instrumentType: deposit.instrumentType ?? 'Bank FD',
      payoutMode: deposit.payoutMode ?? 'on-maturity',
      yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay ?? '',
      interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
      interestPayoutAfterTds: deposit.interestPayoutAfterTds ?? '',
      accountNumber: '',
      tenure: deposit.tenure ?? '',
      interestRate: deposit.interestRate ?? '',
      principalAmount: deposit.principalAmount ?? '',
      investmentDate: '',
      maturityDate: '',
      maturityBeforeTax: '',
      maturityAfterTax: '',
      totalInterestEarned: '',
      tdsPercent: deposit.tdsPercent ?? '',
      tdsAmount: '',
      status: 'Open',
      allocationsText: '',
      notes: '',
    })
  }

  const openPendingInterestView = () => {
    setIsMobileNavOpen(false)
    setInterestFocusMode((current) => (current === 'pending' ? 'all' : 'pending'))
    setMaturityFocusMode('all')
    setActiveTab('dashboard')
  }

  const openPendingMaturityView = () => {
    setIsMobileNavOpen(false)
    setMaturityFocusMode((current) => (current === 'pending' ? 'all' : 'pending'))
    setInterestFocusMode('all')
    setActiveTab('dashboard')
  }

  const openDepositFromInterestEvent = (event) => {
    setSelectedId(event.depositId)
    setMobileDepositsScreen('detail')
    setMobileDetailSections({
      summary: true,
      funding: false,
      maturity: false,
      interest: false,
    })
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setActiveTab('deposits')
  }

  const openDepositDetail = (depositId) => {
    setSelectedId(depositId)
    setMobileDepositsScreen('detail')
    setMobileDetailSections({
      summary: true,
      funding: false,
      maturity: false,
      interest: false,
    })
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setActiveTab('deposits')
  }

  const openDepositsList = (options = {}) => {
    const { searchScope: nextSearchScope, searchText: nextSearchText, selectedId: nextSelectedId } = options

    if (nextSearchScope) {
      setSearchScope(nextSearchScope)
    }
    if (typeof nextSearchText === 'string') {
      setSearchText(nextSearchText)
    }
    if (nextSelectedId !== undefined) {
      setSelectedId(nextSelectedId)
    }

    setMobileDepositsScreen('list')
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setActiveTab('deposits')
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
    setFormErrors((current) => {
      if (!current[name]) {
        return current
      }

      const next = { ...current }
      delete next[name]
      return next
    })
  }

  const handleFundingSourceSelect = (event) => {
    const nextEventId = event.target.value
    setSelectedFundingEventId(nextEventId)
    const selectedOption = fundingSourceOptions.find((option) => option.eventId === nextEventId)
    setFundingAmountDraft(
      selectedOption
        ? String(selectedOption.currentLinkedAmount || selectedOption.availableAmount || '')
        : '',
    )
  }

  const addFundingEntry = () => {
    if (!selectedFundingEventId) {
      return
    }

    const parsedAmount = Number(fundingAmountDraft)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return
    }

    const selectedOption = fundingSourceOptions.find((option) => option.eventId === selectedFundingEventId)
    const maxAllowed = Number(
      selectedOption?.currentLinkedAmount || selectedOption?.availableAmount || 0,
    )
    if (parsedAmount > maxAllowed) {
      return
    }

    const nextEntries = fundingEntries.filter((entry) => entry.eventId !== selectedFundingEventId)
    nextEntries.push({
      eventId: selectedFundingEventId,
      amount: parsedAmount,
    })

    setFormValues((current) => ({
      ...current,
      allocationsText: formatAllocationsText(nextEntries),
    }))
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
  }

  const removeFundingEntry = (eventId) => {
    const nextEntries = fundingEntries.filter((entry) => entry.eventId !== eventId)
    setFormValues((current) => ({
      ...current,
      allocationsText: formatAllocationsText(nextEntries),
    }))
  }

  const handleSave = async (event) => {
    event.preventDefault()

    const effectiveFormValues =
      formValues.instrumentType === 'SCSS' && formValues.payoutMode !== 'quarterly-fy'
        ? { ...formValues, payoutMode: 'quarterly-fy' }
        : formValues

    const nextErrors = {}

    if (!effectiveFormValues.bankName.trim()) {
      nextErrors.bankName = 'Enter bank or issuer name.'
    }
    if (!effectiveFormValues.holderName.trim()) {
      nextErrors.holderName = 'Choose the holder.'
    }
    if (!effectiveFormValues.accountNumber.trim()) {
      nextErrors.accountNumber = 'Enter account or certificate number.'
    }
    if (effectiveFormValues.principalAmount === '' || Number(effectiveFormValues.principalAmount) <= 0) {
      nextErrors.principalAmount = 'Enter the amount being invested.'
    }
    if (!effectiveFormValues.investmentDate) {
      nextErrors.investmentDate = 'Enter the investment date.'
    }
    if (!effectiveFormValues.maturityDate) {
      nextErrors.maturityDate = 'Enter the maturity date.'
    }
    if (effectiveFormValues.payoutMode === 'yearly-fixed' && !effectiveFormValues.yearlyPayoutMonthDay) {
      nextErrors.yearlyPayoutMonthDay = 'Enter the interest payment date in MM-DD format.'
    }
    if (
      effectiveFormValues.payoutMode !== 'on-maturity' &&
      effectiveFormValues.interestPayoutAfterTds === ''
    ) {
      nextErrors.interestPayoutAfterTds = 'Enter the amount actually received each payout.'
    }
    if (fundingDifference !== null && fundingDifference < 0) {
      nextErrors.allocationsText = 'Linked funding cannot be more than the deposit amount.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      return
    }

    setFormErrors({})

    const normalized = normalizeDeposit(effectiveFormValues, editingId, nextSrNo)

    try {
      setLoadError('')
      const savedDeposit = hydrateDeposit(
        editingId
          ? await requestJson(`/api/deposits/${editingId}`, {
              method: 'PUT',
              body: JSON.stringify(normalized),
            })
          : await requestJson('/api/deposits', {
              method: 'POST',
              body: JSON.stringify(normalized),
            }),
      )

      startTransition(() => {
        setDeposits((current) => {
          if (editingId) {
            return current.map((deposit) => (deposit.id === editingId ? savedDeposit : deposit))
          }

          return [savedDeposit, ...current]
        })
      })

      setSelectedId(savedDeposit.id)
      setActiveTab('deposits')
      setMobileDepositsScreen(isMobile ? 'detail' : 'list')
      resetForm()
    } catch (error) {
      setLoadError(error.message)
    }
  }

  const applyCashFlowSource = (cashFlowEvent) => {
    setEditorReturnTab('deposits')
    setEditorReturnDepositsScreen('detail')
    setEditingId(null)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    const suggestedAmount = Number(
      cashFlowEvent.unallocatedAmount ?? cashFlowEvent.amount ?? 0,
    )
    setFormValues({
      ...createFreshForm(),
      fundingSource: cashFlowEvent.holderName || emptyForm.fundingSource,
      principalAmount: suggestedAmount,
      allocationsText: formatAllocationsText([
        {
          eventId: cashFlowEvent.eventId,
          amount: suggestedAmount,
        },
      ]),
    })
    setActiveTab('editor')
  }

  const startArchive = () => {
    if (!selectedDeposit) {
      return
    }

    setArchiveTargetId(selectedDeposit.id)
  }

  const cancelArchive = () => {
    setArchiveTargetId(null)
  }

  const confirmArchive = async () => {
    if (!selectedDeposit || archiveTargetId !== selectedDeposit.id || isArchiving) {
      return
    }

    try {
      setIsArchiving(true)
      setLoadError('')
      const archivedDeposit = hydrateDeposit(
        await requestJson(`/api/deposits/${selectedDeposit.id}/archive`, {
          method: 'POST',
        }),
      )

      startTransition(() => {
        setDeposits((current) =>
          current.map((deposit) => (deposit.id === archivedDeposit.id ? archivedDeposit : deposit)),
        )
      })

      const remainingDeposits = activeDeposits.filter((deposit) => deposit.id !== selectedDeposit.id)
      setSelectedId(remainingDeposits[0]?.id ?? null)
      setActiveTab(remainingDeposits.length > 0 ? 'deposits' : 'dashboard')
      setMobileDepositsScreen('list')
      if (editingId === selectedDeposit.id) {
        resetForm()
      }
      setArchiveTargetId(null)
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setIsArchiving(false)
    }
  }

  const fillFromSelectedMaturity = () => {
    if (!selectedDeposit || !selectedReinvestmentSummary?.isRealized) {
      return
    }

    setEditorReturnTab('deposits')
    setEditorReturnDepositsScreen('detail')
    setEditingId(null)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    const payout =
      selectedReinvestmentSummary.uninvestedAmount > 0
        ? selectedReinvestmentSummary.uninvestedAmount
        : selectedDeposit.maturityAfterTax || selectedDeposit.maturityBeforeTax || selectedDeposit.principalAmount

    setFormValues({
      ...createFreshForm(),
      fundingSource: selectedDeposit.holderName || emptyForm.fundingSource,
      principalAmount: payout,
      allocationsText: formatAllocationsText([
        {
          eventId: getMaturitySourceEventId(selectedDeposit.id),
          amount: Number(payout || 0),
        },
      ]),
    })
    setActiveTab('editor')
    setMobileDepositsScreen('list')
  }

  const fillFromAllAvailableInterest = () => {
    if (!selectedDeposit) {
      return
    }

    const availableInterestEntries = selectedInterestSummary.eventRows
      .filter((event) => event.isDue && event.unallocatedAmount > 0)
      .map((event) => ({
        eventId: event.eventId,
        amount: Number(event.unallocatedAmount || 0),
      }))

    if (availableInterestEntries.length === 0) {
      return
    }

    const totalAvailableInterest = availableInterestEntries.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    )

    setEditorReturnTab('deposits')
    setEditorReturnDepositsScreen('detail')
    setEditingId(null)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setFormValues({
      ...createFreshForm(),
      fundingSource: selectedDeposit.holderName || emptyForm.fundingSource,
      principalAmount: totalAvailableInterest,
      allocationsText: formatAllocationsText(availableInterestEntries),
    })
    setActiveTab('editor')
    setMobileDepositsScreen('list')
  }

  const effectiveEditorPayoutMode =
    formValues.instrumentType === 'SCSS' && formValues.payoutMode !== 'quarterly-fy'
      ? 'quarterly-fy'
      : formValues.payoutMode

  const isPeriodicEditor = effectiveEditorPayoutMode !== 'on-maturity'
  const fundingEntries = parseAllocationEntries(formValues.allocationsText)
  const linkedFundingAmount = fundingEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const principalAmountValue = Number(formValues.principalAmount || 0)
  const fundingDifference =
    formValues.principalAmount === '' ? null : principalAmountValue - linkedFundingAmount
  const sourcePreviewEvents = fundingEntries
    .map((entry) => cashFlowMap.get(entry.eventId))
    .filter(Boolean)
  const computedEditorInterestEarned =
    formValues.maturityAfterTax !== '' && formValues.principalAmount !== ''
      ? Math.max(Number(formValues.maturityAfterTax || 0) - Number(formValues.principalAmount || 0), 0)
      : 0
  const computedEditorTdsAmount =
    formValues.maturityAfterTax !== '' && formValues.maturityBeforeTax !== ''
      ? Math.max(Number(formValues.maturityBeforeTax || 0) - Number(formValues.maturityAfterTax || 0), 0)
      : 0
  const createFreshForm = (overrides = {}) => ({
    ...emptyForm,
    srNo: String(nextSrNo),
    investmentDate: toYmd(TODAY),
    ...overrides,
  })
  const fundingEntriesByEventId = new Map(
    fundingEntries.map((entry) => [entry.eventId, Number(entry.amount || 0)]),
  )
  const fundingSourceOptions = cashFlowEvents
      .map((event) => {
        const eventTime = new Date(`${event.date}T00:00:00`).getTime()
        const isRealized = !Number.isNaN(eventTime) && eventTime <= TODAY.getTime()
        const allocatedByOthers = (allocationMap.get(event.eventId) ?? []).reduce((sum, entry) => {
          if (editingId && entry.deposit.id === editingId) {
            return sum
          }

          return sum + Number(entry.amount || 0)
        }, 0)
        const currentLinkedAmount = fundingEntriesByEventId.get(event.eventId) ?? 0
        const availableAmount = Math.max(Number(event.amount || 0) - allocatedByOthers, 0)
        const canUse = availableAmount > 0 || currentLinkedAmount > 0

        return {
          ...event,
          availableAmount,
          currentLinkedAmount,
          canUse,
          isRealized,
          label:
            event.type === 'Interest'
              ? `${event.bankName} interest • ${formatDate(event.date)} • ${formatCurrency(availableAmount)} available`
              : `${event.bankName} maturity • ${formatDate(event.date)} • ${formatCurrency(availableAmount)} available`,
        }
      })
      .filter((event) => event.canUse && event.isRealized)
      .sort((left, right) => new Date(left.date) - new Date(right.date))

  const leaveEditorScreen = () => {
    setIsMobileNavOpen(false)
    setActiveTab(editorReturnTab === 'editor' ? 'dashboard' : editorReturnTab)
    if (editorReturnTab === 'deposits') {
      setMobileDepositsScreen(editorReturnDepositsScreen)
    } else {
      setMobileDepositsScreen('list')
    }
  }

  const isMobileEditorScreen = isMobile && activeTab === 'editor'
  const mobileEditorTitle = editingId ? 'Edit deposit' : 'Add deposit'
  const hasActiveDepositFilters = searchScope !== 'all' || searchText.trim() !== '' || !showClosed
  const mobileCompactHeaderTitle =
    activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'deposits' ? 'Deposits' : mobileEditorTitle
  const mobileFilterBadges = [
    searchScope !== 'all' ? `Scope: ${searchScope === 'holder'
      ? 'Holder'
      : searchScope === 'funding'
        ? 'Funding'
        : searchScope === 'bank'
          ? 'Bank/account'
          : searchScope === 'instrument'
            ? 'Instrument'
            : 'ID/source'}` : null,
    searchText.trim() ? `Search: ${searchText.trim()}` : null,
    !showClosed ? 'Open only' : null,
  ].filter(Boolean)
  const showMobileCompactHeader = isMobile && activeTab === 'deposits'
  const showFullHeroCard = !isMobileEditorScreen && !showMobileCompactHeader

  const toggleMobileDetailSection = (sectionKey) => {
    setMobileDetailSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  return (
    <div className="shell">
      {showMobileCompactHeader && (
        <header className="mobile-page-bar">
          <div>
            <p className="eyebrow">FD Tracker</p>
            <strong className="mobile-active-tab">{mobileCompactHeaderTitle}</strong>
          </div>
          <button
            type="button"
            className="menu-btn"
            onClick={() => setIsMobileNavOpen((current) => !current)}
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-sections"
          >
            {isMobileNavOpen ? 'Close' : 'Menu'}
          </button>
        </header>
      )}

      {showFullHeroCard && (
        <header className="hero-card">
          <div className="hero-mobile-bar">
            <div>
              <p className="eyebrow">FD Tracker</p>
              <strong className="mobile-active-tab">
                {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'deposits' ? 'Deposits' : editingId ? 'Edit deposit' : 'Add deposit'}
              </strong>
            </div>
            <button
              type="button"
              className="menu-btn"
              onClick={() => setIsMobileNavOpen((current) => !current)}
              aria-expanded={isMobileNavOpen}
              aria-controls="mobile-sections"
            >
              {isMobileNavOpen ? 'Close' : 'Menu'}
            </button>
          </div>
          <div>
            <p className="eyebrow">Mobile First FD Tracker</p>
            <h1>Track maturity, quarterly interest, annual bond payouts, and reinvestment.</h1>
            <p className="hero-copy">
              This version now treats interest credits as separate cash sources, so SCSS quarterly
              payouts and RBI or REC style annual payouts can be tracked and linked to new deposits.
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-btn" onClick={startNewDeposit}>
              Add deposit
            </button>
            {selectedReinvestmentSummary?.isRealized && selectedReinvestmentSummary.uninvestedAmount > 0 && (
              <button type="button" className="secondary-btn" onClick={fillFromSelectedMaturity}>
                Use maturity source
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={loadDemoData}>
              Load demo data
            </button>
          </div>
        </header>
      )}

      {(isLoading || loadError) && (
        <section className={loadError ? 'status-banner error' : 'status-banner'}>
          {isLoading ? 'Loading deposits from MongoDB...' : loadError}
        </section>
      )}

      {!isLoading && stats.missingPeriodicPayoutDeposits.length > 0 && (
        <section className="status-banner warning">
          {stats.missingPeriodicPayoutDeposits.length} periodic-interest records still need payout
          amounts before the schedule can be trusted.
        </section>
      )}

      {!isMobileEditorScreen && (
        <nav
          id="mobile-sections"
          className={isMobileNavOpen ? 'tab-bar mobile-open' : 'tab-bar'}
          aria-label="Sections"
        >
          {[
            ['dashboard', 'Dashboard'],
            ['deposits', 'Deposits'],
            ['editor', editingId ? 'Edit' : 'Add'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={activeTab === value ? 'tab active' : 'tab'}
              onClick={() => {
                setActiveTab(value)
                if (value === 'deposits') {
                  setMobileDepositsScreen('list')
                }
                setIsMobileNavOpen(false)
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {activeTab === 'dashboard' && (
        <section className="dashboard-layout">
          <div className="stack">
            <article className="panel">
              <div className="section-head">
                <div>
                  <h2>Overview</h2>
                  <p>Choose the financial year for these dashboard summaries.</p>
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

            <div className="stats-grid">
              <article className="stat-card accent">
                <span>Active principal</span>
                <strong>{formatCurrency(stats.openPrincipal)}</strong>
                <small>{stats.openDeposits} open</small>
              </article>
              <article className="stat-card">
                <span>Interest realised</span>
                <strong>{formatCurrency(stats.realisedInterest)}</strong>
                <small>FY {stats.currentFinancialYearLabel}</small>
              </article>
              <article className="stat-card">
                <span>Unused maturity cash</span>
                <strong>{formatCurrency(stats.uninvestedMaturityCash)}</strong>
                <small>FY {stats.currentFinancialYearLabel}</small>
                <button type="button" className="mini-link" onClick={openPendingMaturityView}>
                  {maturityFocusMode === 'pending' ? 'Back to timeline' : 'View cash to reinvest'}
                </button>
              </article>
              <article className="stat-card warning">
                <span>Interest not reused</span>
                <strong>{formatCurrency(stats.uninvestedInterestCash)}</strong>
                <small>FY {stats.currentFinancialYearLabel}</small>
                <button type="button" className="mini-link" onClick={openPendingInterestView}>
                  {interestFocusMode === 'pending'
                    ? 'Back to timeline'
                    : 'View cash to reinvest'}
                </button>
              </article>
              <article className="stat-card">
                <span>Upcoming interest</span>
                <strong>{formatCurrency(stats.futureInterestCash)}</strong>
                <small>FY {stats.currentFinancialYearLabel}</small>
              </article>
            </div>

            <article className="panel">
              <div className="section-head">
                <div>
                  <h2>
                    {maturityFocusMode === 'pending' ? 'Maturity to reinvest' : 'Maturity timeline'}
                  </h2>
                  <p>
                    {maturityFocusMode === 'pending'
                      ? 'Closed deposits whose maturity cash is still waiting to be reused.'
                      : 'The next maturity dates to watch.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-btn compact"
                  onClick={() =>
                    setMaturityFocusMode((current) => (current === 'pending' ? 'all' : 'pending'))
                  }
                >
                  {maturityFocusMode === 'pending' ? 'Back to timeline' : 'View cash to reinvest'}
                </button>
              </div>
              <div className="list">
                {(maturityFocusMode === 'pending'
                  ? stats.maturityAwaitingReinvestment
                  : stats.upcomingMaturities
                ).map((deposit) => (
                  <button
                    key={maturityFocusMode === 'pending' ? deposit.eventId : deposit.id}
                    type="button"
                    className="deposit-card"
                    onClick={() =>
                      openDepositDetail(maturityFocusMode === 'pending' ? deposit.depositId : deposit.id)
                    }
                  >
                    <div className="deposit-topline">
                      <strong>{deposit.bankName}</strong>
                      <span className={deposit.status === 'Closed' ? 'pill closed' : 'pill open'}>
                        {deposit.status || deposit.type}
                      </span>
                    </div>
                    <p>
                      {deposit.holderName} | {deposit.instrumentType || 'Maturity'}
                    </p>
                    <p>
                      {maturityFocusMode === 'pending'
                        ? `Still to reinvest ${formatCurrency(deposit.unallocatedAmount)}`
                        : `Matures on ${formatDate(deposit.maturityDate)}`}
                    </p>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="section-head">
                <div>
                  <h2>
                    {interestFocusMode === 'pending' ? 'Interest to reinvest' : 'Interest timeline'}
                  </h2>
                  <p>
                    {interestFocusMode === 'pending'
                      ? 'Interest already received but not yet fully reused.'
                      : 'Upcoming interest receipts that may be reused.'}
                  </p>
                </div>
                {interestFocusMode === 'pending' && (
                  <button
                    type="button"
                    className="secondary-btn compact"
                    onClick={() => setInterestFocusMode('all')}
                  >
                    Back to timeline
                  </button>
                )}
              </div>
              <div className="list">
                {(interestFocusMode === 'pending'
                  ? stats.dueInterestAwaitingReinvestmentSummary
                  : stats.upcomingInterestEvents
                ).length > 0 ? (
                  (interestFocusMode === 'pending'
                    ? stats.dueInterestAwaitingReinvestmentSummary
                    : stats.upcomingInterestEvents
                  ).map((event) => (
                    <button
                      key={interestFocusMode === 'pending' ? event.depositId : event.eventId}
                      type="button"
                      className="deposit-card"
                      onClick={() => openDepositFromInterestEvent(event)}
                    >
                      <div className="deposit-topline">
                        <strong>{event.bankName}</strong>
                        <span className="pill open">
                          {interestFocusMode === 'pending' ? 'Pending interest' : event.type}
                        </span>
                      </div>
                      <p>
                        {event.holderName} |{' '}
                        {formatCurrency(
                          interestFocusMode === 'pending' ? event.pendingAmount : event.amount,
                        )}
                      </p>
                      <p>
                        {interestFocusMode === 'pending'
                          ? `${event.receiptCount} received interest receipts pending`
                          : formatDate(event.date)}
                      </p>
                      {interestFocusMode === 'pending' && (
                        <p className="inline-warning">
                          Total pending for this investment {formatCurrency(event.pendingAmount)}
                        </p>
                      )}
                    </button>
                  ))
                ) : (
                  <p className="lineage-empty">
                    {interestFocusMode === 'pending'
                      ? 'No received interest is waiting for reinvestment.'
                      : 'No upcoming periodic interest payouts in the schedule.'}
                  </p>
                )}
              </div>
            </article>
          </div>

          <aside className="stack">
            <div className={isMobileEditorScreen ? 'section-head editor-intro mobile-editor-intro' : 'section-head editor-intro'}>
              <div>
                <h2>Owners</h2>
                <p>Open amount by holder.</p>
              </div>
            </div>
            <div className="owner-grid">
              {stats.ownerSummary.map((owner) => (
                <button
                  key={owner.holderName}
                  type="button"
                  className="owner-card"
                  onClick={() => {
                    openDepositsList({
                      searchScope: 'holder',
                      searchText: owner.holderName,
                      selectedId:
                        filteredDeposits.find((deposit) => deposit.holderName === owner.holderName)?.id ??
                        activeDeposits.find((deposit) => deposit.holderName === owner.holderName)?.id ??
                        null,
                    })
                  }}
                >
                  <div className="owner-card-head">
                    <strong>{owner.holderName}</strong>
                    <span>{owner.openDeposits} open</span>
                  </div>
                  <div className="owner-card-value">{formatCurrency(owner.principalAmount)}</div>
                  <p className="owner-card-subtitle">Active principal</p>
                  <p className="owner-card-foot">Next maturity {formatDate(owner.nextMaturityDate)}</p>
                </button>
              ))}
            </div>
          </aside>
        </section>
      )}

      {activeTab === 'deposits' && (
        <DepositsView
          isMobile={isMobile}
          mobileDepositsScreen={mobileDepositsScreen}
          isMobileFiltersOpen={isMobileFiltersOpen}
          setIsMobileFiltersOpen={setIsMobileFiltersOpen}
          hasActiveDepositFilters={hasActiveDepositFilters}
          mobileFilterBadges={mobileFilterBadges}
          searchScope={searchScope}
          setSearchScope={setSearchScope}
          searchText={searchText}
          setSearchText={setSearchText}
          showClosed={showClosed}
          setShowClosed={setShowClosed}
          filteredDeposits={filteredDeposits}
          selectedId={selectedId}
          selectedDeposit={selectedDeposit}
          selectedSourceEvents={selectedSourceEvents}
          selectedReinvestmentSummary={selectedReinvestmentSummary}
          selectedInterestEvents={selectedInterestEvents}
          selectedInterestSummary={selectedInterestSummary}
          archiveTargetId={archiveTargetId}
          isArchiving={isArchiving}
          startNewDeposit={startNewDeposit}
          openDepositDetail={openDepositDetail}
          setMobileDepositsScreen={setMobileDepositsScreen}
          startCloning={startCloning}
          startEditing={startEditing}
          startArchive={startArchive}
          cancelArchive={cancelArchive}
          confirmArchive={confirmArchive}
          fillFromSelectedMaturity={fillFromSelectedMaturity}
          fillFromAllAvailableInterest={fillFromAllAvailableInterest}
          applyCashFlowSource={applyCashFlowSource}
          mobileDetailSections={mobileDetailSections}
          toggleMobileDetailSection={toggleMobileDetailSection}
          needsPeriodicPayoutSetup={needsPeriodicPayoutSetup}
          getPayoutModeLabel={getPayoutModeLabel}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      )}

      {activeTab === 'editor' && (
        <DepositEditorView
          isMobileEditorScreen={isMobileEditorScreen}
          mobileEditorTitle={mobileEditorTitle}
          editingId={editingId}
          leaveEditorScreen={leaveEditorScreen}
          formValues={formValues}
          sourcePreviewEvents={sourcePreviewEvents}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formErrors={formErrors}
          handleFormChange={handleFormChange}
          effectiveEditorPayoutMode={effectiveEditorPayoutMode}
          isPeriodicEditor={isPeriodicEditor}
          linkedFundingAmount={linkedFundingAmount}
          fundingDifference={fundingDifference}
          selectedFundingEventId={selectedFundingEventId}
          handleFundingSourceSelect={handleFundingSourceSelect}
          fundingSourceOptions={fundingSourceOptions}
          fundingAmountDraft={fundingAmountDraft}
          setFundingAmountDraft={setFundingAmountDraft}
          addFundingEntry={addFundingEntry}
          fundingEntries={fundingEntries}
          cashFlowMap={cashFlowMap}
          removeFundingEntry={removeFundingEntry}
          computedEditorInterestEarned={computedEditorInterestEarned}
          computedEditorTdsAmount={computedEditorTdsAmount}
          handleSave={handleSave}
          resetForm={resetForm}
        />
      )}
    </div>
  )
}

export default App
