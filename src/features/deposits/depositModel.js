export const TODAY = new Date()
export const FY_QUARTER_MONTH_DAYS = [
  [2, 31],
  [5, 30],
  [8, 30],
  [11, 31],
]

export const emptyForm = {
  srNo: '',
  bankName: '',
  branchCity: '',
  holderName: '',
  fundingSource: '',
  instrumentType: '',
  payoutMode: 'on-maturity',
  yearlyPayoutMonthDay: '',
  interestPayoutBeforeTds: '',
  interestPayoutAfterTds: '',
  accountNumber: '',
  tenureYears: '0',
  tenureMonths: '0',
  tenureDays: '0',
  interestRate: '',
  principalAmount: '',
  investmentDate: '',
  maturityDate: '',
  maturityBeforeTax: '',
  maturityAfterTax: '',
  totalInterestEarned: '',
  tdsPercent: '10',
  tdsAmount: '',
  status: 'Open',
  allocationsText: '',
  notes: '',
}

export const formatCurrency = (value) => {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'Rs 0'
  }

  return `Rs ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Number(value))}`
}

export const computeTdsAmount = (maturityBeforeTax, maturityAfterTax) => {
  const grossAmount = parseNumber(maturityBeforeTax)
  const netAmount = parseNumber(maturityAfterTax)

  if (grossAmount === '' || netAmount === '') {
    return 0
  }

  return Math.max(Number(grossAmount) - Number(netAmount), 0)
}

export const computeTdsPercent = (principalAmount, maturityBeforeTax, maturityAfterTax) => {
  const principal = parseNumber(principalAmount)
  const grossAmount = parseNumber(maturityBeforeTax)
  const tdsAmount = computeTdsAmount(maturityBeforeTax, maturityAfterTax)
  const preTdsInterest =
    principal === '' || grossAmount === ''
      ? 0
      : Math.max(Number(grossAmount) - Number(principal), 0)

  if (preTdsInterest <= 0 || tdsAmount <= 0) {
    return 0
  }

  return Number(((tdsAmount / preTdsInterest) * 100).toFixed(2))
}

