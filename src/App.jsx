import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import DashboardView from './features/dashboard/DashboardView.jsx'
import useDashboardModel from './features/dashboard/useDashboardModel.js'
import { PrivacyPolicyView, TermsOfServiceView } from './features/legal/LegalPages.jsx'
import SettingsPanel from './features/settings/SettingsPanel.jsx'
import yieldFlowLogo from './assets/yieldflow-logo.svg'
import AdminView from './features/admin/AdminView.jsx'
import AuthView from './features/auth/AuthView.jsx'
import DepositsView from './features/deposits/DepositsView.jsx'
import DepositEditorView from './features/editor/DepositEditorView.jsx'
import MastersView from './features/masters/MastersView.jsx'
import SalarySavingsView from './features/salary/SalarySavingsView.jsx'
import { createRenewedInvestmentAllocation, summarizeInvestmentSalaryFunding } from './features/salary/salarySavingsModel.js'
import { downloadInvestmentsWorkbook } from './features/admin/exportWorkbook.js'
import { DEMO_PORTFOLIO_LABEL } from '../shared/demoPortfolio.js'
import { generateOwnerWiseFYTaxSummary, parseFinancialYearLabel } from '../shared/fyTaxEngine.js'
import { APP_ACTIVITY_EVENT, TODAY, computeTdsAmount, computeTdsPercent, deriveTenureParts, emptyForm, formatAllocationsText, formatCurrency, formatDate, formatInterestRate, formatTenure, generateInterestEvents, getCashSettlements, getCurrentFinancialYearRange, getDateSortValue, getEditableNetPayoutValue, getEffectiveMaturityDate, getEffectivePayoutMode, getFundingAllocations, getMaturitySourceEventId, getPayoutModeLabel, hydrateDeposit, needsPeriodicPayoutSetup, normalizeDeposit, parseAllocationEntries, requestJson, toYmd } from './features/deposits/depositModel.js'
import { buildOwnerAliasLookup, emptyMasterData, normalizeMasterData } from '../shared/masterData.js'

const ADD_NEW_MASTER_VALUE = '__add_new_master__'
const THEME_STORAGE_KEY = 'yieldflow.theme'
const AUTHOR_LINKEDIN_URL = 'https://www.linkedin.com/in/parthdave2'
const APP_HOME_URL = window.location.origin
const parsePositiveEnvNumber = (key, fallback) => {
  const number = Number(import.meta.env[key])
  return Number.isFinite(number) && number > 0 ? number : fallback
}
const SESSION_WARNING_MS = parsePositiveEnvNumber('VITE_SESSION_WARNING_MINUTES', 55) * 60 * 1000
const SESSION_TIMEOUT_MS = parsePositiveEnvNumber('VITE_SESSION_TIMEOUT_MINUTES', 60) * 60 * 1000
const SESSION_ACTIVITY_THROTTLE_MS =
  parsePositiveEnvNumber('VITE_SESSION_ACTIVITY_THROTTLE_SECONDS', 15) * 1000
const DASHBOARD_PREVIEW_LIMIT = Math.floor(
  parsePositiveEnvNumber('VITE_DASHBOARD_PREVIEW_LIMIT', 3),
)
const DASHBOARD_UPCOMING_CASH_WINDOW_DAYS = Math.floor(
  parsePositiveEnvNumber('VITE_DASHBOARD_UPCOMING_CASH_WINDOW_DAYS', 30),
)

const deriveAccountOrCertificateNumber = (bankName, instrumentType, actualAccountNumber) => {
  const issuer = String(bankName || '').trim()
  const instrument = String(instrumentType || '').trim()

  if (!issuer || !instrument) {
    return ''
  }

  const rawAccountNumber = String(actualAccountNumber || '').trim()
  let derivedValue = '0000'

  if (/^\d+$/.test(rawAccountNumber)) {
    derivedValue = ((BigInt(rawAccountNumber) * 2n) % 10000n).toString().padStart(4, '0')
  } else {
    const trailingDigits = rawAccountNumber.match(/(\d{1,4})$/)?.[1]
    if (trailingDigits) {
      derivedValue = ((Number(trailingDigits) * 2) % 10000).toString().padStart(4, '0')
    }
  }

  return `${issuer}-${instrument.toLowerCase() === 'term deposit' ? 'FD' : instrument}-${derivedValue}`
}

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

