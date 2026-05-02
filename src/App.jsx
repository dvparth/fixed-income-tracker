import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import './App.css'
import AdminView from './features/admin/AdminView.jsx'
import AuthView from './features/auth/AuthView.jsx'
import DepositsView from './features/deposits/DepositsView.jsx'
import DepositEditorView from './features/editor/DepositEditorView.jsx'
import MastersView from './features/masters/MastersView.jsx'
import PortfolioAccessPanel from './features/sharing/PortfolioAccessPanel.jsx'
import FyTaxView from './features/tax/FyTaxView.jsx'
import { downloadInvestmentsWorkbook } from './features/admin/exportWorkbook.js'
import { TODAY, addDays, computeTdsAmount, computeTdsPercent, deriveTenureParts, emptyForm, formatAllocationsText, formatCurrency, formatDate, formatTenure, generateInterestEvents, getCashSettlements, getCurrentFinancialYearRange, getDateSortValue, getEffectivePayoutMode, getFinancialYearLabelFromDate, getFinancialYearRangeFromLabel, getFundingAllocations, getHolderSearchTokens, getMaturitySourceEventId, getPayoutModeLabel, getPostTdsAmount, hydrateDeposit, needsPeriodicPayoutSetup, normalizeDeposit, parseAllocationEntries, requestJson, toYmd } from './features/deposits/depositModel.js'
import { buildOwnerAliasLookup, emptyMasterData, normalizeMasterData } from '../shared/masterData.js'

const ADD_NEW_MASTER_VALUE = '__add_new_master__'
const THEME_STORAGE_KEY = 'yieldflow.theme'
const createEmptySessionState = () => ({
  authenticated: false,
  user: null,
  accessiblePortfolios: [],
  activePortfolioOwnerId: '',
})

const normalizeSessionState = (sessionResponse = {}) => ({
  authenticated: Boolean(sessionResponse.authenticated),
  user: sessionResponse.user || null,
  accessiblePortfolios: Array.isArray(sessionResponse.accessiblePortfolios)
    ? sessionResponse.accessiblePortfolios
    : [],
  activePortfolioOwnerId: String(
    sessionResponse.activePortfolioOwnerId || sessionResponse.user?.id || '',
  ),
})