export const formatDate = (value) => {
  if (!value) {
    return '--'
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export const formatTenure = (deposit) => {
  const years = Number(deposit?.tenureYears || 0)
  const months = Number(deposit?.tenureMonths || 0)
  const days = Number(deposit?.tenureDays || 0)
  const parts = []

  if (years > 0) {
    parts.push(`${years} Year${years === 1 ? '' : 's'}`)
  }
  if (months > 0) {
    parts.push(`${months} Month${months === 1 ? '' : 's'}`)
  }
  if (days > 0) {
    parts.push(`${days} Day${days === 1 ? '' : 's'}`)
  }

  return parts.length > 0 ? parts.join(' ') : '--'
}

export const createRecordId = () => `fd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return ''
  }

  const number = Number(value)
  return Number.isNaN(number) ? '' : number
}

const getDaysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate()

const shiftDateByCalendar = (date, years = 0, months = 0) => {
  const source = new Date(date)
  const sourceDay = source.getDate()
  const targetMonthIndex = source.getMonth() + months
  const targetYear = source.getFullYear() + years + Math.floor(targetMonthIndex / 12)
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
  const cappedDay = Math.min(sourceDay, getDaysInMonth(targetYear, normalizedMonthIndex))

  return new Date(targetYear, normalizedMonthIndex, cappedDay)
}

const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime())

export const deriveTenureParts = (investmentDate, maturityDate) => {
  if (!investmentDate || !maturityDate) {
    return { years: 0, months: 0, days: 0 }
  }

  const start = new Date(`${investmentDate}T00:00:00`)
  const end = new Date(`${maturityDate}T00:00:00`)

  if (!isValidDate(start) || !isValidDate(end) || end < start) {
    return { years: 0, months: 0, days: 0 }
  }

  let years = end.getFullYear() - start.getFullYear()
  while (years > 0 && shiftDateByCalendar(start, years, 0) > end) {
    years -= 1
  }

  const afterYears = shiftDateByCalendar(start, years, 0)
  let months =
    (end.getFullYear() - afterYears.getFullYear()) * 12 +
    (end.getMonth() - afterYears.getMonth())
  while (months > 0 && shiftDateByCalendar(afterYears, 0, months) > end) {
    months -= 1
  }

  const afterMonths = shiftDateByCalendar(afterYears, 0, months)
  const days = Math.max(
    Math.round((end.getTime() - afterMonths.getTime()) / (1000 * 60 * 60 * 24)),
    0,
  )

  return { years, months, days }
}

export const parseAllocationEntries = (value) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [eventIdPart, amountPart] = line.split('=')
      return {
        eventId: (eventIdPart || '').trim(),
        amount: Number((amountPart || '').trim()),
      }
    })
    .filter((entry) => entry.eventId && Number.isFinite(entry.amount) && entry.amount > 0)

export const formatAllocationsText = (allocations) =>
  (allocations || []).map((allocation) => `${allocation.eventId}=${allocation.amount}`).join('\n')

export const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export const toYmd = (date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getCurrentFinancialYearRange = (today) => {
  const year = today.getFullYear()
  const month = today.getMonth()
  const startYear = month >= 3 ? year : year - 1
  const endYear = startYear + 1

  return {
    start: new Date(startYear, 3, 1),
    end: new Date(endYear, 2, 31, 23, 59, 59, 999),
    label: `${startYear}-${String(endYear).slice(-2)}`,
  }
}

export const getFinancialYearLabelFromDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = date.getMonth()
  const startYear = month >= 3 ? year : year - 1
  const endYear = startYear + 1

  return `${startYear}-${String(endYear).slice(-2)}`
}

export const getFinancialYearRangeFromLabel = (label) => {
  const [startYearText] = String(label || '').split('-')
  const startYear = Number(startYearText)

  if (!Number.isFinite(startYear)) {
    return getCurrentFinancialYearRange(TODAY)
  }

  return {
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
    label,
  }
}

export const HOLDER_ALIASES = {
  me: ['me', 'self', 'myself', 'mine'],
  wife: ['wife', 'spouse'],
  husband: ['husband', 'spouse'],
  mother: ['mother', 'mom', 'mummy', 'maa'],
  father: ['father', 'dad', 'papa'],
  kid: ['kid', 'child', 'son', 'daughter'],
  huf: ['huf'],
}

export const normalizeText = (value) => String(value || '').trim().toLowerCase()

export const getHolderSearchTokens = (holderName, aliasLookup = HOLDER_ALIASES) => {
  const normalized = normalizeText(holderName)
  const aliasMatches = Object.entries(aliasLookup)
    .filter(([canonical, aliases]) => canonical === normalized || aliases.includes(normalized))
    .flatMap(([canonical, aliases]) => [canonical, ...aliases])

  return Array.from(new Set([normalized, ...aliasMatches]))
}

export const getDateSortValue = (value) => {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time
}

export const getPostTdsAmount = (deposit) => {
  if (deposit.maturityAfterTax !== '' && deposit.maturityAfterTax !== null && deposit.maturityAfterTax !== undefined) {
    return Number(deposit.maturityAfterTax)
  }

  return null
}

export const getMaturitySourceEventId = (depositId) => `maturity:${depositId}`

export const hydrateDeposit = (deposit) => {
  const tenure = deriveTenureParts(deposit.investmentDate, deposit.maturityDate)

  return Object.assign(
    {
      instrumentType: '',
      payoutMode: 'on-maturity',
      yearlyPayoutMonthDay: '',
      interestPayoutBeforeTds: '',
      interestPayoutAfterTds: '',
      tenureYears: tenure.years,
      tenureMonths: tenure.months,
      tenureDays: tenure.days,
      allocations: [],
      isDeleted: false,
    },
    deposit,
    {
      instrumentType: deposit.instrumentType || '',
      payoutMode: deposit.payoutMode || 'on-maturity',
      yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay || '',
      interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
      interestPayoutAfterTds: deposit.interestPayoutAfterTds ?? '',
      tenureYears: tenure.years,
      tenureMonths: tenure.months,
      tenureDays: tenure.days,
      allocations: deposit.allocations || [],
      isDeleted: Boolean(deposit.isDeleted),
    },
  )
}

export const getFundingAllocations = (deposit) => {
  if (!deposit.allocations) {
    return []
  }

  return deposit.allocations.filter(
    (allocation) => allocation?.eventId && Number.isFinite(Number(allocation.amount)),
  )
}

export const getPayoutModeLabel = (deposit) => {
  const payoutMode = getEffectivePayoutMode(deposit)

  if (payoutMode === 'quarterly-fy') {
    return 'Quarterly at FY quarter end'
  }

  if (payoutMode === 'yearly-fixed') {
    return deposit.yearlyPayoutMonthDay
      ? `Yearly on ${deposit.yearlyPayoutMonthDay}`
      : 'Yearly on fixed date'
  }

  return 'On maturity only'
}

export const getEffectivePayoutMode = (deposit) => {
  if (deposit.instrumentType === 'SCSS') {
    return 'quarterly-fy'
  }

  if (
    deposit.instrumentType === 'Bond' &&
    deposit.payoutMode === 'on-maturity' &&
    deposit.yearlyPayoutMonthDay
  ) {
    return 'yearly-fixed'
  }

  return deposit.payoutMode
}

export const needsPeriodicPayoutSetup = (deposit) =>
  getEffectivePayoutMode(deposit) !== 'on-maturity' &&
  (deposit.interestPayoutAfterTds === '' ||
    deposit.interestPayoutAfterTds === null ||
    deposit.interestPayoutAfterTds === undefined)

export const createInterestEvent = (deposit, date) => {
  const grossAmount = Number(deposit.interestPayoutBeforeTds || 0)
  const netAmount = Number(deposit.interestPayoutAfterTds || 0)

  return {
    eventId: `interest:${deposit.id}:${date}`,
    depositId: deposit.id,
    type: 'Interest',
    date,
    amount: netAmount,
    grossAmount,
    holderName: deposit.holderName,
    bankName: deposit.bankName,
    accountNumber: deposit.accountNumber,
    sourceLabel: `${deposit.instrumentType} interest`,
    title: `${deposit.bankName} interest credit`,
  }
}

export const generateInterestEvents = (deposit) => {
  const payoutMode = getEffectivePayoutMode(deposit)

  if (
    payoutMode === 'on-maturity' ||
    !deposit.investmentDate ||
    !deposit.maturityDate ||
    deposit.interestPayoutAfterTds === ''
  ) {
    return []
  }

  const investmentDate = new Date(`${deposit.investmentDate}T00:00:00`)
  const maturityDate = new Date(`${deposit.maturityDate}T00:00:00`)
  const events = []

  if (payoutMode === 'quarterly-fy') {
    for (let year = investmentDate.getFullYear(); year <= maturityDate.getFullYear(); year += 1) {
      FY_QUARTER_MONTH_DAYS.forEach(([monthIndex, day]) => {
        const candidate = new Date(year, monthIndex, day)
        if (candidate > investmentDate && candidate < maturityDate) {
          const date = toYmd(candidate)
          events.push(createInterestEvent(deposit, date))
        }
      })
    }

    return events.sort((left, right) => new Date(left.date) - new Date(right.date))
  }

  if (payoutMode === 'yearly-fixed' && deposit.yearlyPayoutMonthDay) {
    const [month, day] = deposit.yearlyPayoutMonthDay.split('-').map(Number)

    for (let year = investmentDate.getFullYear(); year <= maturityDate.getFullYear(); year += 1) {
      const candidate = new Date(year, month - 1, day)
      if (candidate > investmentDate && candidate < maturityDate) {
        const date = toYmd(candidate)
        events.push(createInterestEvent(deposit, date))
      }
    }
  }

  return events.sort((left, right) => new Date(left.date) - new Date(right.date))
}

export const normalizeDeposit = (formValues, existingId, fallbackSrNo) => {
  const holderName = formValues.holderName.trim()
  const maturityDate = formValues.maturityDate
  const principalAmount = parseNumber(formValues.principalAmount)
  const maturityAfterTax = parseNumber(formValues.maturityAfterTax)
  const maturityBeforeTax = parseNumber(formValues.maturityBeforeTax)
  const computedTdsAmount = computeTdsAmount(maturityBeforeTax, maturityAfterTax)
  const computedTdsPercent = computeTdsPercent(principalAmount, maturityBeforeTax, maturityAfterTax)
  const computedInterest =
    maturityAfterTax !== '' && principalAmount !== ''
      ? Math.max(Number(maturityAfterTax) - Number(principalAmount), 0)
      : 0

  const tenure = deriveTenureParts(formValues.investmentDate, formValues.maturityDate)

  return hydrateDeposit({
    id: existingId || createRecordId(),
    srNo: parseNumber(formValues.srNo) || fallbackSrNo,
    bankName: formValues.bankName.trim(),
    branchCity: formValues.branchCity.trim(),
    holderName,
    fundingSource: formValues.fundingSource.trim(),
    instrumentType: formValues.instrumentType,
    payoutMode: formValues.payoutMode,
    yearlyPayoutMonthDay: formValues.yearlyPayoutMonthDay.trim(),
    interestPayoutBeforeTds: parseNumber(formValues.interestPayoutBeforeTds),
    interestPayoutAfterTds: parseNumber(formValues.interestPayoutAfterTds),
    accountNumber: formValues.accountNumber.trim(),
    tenureYears: tenure.years,
    tenureMonths: tenure.months,
    tenureDays: tenure.days,
    interestRate: parseNumber(formValues.interestRate),
    principalAmount,
    investmentDate: formValues.investmentDate,
    maturityDate,
    maturityBeforeTax,
    maturityAfterTax,
    totalInterestEarned: computedInterest,
    tdsPercent: computedTdsPercent,
    tdsAmount: computedTdsAmount,
    status: formValues.status,
    allocations: parseAllocationEntries(formValues.allocationsText),
    notes: formValues.notes.trim(),
  })
}

export const requestJson = async (url, options = {}) => {
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
  const normalizedUrl = String(url || '')
  const requestUrl =
    apiBaseUrl && normalizedUrl.startsWith('/')
      ? `${apiBaseUrl}${normalizedUrl}`
      : normalizedUrl
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

  const response = await fetch(requestUrl, {
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    ...options,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || `Request failed with status ${response.status}`)
  }

  return data
}