const getDateDayCount = (startValue, endValue) => {
  const start = new Date(`${String(startValue || '').trim()}T00:00:00`)
  const end = new Date(`${String(endValue || '').trim()}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0
  }

  return Math.max(Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 0)
}

const buildTaxEstimationInvestmentInput = (deposit) => {
  const normalizedPayoutMode = String(deposit.payoutMode || '').trim().toLowerCase()
  const effectiveMaturityDate = getEffectiveMaturityDate(deposit)
  const derivedTenureDays =
    !deposit.closureDate && Number.isFinite(Number(deposit.tenureDays)) && Number(deposit.tenureDays) > 0
      ? Number(deposit.tenureDays)
      : getDateDayCount(deposit.investmentDate, effectiveMaturityDate)
  const payoutFrequency =
    normalizedPayoutMode === 'quarterly-fy'
      ? 'QUARTERLY'
      : normalizedPayoutMode === 'yearly-fixed'
        ? 'YEARLY'
        : 'CUMULATIVE'
  const explicitCalculationFrequency = String(deposit.calculationFrequency || '').trim().toUpperCase()
  const shouldPreferQuarterlyCompounding =
    payoutFrequency === 'CUMULATIVE' && derivedTenureDays >= 365
  const calculationFrequency =
    explicitCalculationFrequency && explicitCalculationFrequency !== 'SIMPLE'
      ? explicitCalculationFrequency
      : shouldPreferQuarterlyCompounding
        ? 'QUARTERLY'
        : explicitCalculationFrequency || 'SIMPLE'

  return {
    id: String(deposit.id || ''),
    ownerId: String(deposit.holderName || '').trim(),
    ownerName: String(deposit.holderName || '').trim(),
    ownerType: 'Individual',
    principal: Number(deposit.principalAmount || 0),
    interestRate: Number(deposit.interestRate || 0),
    valueDate: deposit.investmentDate,
    maturityDate: effectiveMaturityDate,
    contractualMaturityDate: deposit.maturityDate,
    closureDate: deposit.closureDate || '',
    status: deposit.status || 'Open',
    maturityBeforeTax: deposit.maturityBeforeTax,
    tenureDays: derivedTenureDays,
    institutionName: String(deposit.bankName || '').trim(),
    investmentType: String(deposit.instrumentType || '').trim(),
    payoutMode: String(deposit.payoutMode || '').trim(),
    accountNumber: String(deposit.accountNumber || '').trim(),
    calculationFrequency,
    payoutFrequency,
    annualRate: Number(deposit.interestRate || 0),
    yearlyPayoutMonthDay: String(deposit.yearlyPayoutMonthDay || '').trim(),
  }
}

const formatEditableNumber = (value, precision = 4) => {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) {
    return ''
  }

  return Number(Number(value).toFixed(precision)).toString()
}

const formatWholeNumber = (value) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value || 0))





const createMasterKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item'

const canonicalizeDepositsAgainstMasterData = (depositList, currentMasterData) => {
  const ownerLookup = new Map(
    (currentMasterData.owners || [])
      .map((owner) => [String(owner?.id || '').trim(), String(owner?.name || '').trim()])
      .filter(([id, name]) => id && name),
  )
  const institutionLookup = new Map(
    (currentMasterData.institutions || [])
      .map((institution) => [
        String(institution?.id || '').trim(),
        {
          name: String(institution?.name || '').trim(),
          branches: new Map(
            (institution.branches || [])
              .map((branch) => [String(branch?.id || '').trim(), String(branch?.name || '').trim()])
              .filter(([id, name]) => id && name),
          ),
        },
      ])
      .filter(([id, value]) => id && value.name),
  )
  const instrumentLookup = new Map(
    (currentMasterData.instrumentTypes || [])
      .map((instrument) => [String(instrument?.id || '').trim(), String(instrument?.name || '').trim()])
      .filter(([id, name]) => id && name),
  )

  return depositList.map((deposit) => {
    const institutionEntry = institutionLookup.get(createMasterKey(deposit.bankName))
    return {
      ...deposit,
      holderName: ownerLookup.get(createMasterKey(deposit.holderName)) || deposit.holderName,
      fundingSource:
        ownerLookup.get(createMasterKey(deposit.fundingSource)) || deposit.fundingSource,
      bankName: institutionEntry?.name || deposit.bankName,
      branchCity:
        institutionEntry?.branches.get(createMasterKey(deposit.branchCity)) || deposit.branchCity,
      instrumentType:
        instrumentLookup.get(createMasterKey(deposit.instrumentType)) || deposit.instrumentType,
    }
  })
}

function App() {
  const currentPathname = globalThis.location?.pathname || '/'
  const isDemoMode = currentPathname === '/demo'
  const [sessionState, setSessionState] = useState(createEmptySessionState)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState('')
  const [themeClass, setThemeClass] = useState(
    () => globalThis.localStorage?.getItem(THEME_STORAGE_KEY) || 'theme-midnight-navy',
  )
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [expandedSettingsSection, setExpandedSettingsSection] = useState('account')
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now())
  const [isSessionWarningOpen, setIsSessionWarningOpen] = useState(false)
  const [activePortfolioOwnerId, setActivePortfolioOwnerId] = useState('')
  const [sharesState, setSharesState] = useState({ ownerShares: [], sharedWithMe: [] })
  const [shareEmail, setShareEmail] = useState('')
  const [isSubmittingShare, setIsSubmittingShare] = useState(false)
  const [shareFeedback, setShareFeedback] = useState(null)
  const [isDownloadingWorkbook, setIsDownloadingWorkbook] = useState(false)
  const [deposits, setDeposits] = useState([])
  const [salarySavings, setSalarySavings] = useState([])
  const [salarySaveFeedback, setSalarySaveFeedback] = useState('')
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
  const [depositFilterResetSeed, setDepositFilterResetSeed] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [formValues, setFormValues] = useState(emptyForm)
  const [actualAccountNumber, setActualAccountNumber] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [selectedFundingEventId, setSelectedFundingEventId] = useState('')
  const [fundingAmountDraft, setFundingAmountDraft] = useState('')
  const [archiveTargetId, setArchiveTargetId] = useState(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [renewingInvestmentId, setRenewingInvestmentId] = useState('')
  const [settlingEventId, setSettlingEventId] = useState('')
  const [closingInvestmentId, setClosingInvestmentId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [portfolioActionFeedback, setPortfolioActionFeedback] = useState('')
  const [portfolioReloadSeed, setPortfolioReloadSeed] = useState(0)
  const [interestFocusMode, setInterestFocusMode] = useState('all')
  const [maturityFocusMode, setMaturityFocusMode] = useState('all')
  const [showAllMaturityItems, setShowAllMaturityItems] = useState(false)
  const [showAllInterestItems, setShowAllInterestItems] = useState(false)
  const [isReinvestmentDrilldownOpen, setIsReinvestmentDrilldownOpen] = useState(false)
  const [showAllReinvestmentItems, setShowAllReinvestmentItems] = useState(false)
  const [isSavingMasters, setIsSavingMasters] = useState(false)
  const [mastersFeedback, setMastersFeedback] = useState(null)
  const [mastersIntent, setMastersIntent] = useState(null)
  const [mastersViewSeed, setMastersViewSeed] = useState(0)
  const [mastersReturnTarget, setMastersReturnTarget] = useState(null)
  const [activeHelpKey, setActiveHelpKey] = useState(null)
  const [desktopHelpPopover, setDesktopHelpPopover] = useState(null)
  const currentFinancialYear = useMemo(() => getCurrentFinancialYearRange(TODAY), [])
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(currentFinancialYear.label)
  const [isTaxViewOpen, setIsTaxViewOpen] = useState(false)
  const [taxSummary, setTaxSummary] = useState(null)
  const [isLoadingTaxSummary, setIsLoadingTaxSummary] = useState(false)
  const [taxSummaryError, setTaxSummaryError] = useState('')
  const [selectedDashboardOwner, setSelectedDashboardOwner] = useState('')
  const userMenuRef = useRef(null)
  const helpTriggerRefs = useRef(new Map())
  const desktopHelpPopoverRef = useRef(null)
  const lastActivityRef = useRef(lastActivityAt)
  const activeDeposits = useMemo(
    () => deposits.filter((deposit) => !deposit.isDeleted),
    [deposits],
  )
  const demoTaxSummary = useMemo(() => {
    if (!isDemoMode) {
      return null
    }

    return generateOwnerWiseFYTaxSummary(
      activeDeposits.map((deposit) => buildTaxEstimationInvestmentInput(deposit)),
      parseFinancialYearLabel(selectedFinancialYear),
      masterData.owners || [],
    )
  }, [activeDeposits, isDemoMode, masterData.owners, selectedFinancialYear])
  const effectiveTaxSummary = isDemoMode ? demoTaxSummary : taxSummary
  const effectiveTaxSummaryError = isDemoMode ? '' : taxSummaryError
  const isEffectiveTaxSummaryLoading = isDemoMode ? false : isLoadingTaxSummary
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
  const recordSessionActivity = (force = false) => {
    const now = Date.now()
    if (!force && now - lastActivityRef.current < SESSION_ACTIVITY_THROTTLE_MS) {
      return
    }

    lastActivityRef.current = now
    setLastActivityAt(now)
    setIsSessionWarningOpen(false)
  }

  const openSettingsPanel = (section = 'account') => {
    setExpandedSettingsSection(section)
    setIsSettingsOpen(true)
    setIsUserMenuOpen(false)
  }

  const toggleSettingsSection = (section) => {
    setExpandedSettingsSection((current) => (current === section ? '' : section))
  }

  const performLogout = async (silent = false) => {
    try {
      await requestJson('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error(error)
    } finally {
      setSessionState(createEmptySessionState())
      setActivePortfolioOwnerId('')
      setDeposits([])
      setSalarySavings([])
      setMasterData(emptyMasterData)
      setSelectedId(null)
      setSharesState({ ownerShares: [], sharedWithMe: [] })
      setShareEmail('')
      setShareFeedback(null)
      setAuthError('')
      setActiveTab('dashboard')
      setIsUserMenuOpen(false)
      setIsSettingsOpen(false)
      setIsSessionWarningOpen(false)
      if (!silent) {
        lastActivityRef.current = Date.now()
        setLastActivityAt(lastActivityRef.current)
      }
    }
  }

  const loadDemoPortfolio = useCallback(async () => {
    const demoResponse = await requestJson('/api/demo/portfolio')
    const nextMasterData = normalizeMasterData(demoResponse.masterData)
    const nextDeposits = canonicalizeDepositsAgainstMasterData(
      (demoResponse.deposits || []).map(hydrateDeposit),
      nextMasterData,
    )

    setSessionState({
      authenticated: false,
      user: {
        id: demoResponse.portfolio?.ownerUserId || 'demo-owner-yieldflow',
        displayName: 'Demo visitor',
        email: 'demo@yieldflow.local',
        systemRole: 'demo',
        photoUrl: '',
      },
      accessiblePortfolios: [
        {
          ownerUserId: demoResponse.portfolio?.ownerUserId || 'demo-owner-yieldflow',
          ownerDisplayName: demoResponse.portfolio?.label || DEMO_PORTFOLIO_LABEL,
          ownerEmail: '',
          accessType: 'demo',
        },
      ],
      activePortfolioOwnerId: demoResponse.portfolio?.ownerUserId || 'demo-owner-yieldflow',
      isDemoMode: true,
    })
    setActivePortfolioOwnerId(demoResponse.portfolio?.ownerUserId || 'demo-owner-yieldflow')
    setDeposits(nextDeposits)
    setSalarySavings(demoResponse.salarySavings || [])
    setMasterData(nextMasterData)
    setSelectedId((current) =>
      current && nextDeposits.some((deposit) => deposit.id === current)
        ? current
        : nextDeposits[0]?.id || null,
    )
    setSharesState({ ownerShares: [], sharedWithMe: [] })
    setShareEmail('')
    setShareFeedback(null)
    setIsSettingsOpen(false)
    setIsSessionWarningOpen(false)
  }, [])

  useEffect(() => {
    const loadSession = async () => {
      if (isDemoMode) {
        return
      }

      try {
        setIsLoading(true)
        setLoadError('')
        const sessionResponse = normalizeSessionState(await requestJson('/api/auth/session'))

        if (!sessionResponse.authenticated) {
          setSessionState(createEmptySessionState())
          setActivePortfolioOwnerId('')
          setDeposits([])
          setSalarySavings([])
          setMasterData(emptyMasterData)
          setSelectedId(null)
          setIsSessionWarningOpen(false)
          return
        }

        setSessionState(sessionResponse)
        setActivePortfolioOwnerId(sessionResponse.activePortfolioOwnerId)
        recordSessionActivity(true)
      } catch (error) {
        setLoadError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadSession()
  }, [isDemoMode])

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
    if (!isUserMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [isUserMenuOpen])

  useEffect(() => {
    if (!sessionState.authenticated) {
      return undefined
    }

    const handleActivity = () => recordSessionActivity(false)
    const handleApiActivity = () => recordSessionActivity(true)
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity, { passive: true }),
    )
    window.addEventListener(APP_ACTIVITY_EVENT, handleApiActivity)

    return () => {
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, handleActivity),
      )
      window.removeEventListener(APP_ACTIVITY_EVENT, handleApiActivity)
    }
  }, [sessionState.authenticated])

  useEffect(() => {
    if (isDemoMode) {
      let isMounted = true

      const loadDemo = async () => {
        try {
          setIsLoading(true)
          setLoadError('')
          await loadDemoPortfolio()
        } catch (error) {
          if (isMounted) {
            setDeposits([])
            setMasterData(emptyMasterData)
            setSelectedId(null)
            setLoadError(error.message)
          }
        } finally {
          if (isMounted) {
            setIsLoading(false)
          }
        }
      }

      loadDemo()

      return () => {
        isMounted = false
      }
    }

    if (!sessionState.authenticated || !activePortfolioOwnerId) {
      return undefined
    }

    let isMounted = true

    const loadPortfolioData = async () => {
      try {
        setIsLoading(true)
        setLoadError('')
        const [depositsData, masterDataResponse, salarySavingsResponse] = await Promise.all([
          requestJson(buildOwnerScopedPath('/api/deposits', activePortfolioOwnerId)),
          requestJson(buildOwnerScopedPath('/api/master-data', activePortfolioOwnerId)).catch(
            () => emptyMasterData,
          ),
          requestJson(buildOwnerScopedPath('/api/salary-savings', activePortfolioOwnerId)).catch(() => []),
        ])

        if (!isMounted) {
          return
        }

        const nextMasterData = normalizeMasterData(masterDataResponse)
        const nextDeposits = canonicalizeDepositsAgainstMasterData(
          depositsData.map(hydrateDeposit),
          nextMasterData,
        )
        setDeposits(nextDeposits)
        setSalarySavings(salarySavingsResponse || [])
        setMasterData(nextMasterData)
        setSelectedId((current) =>
          current && nextDeposits.some((deposit) => deposit.id === current)
            ? current
            : null,
        )
      } catch (error) {
        if (!isMounted) {
          return
        }

        setDeposits([])
        setSalarySavings([])
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
  }, [activePortfolioOwnerId, isDemoMode, loadDemoPortfolio, portfolioReloadSeed, sessionState.authenticated])

  useEffect(() => {
    if (!sessionState.authenticated) {
      return undefined
    }

    const elapsed = Date.now() - lastActivityAt
    const warningDelay = Math.max(SESSION_WARNING_MS - elapsed, 0)
    const timeoutDelay = Math.max(SESSION_TIMEOUT_MS - elapsed, 0)

    const warningTimer = globalThis.setTimeout(() => {
      setIsSessionWarningOpen(true)
    }, warningDelay)

    const timeoutTimer = globalThis.setTimeout(() => {
      performLogout(true)
    }, timeoutDelay)

    return () => {
      globalThis.clearTimeout(warningTimer)
      globalThis.clearTimeout(timeoutTimer)
    }
  }, [lastActivityAt, sessionState.authenticated])

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
    if (isDemoMode) {
      return undefined
    }

    if (!sessionState.authenticated || !activePortfolioOwnerId || !selectedFinancialYear) {
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
  }, [activePortfolioOwnerId, deposits, isDemoMode, selectedFinancialYear, sessionState.authenticated])

  const deferredSearch = useDeferredValue(searchText)
  const ownerAliasLookup = useMemo(() => buildOwnerAliasLookup(masterData), [masterData])
  const activePortfolio =
    sessionState.accessiblePortfolios.find(
      (portfolio) => portfolio.ownerUserId === activePortfolioOwnerId,
    ) ?? null
  const isReadOnlyPortfolio = !isDemoMode && activePortfolio?.accessType === 'guest'
  const isAdminUser = sessionState.user?.systemRole === 'admin'
  const canEditPortfolio = isDemoMode || (sessionState.authenticated && (isAdminUser || !isReadOnlyPortfolio))
  const canUseAdmin = !isDemoMode && isAdminUser
  const canDeletePortfolio = !isDemoMode && isAdminUser
  const activePortfolioLabel =
    isDemoMode
      ? DEMO_PORTFOLIO_LABEL
      : activePortfolio?.accessType === 'guest' || activePortfolio?.accessType === 'admin'
        ? `${activePortfolio.ownerDisplayName}'s portfolio`
        : 'your portfolio'

  const {
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
  } = useDashboardModel({
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
  })

  const resetForm = () => {
    setEditingId(null)
    setFormValues(createFreshForm())
    setActualAccountNumber('')
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setArchiveTargetId(null)
    setDeleteTargetId(null)
  }

  const mapDepositToFormValues = (deposit) => ({
    srNo: deposit.srNo ?? '',
    parentInvestmentId: deposit.parentInvestmentId ?? '',
    bankName: deposit.bankName ?? '',
    branchCity: deposit.branchCity ?? '',
    holderName: deposit.holderName ?? '',
    fundingSource: deposit.fundingSource ?? '',
    instrumentType: deposit.instrumentType ?? '',
    calculationFrequency: deposit.calculationFrequency || 'QUARTERLY',
    payoutMode: getEffectivePayoutMode(deposit) ?? 'on-maturity',
    yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay ?? '',
    interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
    interestPayoutAfterTds: getEditableNetPayoutValue(deposit),
    interestPayoutSchedule: deposit.interestPayoutSchedule ?? '',
    interestPayoutOverrides: deposit.interestPayoutOverrides ?? [],
    accountNumber: deposit.accountNumber ?? '',
    tenureYears: deposit.tenureYears ?? '',
    tenureMonths: deposit.tenureMonths ?? '',
    tenureDays: deposit.tenureDays ?? '',
    interestRate: formatEditableNumber(deposit.interestRate),
    principalAmount: deposit.principalAmount ?? '',
    investmentDate: deposit.investmentDate ?? '',
    maturityDate: deposit.maturityDate ?? '',
    closureDate: deposit.closureDate ?? '',
    maturityBeforeTax: deposit.maturityBeforeTax ?? '',
    maturityAfterTax: deposit.maturityAfterTax ?? '',
    totalInterestEarned: deposit.totalInterestEarned ?? '',
    tdsPercent: deposit.tdsPercent ?? '',
    tdsAmount: deposit.tdsAmount ?? '',
    status: deposit.status ?? 'Open',
    allocationsText: formatAllocationsText(getFundingAllocations(deposit)),
    notes: deposit.notes ?? '',
  })

  const addTenureToDate = (dateValue, deposit) => {
    if (!dateValue) {
      return ''
    }

    const baseDate = new Date(`${dateValue}T00:00:00`)
    if (Number.isNaN(baseDate.getTime())) {
      return ''
    }

    const tenure = deriveTenureParts(deposit.investmentDate, deposit.maturityDate)
    const years = Number(tenure.years || 0)
    const months = Number(tenure.months || 0)
    const days = Number(tenure.days || 0)
    const targetMonthIndex = baseDate.getMonth() + months
    const targetYear = baseDate.getFullYear() + years + Math.floor(targetMonthIndex / 12)
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
    const daysInTargetMonth = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate()
    const targetDate = new Date(
      targetYear,
      normalizedMonthIndex,
      Math.min(baseDate.getDate(), daysInTargetMonth),
    )
    targetDate.setDate(targetDate.getDate() + days)

    return toYmd(targetDate)
  }

  const startNewDeposit = () => {
    if (!canEditPortfolio) {
      return
    }

    setEditorReturnTab(activeTab)
    setEditorReturnDepositsScreen(mobileDepositsScreen)
    setActiveTab('editor')
    setMobileDepositsScreen('list')
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    resetForm()
  }

  const saveMasterData = async (nextMasterData) => {
    if (!canEditPortfolio) {
      return
    }

    if (isDemoMode) {
      const savedMasterData = normalizeMasterData(nextMasterData)
      setMasterData(savedMasterData)
      setDeposits((current) => canonicalizeDepositsAgainstMasterData(current, savedMasterData))
      setMastersFeedback({
        type: 'success',
        message: 'Demo master data updated for this browser session.',
      })
      if (mastersReturnTarget === 'editor') {
        setActiveTab('editor')
      }
      setMastersReturnTarget(null)
      return
    }

    try {
      setIsSavingMasters(true)
      setMastersFeedback(null)
      setLoadError('')
      const masterDataResponse = await requestJson(
        buildOwnerScopedPath('/api/master-data', activePortfolioOwnerId),
        {
          method: 'PUT',
          body: JSON.stringify(nextMasterData),
        },
      )
      const savedMasterData = normalizeMasterData(masterDataResponse)
      const refreshedDepositsResponse = await requestJson(
        buildOwnerScopedPath('/api/deposits', activePortfolioOwnerId),
      )
      const refreshedDeposits = canonicalizeDepositsAgainstMasterData(
        refreshedDepositsResponse.map(hydrateDeposit),
        savedMasterData,
      )
      setMasterData(savedMasterData)
      setDeposits(refreshedDeposits)
      if (editingId) {
        const refreshedEditingDeposit = refreshedDeposits.find((deposit) => deposit.id === editingId)
        if (refreshedEditingDeposit) {
          setFormValues(mapDepositToFormValues(refreshedEditingDeposit))
        }
      }
      const renameEffectCount = Number(masterDataResponse?.renameEffects?.renamedDepositCount || 0)
      setMastersFeedback({
        type: 'success',
        message:
          renameEffectCount > 0
            ? 'Master data saved. Existing investments were updated to match renamed master values.'
            : 'Master data saved.',
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
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setEditingId(deposit.id)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setActualAccountNumber('')
    setFormValues(mapDepositToFormValues(deposit))
  }

  const startCloning = (deposit) => {
    if (!canEditPortfolio) {
      return
    }

    setEditorReturnTab(activeTab)
    setEditorReturnDepositsScreen(mobileDepositsScreen)
    setActiveTab('editor')
    setMobileDepositsScreen('list')
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setEditingId(null)
    setFormErrors({})
    setSelectedFundingEventId('')
    setFundingAmountDraft('')
    setActualAccountNumber('')
    setFormValues({
      ...createFreshForm(),
      bankName: deposit.bankName ?? '',
      branchCity: deposit.branchCity ?? '',
      holderName: deposit.holderName ?? '',
      fundingSource: deposit.fundingSource ?? '',
      instrumentType: deposit.instrumentType ?? '',
      calculationFrequency: deposit.calculationFrequency || 'QUARTERLY',
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
      investmentDate: deposit.investmentDate ?? '',
      maturityDate: deposit.maturityDate ?? '',
      closureDate: '',
      maturityBeforeTax: deposit.maturityBeforeTax ?? '',
      maturityAfterTax: '',
      totalInterestEarned: '',
      tdsPercent: deposit.tdsPercent ?? '',
      tdsAmount: '',
      status: 'Open',
      allocationsText: '',
      notes: '',
    })
  }

  const renewInvestment = async (deposit, renewalValues) => {
    if (!canEditPortfolio || !deposit?.id || renewingInvestmentId) {
      return null
    }

    setPortfolioActionFeedback('')
    const renewalInvestmentDate = deposit.maturityDate || getEffectiveMaturityDate(deposit)
    const renewalMaturityDate = addTenureToDate(renewalInvestmentDate, deposit)
    const principalAmount = Number(renewalValues?.principalAmount || 0)
    const maturityBeforeTax = Number(renewalValues?.maturityBeforeTax || 0)
    const actualMaturityCash = Number(renewalValues?.actualMaturityCash || 0)

    if (!renewalInvestmentDate) {
      throw new Error('Existing investment does not have a maturity date to renew from.')
    }
    if (!renewalMaturityDate) {
      throw new Error('Could not calculate the renewed maturity date from the existing tenure.')
    }
    if (principalAmount <= 0) {
      throw new Error('Enter the new investment amount.')
    }
    if (maturityBeforeTax <= 0) {
      throw new Error('Enter the new maturity value.')
    }
    if (actualMaturityCash <= 0) {
      throw new Error('Enter the actual maturity cash received.')
    }
    if (principalAmount > actualMaturityCash) {
      throw new Error('New investment value cannot exceed actual maturity cash.')
    }

    const closingMaturityBeforeTax = Math.max(Number(deposit.maturityBeforeTax || 0), actualMaturityCash)
    const closedFormValues = {
      ...mapDepositToFormValues(deposit),
      closureDate: renewalInvestmentDate,
      maturityBeforeTax: closingMaturityBeforeTax,
      maturityAfterTax: actualMaturityCash,
      status: 'Closed',
    }
    const closedDeposit = hydrateDeposit(
      normalizeDeposit(closedFormValues, deposit.id, deposit.srNo || nextSrNo, deposit),
    )
    const allocationsText = formatAllocationsText([
      {
        eventId: getMaturitySourceEventId(deposit.id),
        amount: principalAmount,
      },
    ])
    const nextFormValues = {
      ...mapDepositToFormValues(deposit),
      srNo: '',
      principalAmount,
      investmentDate: renewalInvestmentDate,
      maturityDate: renewalMaturityDate,
      closureDate: '',
      maturityBeforeTax,
      maturityAfterTax: '',
      totalInterestEarned: '',
      tdsAmount: '',
      status: 'Open',
      parentInvestmentId: deposit.id,
      allocationsText,
      notes: '',
    }
    const normalized = normalizeDeposit(nextFormValues, null, nextSrNo)

    if (isDemoMode) {
      const savedDeposit = hydrateDeposit(normalized)
      startTransition(() => {
        setDeposits((current) => [
          savedDeposit,
          ...current.map((currentDeposit) =>
            currentDeposit.id === closedDeposit.id ? closedDeposit : currentDeposit,
          ),
        ])
      })
      setSalarySavings((current) => current.map((saving) => {
        const allocation = renewalValues.salaryAllocations.find(
          (item) => item.salarySavingId === saving.id && Number(item.amount || 0) > 0,
        )
        return allocation
          ? {
              ...saving,
              investmentAllocations: [
                ...(saving.investmentAllocations || []),
                createRenewedInvestmentAllocation(saving.id, savedDeposit, deposit, allocation.amount),
              ],
            }
          : saving
      }))
      focusDepositAfterSave(savedDeposit, true)
      setPortfolioActionFeedback('Renewal created. The previous investment is closed and the new investment is ready to track.')
      return savedDeposit
    }

    try {
      setRenewingInvestmentId(deposit.id)
      setLoadError('')
      const renewalResponse = await requestJson(
        buildOwnerScopedPath(`/api/deposits/${deposit.id}/renew`, activePortfolioOwnerId),
        {
          method: 'POST',
          body: JSON.stringify({
            closedInvestment: closedDeposit,
            successorInvestment: normalized,
            salaryAllocations: renewalValues.salaryAllocations.map((item) => ({
              salarySavingId: item.salarySavingId,
              amount: Number(item.amount || 0),
            })),
          }),
        },
      )
      const savedClosedDeposit = hydrateDeposit(renewalResponse.parent)
      const savedDeposit = hydrateDeposit(renewalResponse.successor)

      startTransition(() => {
        setDeposits((current) => [
          savedDeposit,
          ...current.map((currentDeposit) =>
            currentDeposit.id === savedClosedDeposit.id ? savedClosedDeposit : currentDeposit,
          ),
        ])
      })
      setSalarySavings((current) => current.map((saving) => {
        const allocation = renewalValues.salaryAllocations.find(
          (item) => item.salarySavingId === saving.id && Number(item.amount || 0) > 0,
        )
        return allocation
          ? {
              ...saving,
              investmentAllocations: [
                ...(saving.investmentAllocations || []),
                createRenewedInvestmentAllocation(saving.id, savedDeposit, deposit, allocation.amount),
              ],
            }
          : saving
      }))
      focusDepositAfterSave(savedDeposit, true)
      setPortfolioActionFeedback('Renewal created. The previous investment is closed and the new investment is ready to track.')
      return savedDeposit
    } catch (error) {
      setLoadError(error.message)
      throw error
    } finally {
      setRenewingInvestmentId('')
    }
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
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setActiveTab('deposits')
  }

  const focusDepositAfterSave = (deposit, shouldResetFilters = false) => {
    if (shouldResetFilters) {
      setSearchScope('all')
      setSearchText('')
      setInvestmentDateFrom('')
      setInvestmentDateTo('')
      setMaturityDateFrom('')
      setMaturityDateTo('')
      setShowClosed(true)
      setDepositFilterResetSeed((current) => current + 1)
    }

    setSelectedId(deposit.id)
    setMobileDepositsScreen('detail')
    setMobileDetailSections({
      summary: true,
      funding: false,
      maturity: false,
      interest: false,
    })
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setActiveTab('deposits')
  }

  const openDepositDrilldown = (depositId, searchTextValue = '') => {
    setSearchScope('all')
    setSearchText(String(searchTextValue || '').trim())
    const targetDeposit = activeDeposits.find((deposit) => deposit.id === depositId)
    if (targetDeposit?.status === 'Closed') {
      setShowClosed(true)
    }
    setSelectedId(depositId)
    setMobileDepositsScreen('detail')
    setMobileDetailSections({
      summary: true,
      funding: false,
      maturity: false,
      interest: false,
    })
    setInterestFocusMode('all')
    setMaturityFocusMode('all')
    setActiveTab('deposits')
  }

  const refreshSessionState = async () => {
    const nextSession = normalizeSessionState(await requestJson('/api/auth/session'))
    if (!nextSession.authenticated) {
      setSessionState(createEmptySessionState())
      setActivePortfolioOwnerId('')
      setIsSessionWarningOpen(false)
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
    recordSessionActivity(true)
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
      recordSessionActivity(true)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleLogout = async (silent = false) => performLogout(silent)

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
    let nextFormValues = null

    setFormValues((current) => {
      nextFormValues = { ...current, [name]: value }
      if (name === 'interestPayoutBeforeTds' && String(current.interestPayoutAfterTds ?? '').trim() === '') {
        const grossPayout = Number(value)
        const tdsPercent = Number(current.tdsPercent) > 0 ? Number(current.tdsPercent) : 10
        if (Number.isFinite(grossPayout) && grossPayout >= 0) {
          nextFormValues.interestPayoutAfterTds = Number((grossPayout * (1 - tdsPercent / 100)).toFixed(2))
        }
      }
      if (name === 'instrumentType') {
        nextFormValues.accountNumber = deriveAccountOrCertificateNumber(
          current.bankName,
          value,
          actualAccountNumber,
        )
      }
      return nextFormValues
    })

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
  }

  const handleMasterBoundFieldChange = (event) => {
    if (event.target.value === ADD_NEW_MASTER_VALUE) {
      openMastersForField(event.target.name)
      return
    }

    if (event.target.name === 'bankName') {
      const nextBankName = event.target.value
      setFormValues((current) => ({
        ...current,
        bankName: nextBankName,
        branchCity:
          String(current.bankName || '').trim().toLowerCase() ===
          String(nextBankName || '').trim().toLowerCase()
            ? current.branchCity
            : '',
        accountNumber: deriveAccountOrCertificateNumber(
          nextBankName,
          current.instrumentType,
          actualAccountNumber,
        ),
      }))
      setFormErrors((current) => {
        if (!current.bankName) {
          return current
        }

        const next = { ...current }
        delete next.bankName
        return next
      })
      return
    }

    handleFormChange(event)
  }

  const handleInterestPayoutOverrideChange = (key, field, value) => {
    setFormValues((current) => {
      const currentOverrides = Array.isArray(current.interestPayoutOverrides)
        ? current.interestPayoutOverrides
        : []
      const existing = currentOverrides.find((override) => override?.key === key) || { key }
      const nextOverride = { ...existing, [field]: value === '' ? '' : Number(value) }
      return {
        ...current,
        interestPayoutOverrides: [
          ...currentOverrides.filter((override) => override?.key !== key),
          nextOverride,
        ],
      }
    })
  }

  const handleActualAccountNumberChange = (event) => {
    const value = event.target.value
    setActualAccountNumber(value)
    setFormValues((current) => ({
      ...current,
      accountNumber: deriveAccountOrCertificateNumber(
        current.bankName,
        current.instrumentType,
        value,
      ),
    }))
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

    const effectiveFormValues = formValues

    const nextErrors = {}

    if (!effectiveFormValues.bankName.trim()) {
      nextErrors.bankName = 'Enter bank or issuer name.'
    }
    if (!effectiveFormValues.holderName.trim()) {
      nextErrors.holderName = 'Choose the holder.'
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
    setPortfolioActionFeedback('')

    const isCreatingDeposit = !editingId
    const normalized = normalizeDeposit(effectiveFormValues, editingId, nextSrNo, currentEditingDeposit)

    if (isDemoMode) {
      const savedDeposit = hydrateDeposit(normalized)
      startTransition(() => {
        setDeposits((current) =>
          editingId
            ? current.map((deposit) => (deposit.id === editingId ? savedDeposit : deposit))
            : [savedDeposit, ...current],
        )
      })
      focusDepositAfterSave(savedDeposit, isCreatingDeposit)
      setPortfolioActionFeedback(isCreatingDeposit ? 'Investment added.' : 'Investment changes saved.')
      resetForm()
      return
    }

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

      focusDepositAfterSave(savedDeposit, isCreatingDeposit)
      setPortfolioActionFeedback(isCreatingDeposit ? 'Investment added.' : 'Investment changes saved.')
      resetForm()
    } catch (error) {
      setLoadError(error.message)
    }
  }

  const closeInvestment = async (deposit, closeValues) => {
    if (!canEditPortfolio || !deposit?.id || closingInvestmentId) {
      return null
    }

    setPortfolioActionFeedback('')
    const effectiveCloseValues = {
      closureDate: closeValues?.closureDate ?? toYmd(TODAY),
      maturityBeforeTax: closeValues?.maturityBeforeTax ?? '',
      maturityAfterTax: closeValues?.maturityAfterTax ?? '',
      notes: closeValues?.notes ?? '',
    }
    const nextFormValues = {
      ...mapDepositToFormValues(deposit),
      closureDate: effectiveCloseValues.closureDate,
      maturityBeforeTax: effectiveCloseValues.maturityBeforeTax,
      maturityAfterTax: effectiveCloseValues.maturityAfterTax,
      notes: effectiveCloseValues.notes,
      status: 'Closed',
    }
    const normalized = normalizeDeposit(nextFormValues, deposit.id, deposit.srNo || nextSrNo, deposit)

    if (isDemoMode) {
      const savedDeposit = hydrateDeposit(normalized)
      startTransition(() => {
        setDeposits((current) =>
          current.map((currentDeposit) => (currentDeposit.id === savedDeposit.id ? savedDeposit : currentDeposit)),
        )
      })
      setSelectedId(savedDeposit.id)
      setShowClosed(true)
      setPortfolioActionFeedback('Investment closed. Maturity cash is now reflected in available cash.')
      return savedDeposit
    }

    try {
      setClosingInvestmentId(deposit.id)
      setLoadError('')
      const savedDeposit = hydrateDeposit(
        await requestJson(buildOwnerScopedPath(`/api/deposits/${deposit.id}`, activePortfolioOwnerId), {
          method: 'PUT',
          body: JSON.stringify(normalized),
        }),
      )

      startTransition(() => {
        setDeposits((current) =>
          current.map((currentDeposit) => (currentDeposit.id === savedDeposit.id ? savedDeposit : currentDeposit)),
        )
      })
      setSelectedId(savedDeposit.id)
      setShowClosed(true)
      setPortfolioActionFeedback('Investment closed. Maturity cash is now reflected in available cash.')
      return savedDeposit
    } catch (error) {
      setLoadError(error.message)
      throw error
    } finally {
      setClosingInvestmentId('')
    }
  }

  const settleCashFlowEvent = async (cashFlowEvent) => {
    if (!canEditPortfolio || !cashFlowEvent?.eventId || !cashFlowEvent?.depositId || settlingEventId) {
      return
    }

    setPortfolioActionFeedback('')
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

    if (isDemoMode) {
      const savedDeposit = hydrateDeposit({
        ...sourceDeposit,
        cashSettlements: nextSettlements,
      })
      startTransition(() => {
        setDeposits((current) =>
          current.map((deposit) => (deposit.id === savedDeposit.id ? savedDeposit : deposit)),
        )
      })
      setPortfolioActionFeedback('Cash flow marked settled outside YieldFlow; available-to-reinvest totals updated.')
      return
    }

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
      setPortfolioActionFeedback('Cash flow marked settled outside YieldFlow; available-to-reinvest totals updated.')
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
    setActualAccountNumber('')
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

    setPortfolioActionFeedback('')
    if (isDemoMode) {
      const archivedDeposit = hydrateDeposit({
        ...selectedDeposit,
        isDeleted: true,
        deletedAt: toYmd(new Date()),
      })
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
      setPortfolioActionFeedback('Investment archived.')
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
      setPortfolioActionFeedback('Investment archived.')
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

    setPortfolioActionFeedback('')
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
      setPortfolioActionFeedback('Investment permanently deleted.')
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
    setActualAccountNumber('')
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
    setActualAccountNumber('')
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

  const effectiveEditorPayoutMode = formValues.payoutMode

  const isPeriodicEditor = effectiveEditorPayoutMode !== 'on-maturity'
  const proratedInterestPreview = useMemo(
    () =>
      effectiveEditorPayoutMode === 'quarterly-fy' &&
      formValues.interestPayoutSchedule === 'prorated-boundaries-v1'
        ? generateInterestEvents({ ...formValues, id: 'preview' }).filter(
            (event) => event.isFirstPeriod || event.isFinalPeriod,
          )
        : [],
    [effectiveEditorPayoutMode, formValues],
  )
  const fundingEntries = parseAllocationEntries(formValues.allocationsText)
  const linkedFundingAmount = fundingEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const principalAmountValue = Number(formValues.principalAmount || 0)
  const fundingDifference =
    formValues.principalAmount === '' ? null : principalAmountValue - linkedFundingAmount
  const salaryFundingSummary = useMemo(
    () => summarizeInvestmentSalaryFunding(salarySavings, editingId, principalAmountValue, deposits),
    [deposits, editingId, principalAmountValue, salarySavings],
  )
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
    const selectedBankName = String(formValues.bankName || '').trim()
    if (!selectedBankName) {
      return []
    }

    const selectedInstitution = masterData.institutions.find(
      (institution) => institution.name.toLowerCase() === selectedBankName.toLowerCase(),
    )

    return selectedInstitution ? selectedInstitution.branches.map((branch) => branch.name) : []
  }, [formValues.bankName, masterData.institutions])
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
              ? `${event.bankName} | ${event.accountNumber || 'No account number'} | Interest | ${formatDate(event.date)} | ${formatCurrency(availableAmount)} available`
              : `${event.bankName} | ${event.accountNumber || 'No account number'} | Maturity | ${formatDate(event.date)} | ${formatCurrency(availableAmount)} available`,
        }
      })
      .filter((event) => event.canUse && event.isRealized)
      .sort((left, right) => new Date(left.date) - new Date(right.date))

  const leaveEditorScreen = () => {
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
  const hasActiveDepositFilters =
    searchScope !== 'all' ||
    searchText.trim() !== '' ||
    investmentDateFrom !== '' ||
    investmentDateTo !== '' ||
    maturityDateFrom !== '' ||
    maturityDateTo !== '' ||
    !showClosed
  const mobileCompactHeaderTitle = 'FIXED INCOME PORTFOLIO TRACKER'
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
    'active-principal': 'This is the total amount currently invested in open deposits.',
    'interest-realised':
      'Actual gross interest earned to date in the selected FY, before TDS.',
    'unused-maturity-cash':
      'This is maturity cash already received and available to reinvest.',
    'interest-not-reused': 'This is interest cash already received and available to reinvest.',
    'upcoming-interest':
      'This only shows future interest for deposits that pay interest before maturity, like quarterly or yearly payout products.',
    'maturity-section':
      maturityFocusMode === 'pending'
        ? 'These are deposits whose maturity money has come in but is still not fully used.'
        : 'These are the next deposits that will mature soon.',
    'interest-section':
      interestFocusMode === 'upcoming'
        ? `These are periodic interest payouts expected in the next ${DASHBOARD_UPCOMING_CASH_WINDOW_DAYS} days.`
        : interestFocusMode === 'realizing'
        ? 'These are actual gross interest receipts earned to date in the selected FY, including maturity interest and periodic payouts.'
        : interestFocusMode === 'pending'
        ? 'These are interest amounts already received and still available to reinvest.'
        : 'These are upcoming interest payouts from deposits that pay before maturity.',
  }

  const toggleMobileDetailSection = (sectionKey) => {
    setMobileDetailSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const buildDesktopHelpPopover = (button, text, key) => {
    if (!button || typeof window === 'undefined') {
      return null
    }

    const rect = button.getBoundingClientRect()
    const popoverWidth = Math.min(240, window.innerWidth - 24)
    const popoverHeight = 72
    const gap = 10
    const availableBelow = window.innerHeight - rect.bottom - 16
    const shouldOpenBelow = availableBelow >= popoverHeight || rect.top < popoverHeight + 32
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - popoverWidth / 2, 12),
      window.innerWidth - popoverWidth - 12,
    )

    return {
      key,
      text,
      placement: shouldOpenBelow ? 'below' : 'above',
      style: {
        left: `${left}px`,
        top: shouldOpenBelow ? `${rect.bottom + gap}px` : `${rect.top - popoverHeight - gap}px`,
      },
    }
  }

  const syncDesktopHelpPopover = useCallback((key, text) => {
    if (isMobile) {
      setDesktopHelpPopover(null)
      return
    }

    const button = helpTriggerRefs.current.get(key)
    setDesktopHelpPopover(buildDesktopHelpPopover(button, text, key))
  }, [isMobile])

  useEffect(() => {
    if (!desktopHelpPopover || isMobile || !desktopHelpPopoverRef.current) {
      return undefined
    }

    const adjustPopover = () => {
      const popover = desktopHelpPopoverRef.current
      if (!popover) {
        return
      }

      const rect = popover.getBoundingClientRect()
      const margin = 12
      let nextLeft = rect.left
      let nextTop = rect.top

      if (rect.left < margin) {
        nextLeft = margin
      } else if (rect.right > window.innerWidth - margin) {
        nextLeft = window.innerWidth - rect.width - margin
      }

      if (rect.top < margin) {
        nextTop = margin
      } else if (rect.bottom > window.innerHeight - margin) {
        nextTop = window.innerHeight - rect.height - margin
      }

      const currentLeft = Number.parseFloat(desktopHelpPopover.style.left)
      const currentTop = Number.parseFloat(desktopHelpPopover.style.top)
      if (
        Number.isFinite(currentLeft) &&
        Number.isFinite(currentTop) &&
        Math.abs(nextLeft - currentLeft) < 1 &&
        Math.abs(nextTop - currentTop) < 1
      ) {
        return
      }

      setDesktopHelpPopover((current) => (
        current
          ? {
              ...current,
              style: {
                ...current.style,
                left: `${nextLeft}px`,
                top: `${nextTop}px`,
              },
            }
          : current
      ))
    }

    const frameId = window.requestAnimationFrame(adjustPopover)
    return () => window.cancelAnimationFrame(frameId)
  }, [desktopHelpPopover, isMobile])

  useEffect(() => {
    if (!desktopHelpPopover || isMobile) {
      return undefined
    }

    const refreshPosition = () => {
      syncDesktopHelpPopover(desktopHelpPopover.key, desktopHelpPopover.text)
    }

    const handlePointerDown = (event) => {
      const trigger = helpTriggerRefs.current.get(desktopHelpPopover.key)
      if (trigger && trigger.contains(event.target)) {
        return
      }

      setActiveHelpKey(null)
      setDesktopHelpPopover(null)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveHelpKey(null)
        setDesktopHelpPopover(null)
      }
    }

    window.addEventListener('resize', refreshPosition)
    window.addEventListener('scroll', refreshPosition, true)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', refreshPosition)
      window.removeEventListener('scroll', refreshPosition, true)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [desktopHelpPopover, isMobile, syncDesktopHelpPopover])

  const renderHelpHint = (key, text) => (
    <span className="help-inline">
      <button
        type="button"
        className="help-trigger"
        data-help-key={key}
        aria-label="Show simple explanation"
        aria-expanded={activeHelpKey === key}
        ref={(node) => {
          if (node) {
            helpTriggerRefs.current.set(key, node)
          } else {
            helpTriggerRefs.current.delete(key)
          }
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const triggerButton = event.currentTarget
          setActiveHelpKey((current) => {
            const nextKey = current === key ? null : key
            if (isMobile) {
              setDesktopHelpPopover(null)
            } else if (nextKey) {
              setDesktopHelpPopover(buildDesktopHelpPopover(triggerButton, text, key))
            } else {
              setDesktopHelpPopover(null)
            }
            return nextKey
          })
        }}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
        }}
      >
        i
      </button>
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
    setIsSettingsOpen(false)
    setIsUserMenuOpen(false)
  }

  const closeMastersView = () => {
    const nextTab =
      mastersReturnTarget && mastersReturnTarget !== 'editor'
        ? mastersReturnTarget
        : mastersReturnTarget === 'editor'
          ? 'editor'
          : 'dashboard'

    setActiveTab(nextTab)
    setMastersReturnTarget(null)
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

  const showRealizedInterestDrilldown = () => {
    setIsReinvestmentDrilldownOpen(false)
    setInterestFocusMode('realizing')
    scrollToDashboardSection('dashboard-interest-section')
  }

  const showReinvestmentDrilldown = () => {
    setIsReinvestmentDrilldownOpen(true)
    setShowAllReinvestmentItems(false)
    setMaturityFocusMode('all')
    setInterestFocusMode('all')
    scrollToDashboardSection('dashboard-reinvestment-section')
  }

  const showUpcomingMaturityDrilldown = () => {
    setIsReinvestmentDrilldownOpen(false)
    setMaturityFocusMode('all')
    setShowAllMaturityItems(false)
    scrollToDashboardSection('dashboard-maturity-section')
  }

  const showUpcomingPayoutsDrilldown = () => {
    setIsReinvestmentDrilldownOpen(false)
    setInterestFocusMode('upcoming')
    setShowAllInterestItems(false)
    scrollToDashboardSection('dashboard-interest-section')
  }

  const handleBulkImportSuccess = async () => {
    setPortfolioReloadSeed((current) => current + 1)
  }

  const handleBackupRestoreSuccess = async () => {
    setPortfolioReloadSeed((current) => current + 1)
  }

  const dashboardProps = {
    dashboardPreviewLimit: DASHBOARD_PREVIEW_LIMIT,
    dashboardUpcomingCashWindowDays: DASHBOARD_UPCOMING_CASH_WINDOW_DAYS,
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
  }

  const settingsPanelProps = {
    activePortfolioLabel,
    activePortfolioOwnerId,
    brokenAvatarUrl,
    canEditPortfolio,
    canUseAdmin,
    expandedSettingsSection,
    handleBackupRestoreSuccess,
    handleCreateShare,
    handleDeleteShare,
    isAdminUser,
    isDemoMode,
    isReadOnlyPortfolio,
    isSubmittingShare,
    openAdmin,
    sessionState,
    setActivePortfolioOwnerId,
    setActiveTab,
    setBrokenAvatarUrl,
    setIsSettingsOpen,
    setMastersReturnTarget,
    setShareEmail,
    setThemeClass,
    shareEmail,
    shareFeedback,
    sharesState,
    themeClass,
    toggleSettingsSection,
    visibleActiveTab,
  }

  const desktopTabs = [
    ['dashboard', 'Dashboard'],
    ['deposits', 'Deposits'],
    ['salary-savings', 'Salary savings'],
  ]

  const mobileTabs = [
    ['dashboard', 'Dashboard'],
    ['deposits', 'Deposits'],
    ['salary-savings', 'Savings'],
  ]

  if (currentPathname === '/privacy') {
    return <PrivacyPolicyView themeClass={themeClass} appHomeUrl={APP_HOME_URL} authorLinkedinUrl={AUTHOR_LINKEDIN_URL} />
  }

  if (currentPathname === '/terms') {
    return <TermsOfServiceView themeClass={themeClass} appHomeUrl={APP_HOME_URL} authorLinkedinUrl={AUTHOR_LINKEDIN_URL} />
  }

  if (!sessionState.authenticated && !isDemoMode) {
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
            <div className="app-topbar-brand">
              <img src={yieldFlowLogo} alt="YieldFlow logo" className="app-logo" />
              <div className="app-topbar-copy">
                <strong className="app-topbar-title">Yield<span>Flow</span></strong>
                <span className="app-topbar-subtitle">{mobileCompactHeaderTitle}</span>
              </div>
            </div>
            <div className="app-topbar-actions">
              {!isMobile && canEditPortfolio && (
                <button
                  type="button"
                  className="primary-btn compact add-investment-btn"
                  onClick={startNewDeposit}
                >
                  {isDemoMode ? 'Try adding one' : '+ Add Investment'}
                </button>
              )}
              {isDemoMode && (
                <button
                  type="button"
                  className="secondary-btn compact"
                  onClick={() => openSettingsPanel('appearance')}
                >
                  Settings
                </button>
              )}
              {!isDemoMode && (
              <div className="user-menu-shell" ref={userMenuRef}>
                <button
                  type="button"
                  className={isUserMenuOpen ? 'icon-btn active' : 'icon-btn'}
                  onClick={() => setIsUserMenuOpen((current) => !current)}
                  aria-label="Open account menu"
                  aria-expanded={isUserMenuOpen}
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
                {isUserMenuOpen ? (
                  <div className="user-menu panel">
                    <div className="user-menu-copy">
                      <strong>{sessionState.user?.displayName || 'Your account'}</strong>
                      <span>{sessionState.user?.email}</span>
                    </div>
                    <button
                      type="button"
                      className="user-menu-item"
                      onClick={() => openSettingsPanel('account')}
                    >
                      My account
                    </button>
                    <button
                      type="button"
                      className="user-menu-item"
                      onClick={() => openSettingsPanel('sharing')}
                    >
                      Portfolio sharing
                    </button>
                    <button
                      type="button"
                      className="user-menu-item"
                      onClick={() => openSettingsPanel('advanced')}
                    >
                      Backup & restore
                    </button>
                    <button
                      type="button"
                      className="user-menu-item"
                      onClick={() => openSettingsPanel('advanced')}
                    >
                      More settings
                    </button>
                    <button
                      type="button"
                      className="user-menu-item warning"
                      onClick={() => handleLogout(false)}
                    >
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
              )}
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

      {isDemoMode && (
        <section className="demo-mode-banner" role="status">
          <div>
            <strong>Demo mode</strong>
            <span>Explore sample data. Changes reset on refresh.</span>
          </div>
          <div className="demo-mode-actions">
            <button type="button" className="secondary-btn compact ghost-btn" onClick={() => loadDemoPortfolio()}>
              Reset
            </button>
            <a className="primary-btn compact" href="/">
              Sign in
            </a>
          </div>
        </section>
      )}

      {isSettingsOpen && (
        <SettingsPanel
          {...settingsPanelProps}
        />
      )}

      {showHeroStrip && (
        <section className="mobile-hero-strip">
          {isDemoMode ? (
            <p>Exploring {DEMO_PORTFOLIO_LABEL}. Changes stay in this browser session only.</p>
          ) : isReadOnlyPortfolio ? (
            <p>Viewing {activePortfolioLabel} in read-only mode.</p>
          ) : null}
        </section>
      )}

      {showFullHeroCard && (
        <header className="hero-card">
          <div className="hero-brand">
            <img src={yieldFlowLogo} alt="YieldFlow logo" className="hero-logo" />
            <div>
              <p className="eyebrow">YieldFlow</p>
              <h1 className="hero-title">Track maturity and reinvestment.</h1>
            </div>
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
          {isLoading ? (isDemoMode ? 'Loading demo portfolio...' : 'Loading your portfolio...') : loadError}
        </section>
      )}

      {!isLoading && portfolioActionFeedback ? (
        <section className="status-banner status-banner-action" role="status" aria-live="polite">
          <span>{portfolioActionFeedback}</span>
          <button type="button" onClick={() => setPortfolioActionFeedback('')}>
            Dismiss
          </button>
        </section>
      ) : null}

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

      {!isMobile && desktopHelpPopover && (
        <div
          ref={desktopHelpPopoverRef}
          className={`help-popover-global help-popover-global-${desktopHelpPopover.placement}`}
          style={desktopHelpPopover.style}
          role="status"
          aria-live="polite"
        >
          {desktopHelpPopover.text}
        </div>
      )}

      {visibleActiveTab === 'dashboard' && <DashboardView {...dashboardProps} />}

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
          depositFilterResetSeed={depositFilterResetSeed}
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
          setSelectedId={setSelectedId}
          selectedDeposit={selectedDeposit}
          selectedSourceEvents={selectedSourceEvents}
          selectedReinvestmentSummary={selectedReinvestmentSummary}
          selectedInterestEvents={selectedInterestEvents}
          selectedInterestSummary={selectedInterestSummary}
          archiveTargetId={archiveTargetId}
          isArchiving={isArchiving}
          deleteTargetId={deleteTargetId}
          isDeleting={isDeleting}
          closingInvestmentId={closingInvestmentId}
          startNewDeposit={startNewDeposit}
          openDepositDetail={openDepositDetail}
          setMobileDepositsScreen={setMobileDepositsScreen}
          startCloning={startCloning}
          startEditing={startEditing}
          renewInvestment={renewInvestment}
          salarySavings={salarySavings}
          renewingInvestmentId={renewingInvestmentId}
          startArchive={startArchive}
          cancelArchive={cancelArchive}
          confirmArchive={confirmArchive}
          startDelete={startDelete}
          cancelDelete={cancelDelete}
          confirmDelete={confirmDelete}
          closeInvestment={closeInvestment}
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

      {visibleActiveTab === 'salary-savings' && (
        <SalarySavingsView
          savings={salarySavings}
          investments={deposits.filter((deposit) => !deposit.isDeleted)}
          ownerUserId={activePortfolioOwnerId}
          isReadOnly={isReadOnlyPortfolio || isDemoMode}
          selectedFinancialYear={selectedFinancialYear}
          financialYearOptions={financialYearOptions}
          onFinancialYearChange={setSelectedFinancialYear}
          saveFeedback={salarySaveFeedback}
          onSaveStarted={() => setSalarySaveFeedback('')}
          onSaved={(message) => {
            setSalarySaveFeedback(message)
            setPortfolioReloadSeed((current) => current + 1)
          }}
        />
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
          actualAccountNumber={actualAccountNumber}
          handleActualAccountNumberChange={handleActualAccountNumberChange}
          handleMasterBoundFieldChange={handleMasterBoundFieldChange}
          effectiveEditorPayoutMode={effectiveEditorPayoutMode}
          isPeriodicEditor={isPeriodicEditor}
          proratedInterestPreview={proratedInterestPreview}
          handleInterestPayoutOverrideChange={handleInterestPayoutOverrideChange}
          linkedFundingAmount={linkedFundingAmount}
          fundingDifference={fundingDifference}
          salaryFundingSummary={salaryFundingSummary}
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
          onClose={closeMastersView}
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

      {isSessionWarningOpen ? (
        <div
          className="about-modal-backdrop"
          role="presentation"
          onClick={() => setIsSessionWarningOpen(false)}
        >
          <section
            className="about-modal panel session-warning-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-warning-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <div>
                <h2 id="session-warning-title">Session expiring soon</h2>
                <p>
                  Your session will expire in{' '}
                  {Math.max(Math.round((SESSION_TIMEOUT_MS - SESSION_WARNING_MS) / 60000), 1)}{' '}
                  minutes due to inactivity.
                </p>
              </div>
            </div>
            <div className="backup-warning-card">
              <strong>Stay signed in to keep working.</strong>
              <p>
                Move the mouse, press a key, or choose an action below to keep your session active.
              </p>
            </div>
            <div className="backup-confirm-modal-actions">
              <button
                type="button"
                className="secondary-btn compact ghost-btn"
                onClick={() => recordSessionActivity(true)}
              >
                Stay signed in
              </button>
              <button
                type="button"
                className="primary-btn compact-btn"
                onClick={() => handleLogout(false)}
              >
                Logout now
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="app-footer-signature">
        <span>Built by Parth Dave</span>
        <span aria-hidden="true">•</span>
        <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <span aria-hidden="true">•</span>
        <button type="button" className="footer-inline-btn" onClick={() => setIsAboutOpen(true)}>
          About
        </button>
        <span aria-hidden="true">•</span>
        <a href={`${APP_HOME_URL}/privacy`}>Privacy</a>
        <span aria-hidden="true">•</span>
        <a href={`${APP_HOME_URL}/terms`}>Terms</a>
      </footer>

      {isAboutOpen && (
        <div
          className="about-modal-backdrop"
          role="presentation"
          onClick={() => setIsAboutOpen(false)}
        >
          <section
            className="about-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-yieldflow-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <div>
                <h2 id="about-yieldflow-title">About YieldFlow</h2>
                <p>A financial lifecycle management tool focused on cashflow visibility, interest tracking, and reinvestment decisions.</p>
              </div>
              <button
                type="button"
                className="secondary-btn compact ghost-btn"
                onClick={() => setIsAboutOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="about-modal-copy">
              <div className="about-modal-signature">
                <strong>Built by Parth Dave</strong>
                <span>Technology Leader • Banking &amp; Financial Systems</span>
              </div>
              <a
                className="secondary-btn compact ghost-btn"
                href={AUTHOR_LINKEDIN_URL}
                target="_blank"
                rel="noreferrer"
              >
                View LinkedIn
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