const buildOwnerScopedPath = (path, ownerUserId) => {
  if (!ownerUserId) {
    return path
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}ownerUserId=${encodeURIComponent(ownerUserId)}`
}

const formatEditableNumber = (value, precision = 4) => {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) {
    return ''
  }

  return Number(Number(value).toFixed(precision)).toString()
}

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

function App() {
  const [sessionState, setSessionState] = useState(createEmptySessionState)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState('')
  const [themeClass, setThemeClass] = useState(
    () => globalThis.localStorage?.getItem(THEME_STORAGE_KEY) || 'theme-midnight-navy',
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activePortfolioOwnerId, setActivePortfolioOwnerId] = useState('')
  const [sharesState, setSharesState] = useState({ ownerShares: [], sharedWithMe: [] })
  const [shareEmail, setShareEmail] = useState('')
  const [isSubmittingShare, setIsSubmittingShare] = useState(false)
  const [shareFeedback, setShareFeedback] = useState(null)
  const [isDownloadingWorkbook, setIsDownloadingWorkbook] = useState(false)
  const [deposits, setDeposits] = useState([])
  const [masterData, setMasterData] = useState(emptyMasterData)
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
  const [investmentDateFrom, setInvestmentDateFrom] = useState('')
  const [investmentDateTo, setInvestmentDateTo] = useState('')
  const [maturityDateFrom, setMaturityDateFrom] = useState('')
  const [maturityDateTo, setMaturityDateTo] = useState('')
  const [showClosed, setShowClosed] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formValues, setFormValues] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const setIsMobileNavOpen = () => {}
  const [selectedFundingEventId, setSelectedFundingEventId] = useState('')
  const [fundingAmountDraft, setFundingAmountDraft] = useState('')
  const [archiveTargetId, setArchiveTargetId] = useState(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settlingEventId, setSettlingEventId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [portfolioReloadSeed, setPortfolioReloadSeed] = useState(0)
  const [interestFocusMode, setInterestFocusMode] = useState('all')
  const [maturityFocusMode, setMaturityFocusMode] = useState('all')
  const [isSavingMasters, setIsSavingMasters] = useState(false)
  const [mastersFeedback, setMastersFeedback] = useState(null)
  const [mastersIntent, setMastersIntent] = useState(null)
  const [mastersViewSeed, setMastersViewSeed] = useState(0)
  const [mastersReturnTarget, setMastersReturnTarget] = useState(null)
  const [activeHelpKey, setActiveHelpKey] = useState(null)
  const currentFinancialYear = useMemo(() => getCurrentFinancialYearRange(TODAY), [])
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(currentFinancialYear.label)
  const [isTaxViewOpen, setIsTaxViewOpen] = useState(false)
  const [taxSummary, setTaxSummary] = useState(null)
  const [isLoadingTaxSummary, setIsLoadingTaxSummary] = useState(false)
  const [taxSummaryError, setTaxSummaryError] = useState('')
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
  const currentEditingDeposit = useMemo(
    () => (editingId ? deposits.find((deposit) => deposit.id === editingId) ?? null : null),
    [deposits, editingId],
  )

  useEffect(() => {
    const loadSession = async () => {
      try {
        setIsLoading(true)
        setLoadError('')
        const sessionResponse = normalizeSessionState(await requestJson('/api/auth/session'))

        if (!sessionResponse.authenticated) {
          setSessionState(createEmptySessionState())
          setActivePortfolioOwnerId('')
          setDeposits([])
          setMasterData(emptyMasterData)
          setSelectedId(null)
          return
        }

        setSessionState(sessionResponse)
        setActivePortfolioOwnerId(sessionResponse.activePortfolioOwnerId)
      } catch (error) {
        setLoadError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadSession()
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

  useEffect(() => {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, themeClass)
  }, [themeClass])

  useEffect(() => {
    if (!sessionState.authenticated || !activePortfolioOwnerId) {
      return undefined
    }

    let isMounted = true

    const loadPortfolioData = async () => {
      try {
        setIsLoading(true)
        setLoadError('')
        const [depositsData, masterDataResponse] = await Promise.all([
          requestJson(buildOwnerScopedPath('/api/deposits', activePortfolioOwnerId)),
          requestJson(buildOwnerScopedPath('/api/master-data', activePortfolioOwnerId)).catch(
            () => emptyMasterData,
          ),
        ])

        if (!isMounted) {
          return
        }

        const nextDeposits = depositsData.map(hydrateDeposit)
        setDeposits(nextDeposits)
        setMasterData(normalizeMasterData(masterDataResponse))
        setSelectedId((current) =>
          current && nextDeposits.some((deposit) => deposit.id === current)
            ? current
            : nextDeposits[0]?.id ?? null,
        )
      } catch (error) {
        if (!isMounted) {
          return
        }

        setDeposits([])
        setMasterData(emptyMasterData)
        setSelectedId(null)
        setLoadError(error.message)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadPortfolioData()

    return () => {
      isMounted = false
    }
  }, [activePortfolioOwnerId, portfolioReloadSeed, sessionState.authenticated])

  useEffect(() => {
    if (!sessionState.authenticated) {
      return undefined
    }

    if (sessionState.user?.systemRole === 'admin') {
      return undefined
    }

    let isMounted = true

    const loadShares = async () => {
      try {
        const nextShares = await requestJson('/api/shares')
        if (isMounted) {
          setSharesState(nextShares)
        }
      } catch (error) {
        if (isMounted) {
          setShareFeedback({
            type: 'error',
            message: error.message,
          })
        }
      }
    }

    loadShares()

    return () => {
      isMounted = false
    }
  }, [sessionState.authenticated, sessionState.user?.systemRole])

  useEffect(() => {
    if (!sessionState.authenticated || !activePortfolioOwnerId || !selectedFinancialYear || !isTaxViewOpen) {
      return undefined
    }

    let isMounted = true

    const loadTaxSummary = async () => {
      try {
        setIsLoadingTaxSummary(true)
        setTaxSummaryError('')
        const nextSummary = await requestJson(
          buildOwnerScopedPath(
            `/api/tax-estimation?fy=${encodeURIComponent(selectedFinancialYear)}`,
            activePortfolioOwnerId,
          ),
        )

        if (isMounted) {
          setTaxSummary(nextSummary)
        }
      } catch (error) {
        if (isMounted) {
          setTaxSummary(null)
          setTaxSummaryError(error.message)
        }
      } finally {
        if (isMounted) {
          setIsLoadingTaxSummary(false)
        }
      }
    }

    loadTaxSummary()

    return () => {
      isMounted = false
    }
  }, [activePortfolioOwnerId, deposits, isTaxViewOpen, masterData, selectedFinancialYear, sessionState.authenticated])

  const deferredSearch = useDeferredValue(searchText)
  const ownerAliasLookup = useMemo(() => buildOwnerAliasLookup(masterData), [masterData])
  const activePortfolio =
    sessionState.accessiblePortfolios.find(
      (portfolio) => portfolio.ownerUserId === activePortfolioOwnerId,
    ) ?? null
  const isReadOnlyPortfolio = activePortfolio?.accessType === 'guest'
  const isAdminUser = sessionState.user?.systemRole === 'admin'
  const canEditPortfolio = sessionState.authenticated && (isAdminUser || !isReadOnlyPortfolio)
  const canUseAdmin = isAdminUser
  const canDeletePortfolio = isAdminUser
  const activePortfolioLabel =
    activePortfolio?.accessType === 'guest' || activePortfolio?.accessType === 'admin'
      ? `${activePortfolio.ownerDisplayName}'s portfolio`
      : 'your portfolio'

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
          accountNumber: deposit.accountNumber,
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

    const upcomingInterestEvents = cashFlowEvents
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
      upcomingInterestSummary,
      missingPeriodicPayoutDeposits,
      ownerSummary,
      currentFinancialYearLabel: selectedFinancialYearRange.label,
    }
  }, [activeDeposits, allocationMap, cashFlowEvents, selectedFinancialYearRange.end, selectedFinancialYearRange.label, selectedFinancialYearRange.start, settlementMap])

  const selectedReinvestmentSummary = selectedDeposit
    ? (() => {
        const children = allocationMap.get(getMaturitySourceEventId(selectedDeposit.id)) ?? []
        const settlements = settlementMap.get(getMaturitySourceEventId(selectedDeposit.id)) ?? []
        const availableAmount = getPostTdsAmount(selectedDeposit)
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
    setDeleteTargetId(null)
  }

  const startNewDeposit = () => {
    if (!canEditPortfolio) {
      return
    }

    setEditorReturnTab(activeTab)
    setEditorReturnDepositsScreen(mobileDepositsScreen)
    setActiveTab('editor')
    setMobileDepositsScreen('list')
    setIsMobileNavOpen(false)
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    resetForm()
  }

  const saveMasterData = async (nextMasterData) => {
    if (!canEditPortfolio) {
      return
    }

    try {
      setIsSavingMasters(true)
      setMastersFeedback(null)
      setLoadError('')
      const savedMasterData = normalizeMasterData(
        await requestJson(buildOwnerScopedPath('/api/master-data', activePortfolioOwnerId), {
          method: 'PUT',
          body: JSON.stringify(nextMasterData),
        }),
      )
      setMasterData(savedMasterData)
      setMastersFeedback({
        type: 'success',
        message: 'Master data saved.',
      })
      if (mastersReturnTarget === 'editor') {
        setActiveTab('editor')
      }
      setMastersReturnTarget(null)
    } catch (error) {
      setMastersFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsSavingMasters(false)
    }
  }

  const startEditing = (deposit) => {
    if (!canEditPortfolio) {
      return
    }

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
      instrumentType: deposit.instrumentType ?? '',
      calculationFrequency: deposit.calculationFrequency ?? '',
      payoutMode: getEffectivePayoutMode(deposit) ?? 'on-maturity',
      yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay ?? '',
      interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
      interestPayoutAfterTds: deposit.interestPayoutAfterTds ?? '',
      accountNumber: deposit.accountNumber ?? '',
      tenureYears: deposit.tenureYears ?? '',
      tenureMonths: deposit.tenureMonths ?? '',
      tenureDays: deposit.tenureDays ?? '',
      interestRate: formatEditableNumber(deposit.interestRate),
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
    if (!canEditPortfolio) {
      return
    }

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
      instrumentType: deposit.instrumentType ?? '',
      calculationFrequency: deposit.calculationFrequency ?? '',
      payoutMode: deposit.payoutMode ?? 'on-maturity',
      yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay ?? '',
      interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
      interestPayoutAfterTds: deposit.interestPayoutAfterTds ?? '',
      accountNumber: '',
      tenureYears: deposit.tenureYears ?? '',
      tenureMonths: deposit.tenureMonths ?? '',
      tenureDays: deposit.tenureDays ?? '',
      interestRate: formatEditableNumber(deposit.interestRate),
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

  const openDepositFromInterestEvent = (event) => {
    openDepositDrilldown(
      event.depositId,
      event.accountNumber || event.depositId,
    )
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

  const openDepositDrilldown = (depositId, searchTextValue = '') => {
    setSearchScope('all')
    setSearchText(String(searchTextValue || '').trim())
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

  const refreshSessionState = async () => {
    const nextSession = normalizeSessionState(await requestJson('/api/auth/session'))
    if (!nextSession.authenticated) {
      setSessionState(createEmptySessionState())
      setActivePortfolioOwnerId('')
      return null
    }

    setSessionState(nextSession)
    setActivePortfolioOwnerId((current) => {
      if (
        current &&
        nextSession.accessiblePortfolios.some((portfolio) => portfolio.ownerUserId === current)
      ) {
        return current
      }

      return nextSession.activePortfolioOwnerId || nextSession.user?.id || ''
    })
    return nextSession
  }

  const handleGoogleAuthenticate = async (credential) => {
    try {
      setIsAuthenticating(true)
      setAuthError('')
      setLoadError('')
      const nextSession = normalizeSessionState(await requestJson('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      }))
      setSessionState(nextSession)
      setActivePortfolioOwnerId(nextSession.activePortfolioOwnerId)
      setShareFeedback(null)
      setIsSettingsOpen(false)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleLogout = async () => {
    try {
      await requestJson('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error(error)
    } finally {
      setSessionState(createEmptySessionState())
      setActivePortfolioOwnerId('')
      setDeposits([])
      setMasterData(emptyMasterData)
      setSelectedId(null)
      setSharesState({ ownerShares: [], sharedWithMe: [] })
      setShareEmail('')
      setShareFeedback(null)
      setAuthError('')
      setActiveTab('dashboard')
      setIsSettingsOpen(false)
    }
  }

  const handleCreateShare = async (event) => {
    event.preventDefault()

    try {
      setIsSubmittingShare(true)
      setShareFeedback(null)
      const createdShare = await requestJson('/api/shares', {
        method: 'POST',
        body: JSON.stringify({ guestEmail: shareEmail }),
      })
      setSharesState((current) => ({
        ...current,
        ownerShares: [...current.ownerShares.filter((share) => share.id !== createdShare.id), createdShare],
      }))
      setShareEmail('')
      setShareFeedback({
        type: 'success',
        message: 'Read-only access granted.',
      })
      await refreshSessionState()
    } catch (error) {
      setShareFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsSubmittingShare(false)
    }
  }

  const handleDeleteShare = async (shareId) => {
    try {
      setShareFeedback(null)
      await requestJson(`/api/shares/${shareId}`, {
        method: 'DELETE',
      })
      setSharesState((current) => ({
        ...current,
        ownerShares: current.ownerShares.filter((share) => share.id !== shareId),
      }))
      setShareFeedback({
        type: 'success',
        message: 'Access removed.',
      })
      await refreshSessionState()
    } catch (error) {
      setShareFeedback({
        type: 'error',
        message: error.message,
      })
    }
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    const nextFormValues = { ...formValues, [name]: value }
    setFormValues(nextFormValues)
    setFormErrors((current) => {
      const next = { ...current }

      if (current[name]) {
        delete next[name]
      }

      if (name === 'status') {
        if (
          value === 'Closed' &&
          String(nextFormValues.maturityAfterTax ?? '').trim() === ''
        ) {
          next.maturityAfterTax = 'Enter amount received at maturity before closing this deposit.'
        } else {
          delete next.maturityAfterTax
        }
      }

      if (name === 'maturityAfterTax' && String(value ?? '').trim() !== '') {
        delete next.maturityAfterTax
      }

      return next
    })
  }

  const openMastersForField = (fieldName) => {
    if (!canEditPortfolio) {
      return
    }

    const nextIntent =
      fieldName === 'holderName' || fieldName === 'fundingSource'
        ? { section: 'owners' }
        : fieldName === 'bankName'
          ? { section: 'institutions' }
          : fieldName === 'branchCity'
            ? { section: 'institutions', mode: 'branch', institutionName: formValues.bankName }
            : fieldName === 'instrumentType'
              ? { section: 'instrumentTypes' }
              : null

    setMastersIntent(nextIntent)
    setMastersViewSeed((current) => current + 1)
    setMastersReturnTarget('editor')
    setMastersFeedback(null)
    setActiveTab('masters')
    setIsMobileNavOpen(false)
  }

  const handleMasterBoundFieldChange = (event) => {
    if (event.target.value === ADD_NEW_MASTER_VALUE) {
      openMastersForField(event.target.name)
      return
    }

    handleFormChange(event)
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
    const maxAllowed = Number(selectedOption?.availableAmount || 0)
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
    setFormErrors((current) => {
      if (!current.allocationsText) {
        return current
      }

      const next = { ...current }
      delete next.allocationsText
      return next
    })
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

  const editFundingEntry = (eventId) => {
    const existingEntry = fundingEntries.find((entry) => entry.eventId === eventId)
    if (!existingEntry) {
      return
    }

    setSelectedFundingEventId(eventId)
    setFundingAmountDraft(String(existingEntry.amount || ''))
  }

  const handleSave = async (event) => {
    event.preventDefault()

    if (!canEditPortfolio) {
      return
    }

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
    if (
      effectiveFormValues.status === 'Closed' &&
      String(effectiveFormValues.maturityAfterTax ?? '').trim() === ''
    ) {
      nextErrors.maturityAfterTax = 'Enter amount received at maturity before closing this deposit.'
    }
    if (
      effectiveFormValues.investmentDate &&
      effectiveFormValues.maturityDate &&
      new Date(`${effectiveFormValues.maturityDate}T00:00:00`) <
        new Date(`${effectiveFormValues.investmentDate}T00:00:00`)
    ) {
      nextErrors.maturityDate = 'Maturity date must be on or after the investment date.'
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

    const normalized = normalizeDeposit(effectiveFormValues, editingId, nextSrNo, currentEditingDeposit)

    try {
      setLoadError('')
      const savedDeposit = hydrateDeposit(
        editingId
          ? await requestJson(buildOwnerScopedPath(`/api/deposits/${editingId}`, activePortfolioOwnerId), {
              method: 'PUT',
              body: JSON.stringify(normalized),
            })
          : await requestJson(buildOwnerScopedPath('/api/deposits', activePortfolioOwnerId), {
              method: 'POST',
              body: JSON.stringify(normalized),
            }),
      )

      startTransition(() => {
        setDeposits((current) => {
          return editingId
            ? current.map((deposit) => (deposit.id === editingId ? savedDeposit : deposit))
            : [savedDeposit, ...current]
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

  const settleCashFlowEvent = async (cashFlowEvent) => {
    if (!canEditPortfolio || !cashFlowEvent?.eventId || !cashFlowEvent?.depositId || settlingEventId) {
      return
    }

    const sourceDeposit = deposits.find((deposit) => deposit.id === cashFlowEvent.depositId)
    if (!sourceDeposit) {
      return
    }

    const allocatedAmount = (allocationMap.get(cashFlowEvent.eventId) ?? []).reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    )
    const settledAmount = (settlementMap.get(cashFlowEvent.eventId) ?? []).reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    )
    const remainingAmount = Math.max(
      Number(cashFlowEvent.unallocatedAmount ?? cashFlowEvent.amount ?? 0),
      Math.max(Number(cashFlowEvent.amount || 0) - allocatedAmount - settledAmount, 0),
    )

    if (remainingAmount <= 0) {
      return
    }

    const existingSettlements = getCashSettlements(sourceDeposit)
    const existingEntry = existingSettlements.find((entry) => entry.eventId === cashFlowEvent.eventId)
    const nextSettlements = existingEntry
      ? existingSettlements.map((entry) =>
          entry.eventId === cashFlowEvent.eventId
            ? {
                ...entry,
                amount: Number(entry.amount || 0) + remainingAmount,
                settledAt: toYmd(new Date()),
              }
            : entry,
        )
      : [
          ...existingSettlements,
          {
            eventId: cashFlowEvent.eventId,
            amount: remainingAmount,
            settledAt: toYmd(new Date()),
          },
        ]

    try {
      setSettlingEventId(cashFlowEvent.eventId)
      setLoadError('')
      const savedDeposit = hydrateDeposit(
        await requestJson(
          buildOwnerScopedPath(`/api/deposits/${sourceDeposit.id}`, activePortfolioOwnerId),
          {
            method: 'PUT',
            body: JSON.stringify({
              ...sourceDeposit,
              cashSettlements: nextSettlements,
            }),
          },
        ),
      )

      startTransition(() => {
        setDeposits((current) =>
          current.map((deposit) => (deposit.id === savedDeposit.id ? savedDeposit : deposit)),
        )
      })
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setSettlingEventId('')
    }
  }

  const applyCashFlowSource = (cashFlowEvent) => {
    if (!canEditPortfolio) {
      return
    }

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
      fundingSource: cashFlowEvent.holderName || '',
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
    if (!canEditPortfolio) {
      return
    }

    if (!selectedDeposit) {
      return
    }

    setDeleteTargetId(null)
    setArchiveTargetId(selectedDeposit.id)
  }

  const cancelArchive = () => {
    setArchiveTargetId(null)
  }

  const startDelete = () => {
    if (!canDeletePortfolio || !selectedDeposit) {
      return
    }

    setArchiveTargetId(null)
    setDeleteTargetId(selectedDeposit.id)
  }

  const cancelDelete = () => {
    setDeleteTargetId(null)
  }

  const confirmArchive = async () => {
    if (!canEditPortfolio) {
      return
    }

    if (!selectedDeposit || archiveTargetId !== selectedDeposit.id || isArchiving) {
      return
    }

    try {
      setIsArchiving(true)
      setLoadError('')
      const archivedDeposit = hydrateDeposit(
        await requestJson(
          buildOwnerScopedPath(`/api/deposits/${selectedDeposit.id}/archive`, activePortfolioOwnerId),
          {
          method: 'POST',
          },
        ),
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

  const confirmDelete = async () => {
    if (!canDeletePortfolio) {
      return
    }

    if (!selectedDeposit || deleteTargetId !== selectedDeposit.id || isDeleting) {
      return
    }

    try {
      setIsDeleting(true)
      setLoadError('')
      await requestJson(
        buildOwnerScopedPath(`/api/deposits/${selectedDeposit.id}`, activePortfolioOwnerId),
        {
          method: 'DELETE',
        },
      )

      startTransition(() => {
        setDeposits((current) =>
          current.filter((deposit) => deposit.id !== selectedDeposit.id),
        )
      })

      const remainingDeposits = activeDeposits.filter((deposit) => deposit.id !== selectedDeposit.id)
      setSelectedId(remainingDeposits[0]?.id ?? null)
      setActiveTab(remainingDeposits.length > 0 ? 'deposits' : 'dashboard')
      setMobileDepositsScreen('list')
      if (editingId === selectedDeposit.id) {
        resetForm()
      }
      setDeleteTargetId(null)
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const fillFromSelectedMaturity = () => {
    if (!canEditPortfolio) {
      return
    }

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
      fundingSource: selectedDeposit.holderName || '',
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
    if (!canEditPortfolio) {
      return
    }

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
      fundingSource: selectedDeposit.holderName || '',
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
  const computedEditorTenure = deriveTenureParts(
    formValues.investmentDate,
    formValues.maturityDate,
  )
  const computedEditorTdsAmount = computeTdsAmount(
    formValues.maturityBeforeTax,
    formValues.maturityAfterTax,
  )
  const computedEditorTdsPercent = computeTdsPercent(
    formValues.principalAmount,
    formValues.maturityBeforeTax,
    formValues.maturityAfterTax,
  )
  const createFreshForm = (overrides = {}) => ({
    ...emptyForm,
    srNo: String(nextSrNo),
    investmentDate: toYmd(TODAY),
    tenureYears: '0',
    tenureMonths: '0',
    tenureDays: '0',
    holderName: masterData.owners[0]?.name || '',
    fundingSource: masterData.owners[0]?.name || '',
    instrumentType: masterData.instrumentTypes[0]?.name || '',
    ...overrides,
  })
  const fundingEntriesByEventId = new Map(
    fundingEntries.map((entry) => [entry.eventId, Number(entry.amount || 0)]),
  )
  const ensureCurrentValue = (items, currentValue) => {
    const normalizedValue = String(currentValue || '').trim()
    if (!normalizedValue) {
      return items
    }

    return items.includes(normalizedValue) ? items : [...items, normalizedValue]
  }
  const ownerOptions = ensureCurrentValue(
    masterData.owners.map((owner) => owner.name),
    formValues.holderName,
  )
  const fundingSourceMasterOptions = ensureCurrentValue(ownerOptions, formValues.fundingSource)
  const institutionOptions = ensureCurrentValue(
    masterData.institutions.map((institution) => institution.name),
    formValues.bankName,
  )
  const branchOptions = useMemo(() => {
    const selectedInstitution = masterData.institutions.find(
      (institution) => institution.name.toLowerCase() === String(formValues.bankName || '').trim().toLowerCase(),
    )

    const options = selectedInstitution
      ? selectedInstitution.branches.map((branch) => branch.name)
      : masterData.institutions.flatMap((institution) => institution.branches.map((branch) => branch.name))

    return ensureCurrentValue(options, formValues.branchCity)
  }, [formValues.bankName, formValues.branchCity, masterData.institutions])
  const instrumentTypeOptions = ensureCurrentValue(
    masterData.instrumentTypes.map((instrument) => instrument.name),
    formValues.instrumentType,
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
        const settledByOthers = (settlementMap.get(event.eventId) ?? []).reduce(
          (sum, entry) => sum + Number(entry.amount || 0),
          0,
        )
        const currentLinkedAmount = fundingEntriesByEventId.get(event.eventId) ?? 0
        const availableAmount = Math.max(Number(event.amount || 0) - allocatedByOthers - settledByOthers, 0)
        const canUse = availableAmount > 0 || currentLinkedAmount > 0

        return {
          ...event,
          availableAmount,
          currentLinkedAmount,
          canUse,
          isRealized,
          label:
            event.type === 'Interest'
              ? `${event.bankName} | ${event.accountNumber || 'No account no.'} | Interest | ${formatDate(event.date)} | ${formatCurrency(availableAmount)} available`
              : `${event.bankName} | ${event.accountNumber || 'No account no.'} | Maturity | ${formatDate(event.date)} | ${formatCurrency(availableAmount)} available`,
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

  const visibleActiveTab =
    !canEditPortfolio && ['editor', 'masters', 'admin'].includes(activeTab)
      ? 'dashboard'
      : activeTab
  const isMobileEditorScreen = isMobile && visibleActiveTab === 'editor'
  const mobileEditorTitle = editingId ? 'Edit deposit' : 'Add deposit'
  const mobileMastersTitle = 'Masters'
  const mobileAdminTitle = 'Admin'
  const hasActiveDepositFilters =
    searchScope !== 'all' ||
    searchText.trim() !== '' ||
    investmentDateFrom !== '' ||
    investmentDateTo !== '' ||
    maturityDateFrom !== '' ||
    maturityDateTo !== '' ||
    !showClosed
  const mobileCompactHeaderTitle =
    visibleActiveTab === 'dashboard'
      ? 'Dashboard'
      : visibleActiveTab === 'deposits'
        ? 'Deposits'
        : visibleActiveTab === 'masters'
          ? mobileMastersTitle
          : visibleActiveTab === 'admin'
            ? mobileAdminTitle
            : mobileEditorTitle
  const mobileFilterBadges = [
    searchScope !== 'all' ? `Scope: ${searchScope === 'holder'
      ? 'Holder'
      : searchScope === 'funding'
        ? 'Funding'
        : searchScope === 'bank'
          ? 'Bank/account'
          : searchScope === 'instrument'
            ? 'Instrument'
            : searchScope === 'dates'
              ? 'Dates'
              : 'ID/source'}` : null,
    searchText.trim() ? `Search: ${searchText.trim()}` : null,
    investmentDateFrom || investmentDateTo
      ? `Invested: ${investmentDateFrom || 'Any'} to ${investmentDateTo || 'Any'}`
      : null,
    maturityDateFrom || maturityDateTo
      ? `Maturity: ${maturityDateFrom || 'Any'} to ${maturityDateTo || 'Any'}`
      : null,
    !showClosed ? 'Open only' : null,
  ].filter(Boolean)
  const showAppHeader = !isMobileEditorScreen
  const showFullHeroCard = false
  const showHeroStrip = visibleActiveTab === 'dashboard' && !isMobileEditorScreen
  const helpCopy = {
    'active-principal': 'This is the total amount still invested in open deposits.',
    'interest-realised': 'This is the interest already earned in the selected financial year.',
    'unused-maturity-cash':
      'This is maturity money already received but not yet used in a new investment.',
    'interest-not-reused': 'This is interest already received but still sitting unused.',
    'upcoming-interest':
      'This only shows future interest for deposits that pay interest before maturity, like quarterly or yearly payout products.',
    'maturity-section':
      maturityFocusMode === 'pending'
        ? 'These are deposits whose maturity money has come in but is still not fully used.'
        : 'These are the next deposits that will mature soon.',
    'interest-section':
      interestFocusMode === 'pending'
        ? 'These are interest amounts already received but not yet fully used in new deposits.'
        : 'These are future interest payouts expected from deposits that pay before maturity.',
  }

  const toggleMobileDetailSection = (sectionKey) => {
    setMobileDetailSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const renderHelpHint = (key, text) => (
    <span className="help-inline">
      <button
        type="button"
        className="help-trigger"
        aria-label="Show simple explanation"
        aria-expanded={activeHelpKey === key}
        onClick={() => setActiveHelpKey((current) => (current === key ? null : key))}
      >
        i
      </button>
      {!isMobile && activeHelpKey === key && <span className="help-popover">{text}</span>}
    </span>
  )

  const handleActionCardKeyDown = (event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  const openAdmin = () => {
    if (!canUseAdmin) {
      return
    }

    setActiveTab('admin')
    setIsMobileNavOpen(false)
  }

  const handleDownloadWorkbook = async () => {
    if (!canUseAdmin) {
      return
    }

    try {
      setIsDownloadingWorkbook(true)
      const exportResponse = await requestJson(
        buildOwnerScopedPath('/api/admin/export-data', activePortfolioOwnerId),
      )
      const exportDeposits = (exportResponse.deposits || []).map(hydrateDeposit)
      downloadInvestmentsWorkbook({
        deposits: exportDeposits,
      })
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setIsDownloadingWorkbook(false)
    }
  }

  const scrollToDashboardSection = (sectionId) => {
    globalThis.setTimeout(() => {
      const element = globalThis.document?.getElementById(sectionId)
      element?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  const showMaturityDrilldown = () => {
    setMaturityFocusMode('pending')
    scrollToDashboardSection('dashboard-maturity-section')
  }

  const showUnusedInterestDrilldown = () => {
    setInterestFocusMode('pending')
    scrollToDashboardSection('dashboard-interest-section')
  }

  const showUpcomingInterestDrilldown = () => {
    setInterestFocusMode('all')
    scrollToDashboardSection('dashboard-interest-section')
  }

  const handleBulkImportSuccess = async () => {
    setPortfolioReloadSeed((current) => current + 1)
  }

  const desktopTabs = [
    ['dashboard', 'Dashboard'],
    ['deposits', 'Deposits'],
  ]

  const mobileTabs = [
    ['dashboard', 'Dashboard'],
    ['deposits', 'Deposits'],
  ]

  if (!sessionState.authenticated) {
    return (
      <AuthView
        onAuthenticate={handleGoogleAuthenticate}
        error={authError}
        isAuthenticating={isAuthenticating}
        themeClass={themeClass}
      />
    )
  }

  return (
    <div className={`shell ${themeClass}`}>
      {showAppHeader && (
        <header className="app-header">
          <div className="app-topbar">
            <div className="app-topbar-copy">
              <strong className="app-topbar-title">YieldFlow</strong>
              <span className="app-topbar-subtitle">{mobileCompactHeaderTitle}</span>
            </div>
            <div className="app-topbar-actions">
              {!isMobile && canEditPortfolio && (
                <button
                  type="button"
                  className="primary-btn compact add-investment-btn"
                  onClick={startNewDeposit}
                >
                  + Add Investment
                </button>
              )}
              <button
                type="button"
                className={isSettingsOpen ? 'icon-btn active' : 'icon-btn'}
                onClick={() => setIsSettingsOpen((current) => !current)}
                aria-label="Open settings"
              >
                {sessionState.user?.photoUrl && sessionState.user.photoUrl !== brokenAvatarUrl ? (
                  <img
                    className="topbar-avatar"
                    src={sessionState.user.photoUrl}
                    alt={sessionState.user.displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenAvatarUrl(sessionState.user?.photoUrl || '__unknown__')}
                  />
                ) : (
                  <div className="topbar-avatar fallback-avatar" aria-hidden="true">
                    {String(sessionState.user?.displayName || sessionState.user?.email || 'Y')
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          </div>
          {!isMobileEditorScreen && !isMobile && (
            <div className="topbar-tab-track">
              <nav
                id="desktop-sections"
                className="tab-bar topbar-tab-bar"
                aria-label="Sections"
              >
                {desktopTabs.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={visibleActiveTab === value ? 'tab active' : 'tab'}
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
            </div>
          )}
        </header>
      )}

      {isSettingsOpen && (
        <section className="settings-panel panel">
          <div className="section-head">
            <div>
              <h2>Settings</h2>
              <p>Manage portfolio, theme, and access preferences.</p>
            </div>
            <button
              type="button"
              className="secondary-btn compact ghost-btn"
              onClick={() => setIsSettingsOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="settings-profile">
            {sessionState.user?.photoUrl && sessionState.user.photoUrl !== brokenAvatarUrl ? (
              <img
                className="settings-avatar"
                src={sessionState.user.photoUrl}
                alt={sessionState.user.displayName}
                referrerPolicy="no-referrer"
                onError={() => setBrokenAvatarUrl(sessionState.user?.photoUrl || '__unknown__')}
              />
            ) : (
              <div className="settings-avatar fallback-avatar" aria-hidden="true">
                {String(sessionState.user?.displayName || sessionState.user?.email || 'Y')
                  .trim()
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
            )}
            <div className="settings-profile-copy">
              <strong>{sessionState.user?.displayName}</strong>
              <span>{sessionState.user?.email}</span>
            </div>
          </div>

          <div className="settings-grid">
            <div className="field settings-static-field">
              <span>Role</span>
              <strong>{isAdminUser ? 'Admin' : 'User'}</strong>
            </div>

            <label className="field">
              <span>Viewing portfolio</span>
              <select
                value={activePortfolioOwnerId}
                onChange={(event) => setActivePortfolioOwnerId(event.target.value)}
              >
                {sessionState.accessiblePortfolios.map((portfolio) => (
                  <option key={portfolio.ownerUserId} value={portfolio.ownerUserId}>
                    {portfolio.accessType === 'owner'
                      ? 'My portfolio'
                      : `${portfolio.ownerDisplayName}${portfolio.accessType === 'admin' ? '' : ' (Shared)'}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Theme</span>
              <select value={themeClass} onChange={(event) => setThemeClass(event.target.value)}>
                <option value="theme-midnight-navy">Midnight Navy</option>
                <option value="theme-cream">Cream</option>
              </select>
            </label>
          </div>

          {!isAdminUser && (
            <PortfolioAccessPanel
              isOwnerPortfolio={!isReadOnlyPortfolio}
              activePortfolioLabel={activePortfolioLabel}
              shareEmail={shareEmail}
              setShareEmail={setShareEmail}
              onCreateShare={handleCreateShare}
              onDeleteShare={handleDeleteShare}
              ownedShares={sharesState.ownerShares}
              sharedWithMe={sharesState.sharedWithMe}
              isSubmittingShare={isSubmittingShare}
              shareFeedback={shareFeedback}
            />
          )}

          <div className="settings-actions">
            {canUseAdmin && (
              <button type="button" className="secondary-btn compact" onClick={openAdmin}>
                Open Admin
              </button>
            )}
            {canEditPortfolio && (
              <button
                type="button"
                className="secondary-btn compact"
                onClick={() => {
                  setActiveTab('masters')
                  setIsSettingsOpen(false)
                }}
              >
                Open Masters
              </button>
            )}
            <button type="button" className="secondary-btn compact" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </section>
      )}

      {showHeroStrip && (
        <section className="mobile-hero-strip">
          <p>
            {isReadOnlyPortfolio
              ? `Viewing ${activePortfolioLabel} in read-only mode.`
              : 'Track maturity, interest payouts, and reinvestment in one place.'}
          </p>
        </section>
      )}

      {showFullHeroCard && (
        <header className="hero-card">
          <div>
            <p className="eyebrow">YieldFlow</p>
            <h1>Track maturity, quarterly interest, annual bond payouts, and reinvestment.</h1>
            <p className="hero-copy">
              This version now treats interest credits as separate cash sources, so SCSS quarterly
              payouts and RBI or REC style annual payouts can be tracked and linked to new deposits.
            </p>
          </div>
          <div className="hero-actions">
            {canEditPortfolio && (
              <button type="button" className="primary-btn" onClick={startNewDeposit}>
                Add deposit
              </button>
            )}
            {canEditPortfolio &&
              selectedReinvestmentSummary?.isRealized &&
              selectedReinvestmentSummary.uninvestedAmount > 0 && (
              <button type="button" className="secondary-btn" onClick={fillFromSelectedMaturity}>
                Use maturity source
              </button>
              )}
          </div>
        </header>
      )}

      {(isLoading || loadError) && (
        <section className={loadError ? 'status-banner error' : 'status-banner'}>
          {isLoading ? 'Loading portfolio from MongoDB...' : loadError}
        </section>
      )}

      {!isLoading && isReadOnlyPortfolio && (
        <section className="status-banner warning">
          Viewing {activePortfolioLabel} as a guest. Changes, deletes, and admin exports are disabled.
        </section>
      )}

      {!isLoading && stats.missingPeriodicPayoutDeposits.length > 0 && (
        <section className="status-banner warning">
          {stats.missingPeriodicPayoutDeposits.length} periodic-interest records still need payout
          amounts before the schedule can be trusted.
        </section>
      )}

      {!isMobileEditorScreen && isMobile && (
        <nav className="bottom-nav" aria-label="Primary navigation">
          {mobileTabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={visibleActiveTab === value ? 'bottom-nav-item active' : 'bottom-nav-item'}
              onClick={() => {
                setActiveTab(value)
                if (value === 'deposits') {
                  setMobileDepositsScreen('list')
                }
              }}
            >
              <span className="bottom-nav-icon" aria-hidden="true">
                {value === 'dashboard' ? 'O' : value === 'deposits' ? '#' : '+'}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {!isMobileEditorScreen && isMobile && canEditPortfolio && (
        <button
          type="button"
          className="mobile-fab"
          onClick={startNewDeposit}
          aria-label="Add investment"
        >
          +
        </button>
      )}

      {isMobile && activeHelpKey && helpCopy[activeHelpKey] && (
        <div className="mobile-help-sheet" role="status" aria-live="polite">
          <div className="mobile-help-sheet-copy">
            <strong>Quick help</strong>
            <p>{helpCopy[activeHelpKey]}</p>
          </div>
          <button
            type="button"
            className="secondary-btn compact ghost-btn"
            onClick={() => setActiveHelpKey(null)}
          >
            Close
          </button>
        </div>
      )}

      {visibleActiveTab === 'dashboard' && (
        <section className="dashboard-layout view-stage">
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
                <span className="stat-label-row">
                  <span>Active principal</span>
                  {renderHelpHint('active-principal', 'This is the total amount still invested in open deposits.')}
                </span>
                <strong>{formatCurrency(stats.openPrincipal)}</strong>
                <small>{stats.openDeposits} open</small>
              </article>
              <article className="stat-card">
                <span className="stat-label-row">
                  <span>Interest realised</span>
                  {renderHelpHint('interest-realised', 'This is the interest already earned in the selected financial year.')}
                </span>
                <strong>{formatCurrency(stats.realisedInterest)}</strong>
                <small>FY {stats.currentFinancialYearLabel}</small>
              </article>
              <article
                className="stat-card stat-card-action clickable-surface"
                role="button"
                tabIndex={0}
                onClick={showMaturityDrilldown}
                onKeyDown={(event) => handleActionCardKeyDown(event, showMaturityDrilldown)}
              >
                <span className="stat-label-row">
                  <span>Unused maturity cash</span>
                  {renderHelpHint('unused-maturity-cash', 'This is maturity money already received but not yet used in a new investment.')}
                </span>
                <strong>{formatCurrency(stats.uninvestedMaturityCash)}</strong>
                <small>FY {stats.currentFinancialYearLabel} | View investments</small>
              </article>
              <article
                className="stat-card stat-card-action warning clickable-surface"
                role="button"
                tabIndex={0}
                onClick={showUnusedInterestDrilldown}
                onKeyDown={(event) => handleActionCardKeyDown(event, showUnusedInterestDrilldown)}
              >
                <span className="stat-label-row">
                  <span>Interest not reused</span>
                  {renderHelpHint('interest-not-reused', 'This is interest already received but still sitting unused.')}
                </span>
                <strong>{formatCurrency(stats.uninvestedInterestCash)}</strong>
                <small>FY {stats.currentFinancialYearLabel} | View investments</small>
              </article>
              <article
                className="stat-card stat-card-action clickable-surface"
                role="button"
                tabIndex={0}
                onClick={showUpcomingInterestDrilldown}
                onKeyDown={(event) => handleActionCardKeyDown(event, showUpcomingInterestDrilldown)}
              >
                <span className="stat-label-row">
                  <span>Upcoming interest</span>
                  {renderHelpHint('upcoming-interest', 'This only shows future interest for deposits that pay interest before maturity, like quarterly or yearly payout products.')}
                </span>
                <strong>{formatCurrency(stats.futureInterestCash)}</strong>
                <small>FY {stats.currentFinancialYearLabel} | View schedule</small>
              </article>
            </div>

            <FyTaxView
              summary={taxSummary}
              selectedFinancialYear={selectedFinancialYear}
              isLoading={isLoadingTaxSummary}
              error={taxSummaryError}
              formatCurrency={formatCurrency}
              isOpen={isTaxViewOpen}
              onOpen={() => setIsTaxViewOpen(true)}
              onClose={() => setIsTaxViewOpen(false)}
              onOpenInvestmentDetail={(investment) =>
                openDepositDrilldown(
                  investment.investmentId,
                  investment.accountNumber || investment.investmentId,
                )
              }
            />

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
                      : 'The next maturity dates to watch.'}
                  </p>
                </div>
                <button
                  type="button"
                  className={maturityFocusMode === 'pending' ? 'secondary-btn compact ghost-btn dashboard-toggle-btn' : 'secondary-btn compact dashboard-action-btn dashboard-toggle-btn'}
                  onClick={() =>
                    setMaturityFocusMode((current) => (current === 'pending' ? 'all' : 'pending'))
                  }
                >
                  {maturityFocusMode === 'pending' ? 'Back' : 'View cash to reinvest'}
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
                        {deposit.status || deposit.type}
                      </span>
                    </div>
                    <p>
                      {deposit.holderName} | {deposit.accountNumber || 'No account no.'}
                    </p>
                    <p>
                      {deposit.instrumentType || 'Maturity'}
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

            <article id="dashboard-interest-section" className="panel">
              <div className="section-head">
                <div>
                  <div className="section-title-row">
                    <h2>
                      {interestFocusMode === 'pending' ? 'Interest to reinvest' : 'Interest timeline'}
                    </h2>
                    {renderHelpHint(
                      'interest-section',
                      interestFocusMode === 'pending'
                        ? 'These are interest amounts already received but not yet fully used in new deposits.'
                        : 'These are future interest payouts expected from deposits that pay before maturity.',
                    )}
                  </div>
                  <p>
                    {interestFocusMode === 'pending'
                      ? 'Interest already received but not yet fully reused.'
                      : 'Upcoming interest receipts that may be reused.'}
                  </p>
                </div>
                <button
                  type="button"
                  className={interestFocusMode === 'pending' ? 'secondary-btn compact ghost-btn dashboard-toggle-btn' : 'secondary-btn compact dashboard-action-btn dashboard-toggle-btn'}
                  onClick={() =>
                    setInterestFocusMode((current) => (current === 'pending' ? 'all' : 'pending'))
                  }
                >
                  {interestFocusMode === 'pending' ? 'Back' : 'View cash to reinvest'}
                </button>
              </div>
              <div className="list">
                {(interestFocusMode === 'pending'
                  ? stats.dueInterestAwaitingReinvestmentSummary
                  : stats.upcomingInterestSummary
                ).length > 0 ? (
                  (interestFocusMode === 'pending'
                    ? stats.dueInterestAwaitingReinvestmentSummary
                    : stats.upcomingInterestSummary
                  ).map((event) => (
                    <button
                      key={event.depositId}
                      type="button"
                      className="deposit-card clickable-surface"
                      onClick={() => openDepositFromInterestEvent(event)}
                    >
                      <div className="deposit-topline">
                        <strong>{event.bankName}</strong>
                        <span className="pill open">
                          {interestFocusMode === 'pending' ? 'Pending interest' : event.type}
                        </span>
                      </div>
                      <p>
                        {event.holderName} | {event.accountNumber || 'No account no.'}
                      </p>
                      <p>
                        {formatCurrency(
                          interestFocusMode === 'pending' ? event.pendingAmount : event.futureAmount,
                        )}
                      </p>
                      <p>
                        {interestFocusMode === 'pending'
                          ? `${event.receiptCount} received interest receipts pending`
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
                      <p className="lineage-empty">No received interest is waiting for reinvestment.</p>
                    </div>
                  ) : (
                    <p className="lineage-empty">No upcoming periodic interest payouts in the schedule.</p>
                  )
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
                  className="owner-card clickable-surface"
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
                  </div>
                  <div className="owner-card-value">{formatCurrency(owner.principalAmount)}</div>
                  <p className="owner-card-subtitle">
                    <span className="owner-card-icon-label" aria-hidden="true">💰</span>
                    <span>Principal</span>
                  </p>
                  <div className="owner-card-details">
                    <p>
                      <strong>
                        <span className="owner-card-icon-label" aria-hidden="true">◌</span>
                        <span>Open</span>
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
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </section>
      )}

      {visibleActiveTab === 'deposits' && (
        <div className="view-stage">
          <DepositsView
          isMobile={isMobile}
          isReadOnly={isReadOnlyPortfolio}
          ownerUserId={activePortfolioOwnerId}
          activePortfolioLabel={activePortfolioLabel}
          onImportSuccess={handleBulkImportSuccess}
          mobileDepositsScreen={mobileDepositsScreen}
          isMobileFiltersOpen={isMobileFiltersOpen}
          setIsMobileFiltersOpen={setIsMobileFiltersOpen}
          hasActiveDepositFilters={hasActiveDepositFilters}
          mobileFilterBadges={mobileFilterBadges}
          searchScope={searchScope}
          setSearchScope={setSearchScope}
          searchText={searchText}
          setSearchText={setSearchText}
          investmentDateFrom={investmentDateFrom}
          setInvestmentDateFrom={setInvestmentDateFrom}
          investmentDateTo={investmentDateTo}
          setInvestmentDateTo={setInvestmentDateTo}
          maturityDateFrom={maturityDateFrom}
          setMaturityDateFrom={setMaturityDateFrom}
          maturityDateTo={maturityDateTo}
          setMaturityDateTo={setMaturityDateTo}
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
          deleteTargetId={deleteTargetId}
          isDeleting={isDeleting}
          startNewDeposit={startNewDeposit}
          openDepositDetail={openDepositDetail}
          setMobileDepositsScreen={setMobileDepositsScreen}
          startCloning={startCloning}
          startEditing={startEditing}
          startArchive={startArchive}
          cancelArchive={cancelArchive}
          confirmArchive={confirmArchive}
          startDelete={startDelete}
          cancelDelete={cancelDelete}
          confirmDelete={confirmDelete}
          fillFromSelectedMaturity={fillFromSelectedMaturity}
          fillFromAllAvailableInterest={fillFromAllAvailableInterest}
          applyCashFlowSource={applyCashFlowSource}
          settleCashFlowEvent={settleCashFlowEvent}
          settlingEventId={settlingEventId}
          mobileDetailSections={mobileDetailSections}
          toggleMobileDetailSection={toggleMobileDetailSection}
          needsPeriodicPayoutSetup={needsPeriodicPayoutSetup}
          getPayoutModeLabel={getPayoutModeLabel}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formatTenure={formatTenure}
          todayTime={TODAY.getTime()}
          canDeletePortfolio={canDeletePortfolio}
        />
        </div>
      )}

      {visibleActiveTab === 'editor' && (
        <div className="view-stage">
          <DepositEditorView
          isMobileEditorScreen={isMobileEditorScreen}
          mobileEditorTitle={mobileEditorTitle}
          editingId={editingId}
          leaveEditorScreen={leaveEditorScreen}
          formValues={formValues}
          ownerOptions={ownerOptions}
          fundingSourceMasterOptions={fundingSourceMasterOptions}
          institutionOptions={institutionOptions}
          branchOptions={branchOptions}
          instrumentTypeOptions={instrumentTypeOptions}
          addNewMasterValue={ADD_NEW_MASTER_VALUE}
          sourcePreviewEvents={sourcePreviewEvents}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formErrors={formErrors}
          handleFormChange={handleFormChange}
          handleMasterBoundFieldChange={handleMasterBoundFieldChange}
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
          editFundingEntry={editFundingEntry}
          removeFundingEntry={removeFundingEntry}
          computedEditorInterestEarned={computedEditorInterestEarned}
          computedEditorTdsAmount={computedEditorTdsAmount}
          computedEditorTdsPercent={computedEditorTdsPercent}
          computedEditorTenure={computedEditorTenure}
          handleSave={handleSave}
          resetForm={resetForm}
        />
        </div>
      )}

      {visibleActiveTab === 'masters' && (
        <div className="view-stage">
          <MastersView
          key={`${mastersViewSeed}-${JSON.stringify(masterData)}`}
          isMobile={isMobile}
          masterData={masterData}
          isSavingMasters={isSavingMasters}
          mastersFeedback={mastersFeedback}
          initialIntent={mastersIntent}
          saveMasterData={saveMasterData}
          returnToEditor={() => {
            setActiveTab('editor')
            setMastersReturnTarget(null)
          }}
          showReturnToEditor={mastersReturnTarget === 'editor'}
          isReadOnly={isReadOnlyPortfolio}
        />
        </div>
      )}

      {visibleActiveTab === 'admin' && canUseAdmin && (
        <div className="view-stage">
          <AdminView
          totalInvestments={deposits.length}
          onDownloadWorkbook={handleDownloadWorkbook}
          portfolioLabel={activePortfolioLabel}
          isDownloadingWorkbook={isDownloadingWorkbook}
        />
        </div>
      )}
    </div>
  )
}

export default App
