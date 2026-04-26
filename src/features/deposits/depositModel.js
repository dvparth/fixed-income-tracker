export const TODAY = new Date()
export const FY_QUARTER_MONTH_DAYS = [
  [2, 31],
  [5, 30],
  [8, 30],
  [11, 31],
]

export const sampleDeposits = [
  {
    id: 'fd-1',
    srNo: 1,
    bankName: 'State Bank of India',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Me',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'SBI-FD-1048',
    tenure: '1 Year',
    interestRate: 7.1,
    principalAmount: 100000,
    investmentDate: '2025-04-15',
    maturityDate: '2026-04-15',
    maturityBeforeTax: 107100,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [],
    notes: 'Renewal candidate for April cash flow.',
  },
  {
    id: 'fd-2',
    srNo: 2,
    bankName: 'HDFC Bank',
    branchCity: 'Jaipur',
    holderName: 'Wife',
    fundingSource: 'Me',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'HDFC-FD-2881',
    tenure: '444 Days',
    interestRate: 7.45,
    principalAmount: 150000,
    investmentDate: '2024-02-26',
    maturityDate: '2025-05-15',
    maturityBeforeTax: 164400,
    maturityAfterTax: 163000,
    totalInterestEarned: 13000,
    tdsPercent: 10,
    tdsAmount: 1400,
    status: 'Closed',
    allocations: [],
    notes: 'Matured and fully allocated into three follow-up deposits.',
  },
  {
    id: 'fd-3',
    srNo: 3,
    bankName: 'ICICI Bank',
    branchCity: 'Jaipur',
    holderName: 'Kid',
    fundingSource: 'Wife',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'ICICI-FD-8127',
    tenure: '18 Months',
    interestRate: 7.3,
    principalAmount: 90000,
    investmentDate: '2025-05-16',
    maturityDate: '2026-11-16',
    maturityBeforeTax: 100700,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [{ eventId: 'maturity:fd-2', amount: 90000 }],
    notes: 'One branch of the maturity reinvestment chain.',
  },
  {
    id: 'fd-4',
    srNo: 4,
    bankName: 'Axis Bank',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Wife',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'AXIS-FD-3980',
    tenure: '1 Year',
    interestRate: 7.05,
    principalAmount: 70000,
    investmentDate: '2025-05-16',
    maturityDate: '2026-05-16',
    maturityBeforeTax: 74935,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [{ eventId: 'maturity:fd-2', amount: 70000 }],
    notes: 'Second part of the same maturity reinvested.',
  },
  {
    id: 'fd-5',
    srNo: 5,
    bankName: 'Post Office',
    branchCity: 'Jaipur',
    holderName: 'Mother',
    fundingSource: 'Me',
    instrumentType: 'SCSS',
    payoutMode: 'quarterly-fy',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: 6150,
    interestPayoutAfterTds: 5535,
    accountNumber: 'SCSS-2025-7712',
    tenure: '5 Year',
    interestRate: 8.2,
    principalAmount: 300000,
    investmentDate: '2025-04-10',
    maturityDate: '2030-04-10',
    maturityBeforeTax: 300000,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [],
    notes: 'Quarterly interest credited at financial year quarter end.',
  },
  {
    id: 'fd-6',
    srNo: 6,
    bankName: 'REC Bond',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Me',
    instrumentType: 'Bond',
    payoutMode: 'yearly-fixed',
    yearlyPayoutMonthDay: '07-15',
    interestPayoutBeforeTds: 15500,
    interestPayoutAfterTds: 13950,
    accountNumber: 'REC-2025-9911',
    tenure: '5 Year',
    interestRate: 7.75,
    principalAmount: 200000,
    investmentDate: '2024-07-15',
    maturityDate: '2029-07-15',
    maturityBeforeTax: 200000,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [],
    notes: 'Annual coupon style payout on fixed date.',
  },
  {
    id: 'fd-7',
    srNo: 7,
    bankName: 'Union Bank of India',
    branchCity: 'Jaipur',
    holderName: 'Mother',
    fundingSource: 'Mother',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'UBI-FD-5510',
    tenure: '1 Year',
    interestRate: 6.9,
    principalAmount: 4500,
    investmentDate: '2025-07-02',
    maturityDate: '2026-07-02',
    maturityBeforeTax: 4811,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [{ eventId: 'interest:fd-5:2025-06-30', amount: 4500 }],
    notes: 'Funded using the first SCSS quarterly interest credit.',
  },
  {
    id: 'fd-8',
    srNo: 8,
    bankName: 'IDFC First Bank',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Me',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'IDFC-FD-2218',
    tenure: '1 Year',
    interestRate: 7.25,
    principalAmount: 15000,
    investmentDate: '2025-10-05',
    maturityDate: '2026-10-05',
    maturityBeforeTax: 16088,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [
      { eventId: 'interest:fd-5:2025-09-30', amount: 5000 },
      { eventId: 'interest:fd-6:2025-07-15', amount: 10000 },
    ],
    notes: 'Mixed-source reinvestment from SCSS and REC interest.',
  },
  {
    id: 'fd-9',
    srNo: 9,
    bankName: 'Canara Bank',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Me',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'CAN-FD-3201',
    tenure: '400 Days',
    interestRate: 7.1,
    principalAmount: 50000,
    investmentDate: '2024-01-15',
    maturityDate: '2025-02-18',
    maturityBeforeTax: 54200,
    maturityAfterTax: 53800,
    totalInterestEarned: 3800,
    tdsPercent: 10,
    tdsAmount: 400,
    status: 'Closed',
    allocations: [],
    notes: 'Closed deposit kept fully uninvested for upcoming expenses.',
  },
  {
    id: 'fd-10',
    srNo: 10,
    bankName: 'Kotak Mahindra Bank',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Mixed',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'KOTAK-FD-8804',
    tenure: '9 Months',
    interestRate: 7.15,
    principalAmount: 10000,
    investmentDate: '2026-01-10',
    maturityDate: '2026-10-10',
    maturityBeforeTax: 10538,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [
      { eventId: 'maturity:fd-2', amount: 3000 },
      { eventId: 'interest:fd-5:2025-12-31', amount: 4000 },
      { eventId: 'interest:fd-6:2025-07-15', amount: 3000 },
    ],
    notes: 'Mixed funding from one maturity pool plus two interest credits.',
  },
  {
    id: 'fd-11',
    srNo: 11,
    bankName: 'Post Office',
    branchCity: 'Jaipur',
    holderName: 'Father',
    fundingSource: 'Father',
    instrumentType: 'SCSS',
    payoutMode: 'quarterly-fy',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: 9225,
    interestPayoutAfterTds: 8303,
    accountNumber: 'SCSS-2024-1102',
    tenure: '5 Year',
    interestRate: 8.2,
    principalAmount: 450000,
    investmentDate: '2024-04-12',
    maturityDate: '2029-04-12',
    maturityBeforeTax: 450000,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [],
    notes: 'SCSS example where quarterly interest is being left idle for now.',
  },
  {
    id: 'fd-12',
    srNo: 12,
    bankName: 'Punjab National Bank',
    branchCity: 'Jaipur',
    holderName: 'Father',
    fundingSource: 'Father',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'PNB-FD-7720',
    tenure: '370 Days',
    interestRate: 7.05,
    principalAmount: 8000,
    investmentDate: '2024-10-03',
    maturityDate: '2025-10-08',
    maturityBeforeTax: 8567,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [{ eventId: 'interest:fd-11:2024-09-30', amount: 8000 }],
    notes: 'Quarterly SCSS interest reinvested into a new FD.',
  },
  {
    id: 'fd-13',
    srNo: 13,
    bankName: 'IRFC Bond',
    branchCity: 'Jaipur',
    holderName: 'Wife',
    fundingSource: 'Wife',
    instrumentType: 'Bond',
    payoutMode: 'yearly-fixed',
    yearlyPayoutMonthDay: '12-01',
    interestPayoutBeforeTds: 18500,
    interestPayoutAfterTds: 16650,
    accountNumber: 'IRFC-2023-6621',
    tenure: '5 Year',
    interestRate: 7.4,
    principalAmount: 250000,
    investmentDate: '2023-12-01',
    maturityDate: '2028-12-01',
    maturityBeforeTax: 250000,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [],
    notes: 'Annual bond payout example with no reinvestment yet.',
  },
  {
    id: 'fd-14',
    srNo: 14,
    bankName: 'AU Small Finance Bank',
    branchCity: 'Jaipur',
    holderName: 'Wife',
    fundingSource: 'Wife',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'AU-FD-4409',
    tenure: '15 Months',
    interestRate: 7.4,
    principalAmount: 12000,
    investmentDate: '2024-12-10',
    maturityDate: '2026-03-10',
    maturityBeforeTax: 13110,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [{ eventId: 'interest:fd-13:2024-12-01', amount: 12000 }],
    notes: 'Annual IRFC bond interest reinvested into a bank FD.',
  },
  {
    id: 'fd-15',
    srNo: 15,
    bankName: 'Bank of Baroda',
    branchCity: 'Jaipur',
    holderName: 'Kid',
    fundingSource: 'Mixed',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'BOB-FD-6615',
    tenure: '2 Year',
    interestRate: 7.0,
    principalAmount: 18000,
    investmentDate: '2026-01-05',
    maturityDate: '2028-01-05',
    maturityBeforeTax: 20604,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [
      { eventId: 'interest:fd-11:2024-12-31', amount: 9000 },
      { eventId: 'interest:fd-13:2025-12-01', amount: 9000 },
    ],
    notes: 'One new deposit funded by two different interest events.',
  },
  {
    id: 'fd-16',
    srNo: 16,
    bankName: 'Indian Bank',
    branchCity: 'Jaipur',
    holderName: 'Me',
    fundingSource: 'Me',
    instrumentType: 'Bank FD',
    payoutMode: 'on-maturity',
    yearlyPayoutMonthDay: '',
    interestPayoutBeforeTds: '',
    interestPayoutAfterTds: '',
    accountNumber: 'IND-FD-5100',
    tenure: '2 Year',
    interestRate: 7.15,
    principalAmount: 53800,
    investmentDate: '2025-02-20',
    maturityDate: '2027-02-20',
    maturityBeforeTax: 61887,
    maturityAfterTax: '',
    totalInterestEarned: '',
    tdsPercent: 10,
    tdsAmount: '',
    status: 'Open',
    allocations: [{ eventId: 'maturity:fd-9', amount: 53800 }],
    notes: 'Example where a fully matured deposit is fully rolled over into one new FD.',
  },
]

export const emptyForm = {
  srNo: '',
  bankName: '',
  branchCity: '',
  holderName: 'Me',
  fundingSource: 'Me',
  instrumentType: 'Bank FD',
  payoutMode: 'on-maturity',
  yearlyPayoutMonthDay: '',
  interestPayoutBeforeTds: '',
  interestPayoutAfterTds: '',
  accountNumber: '',
  tenure: '',
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

export const createRecordId = () => `fd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return ''
  }

  const number = Number(value)
  return Number.isNaN(number) ? '' : number
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

export const getHolderSearchTokens = (holderName) => {
  const normalized = normalizeText(holderName)
  const aliasMatches = Object.entries(HOLDER_ALIASES)
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

export const hydrateDeposit = (deposit) =>
  Object.assign(
    {
      instrumentType: 'Bank FD',
      payoutMode: 'on-maturity',
      yearlyPayoutMonthDay: '',
      interestPayoutBeforeTds: '',
      interestPayoutAfterTds: '',
      allocations: [],
      isDeleted: false,
    },
    deposit,
    {
      instrumentType: deposit.instrumentType || 'Bank FD',
      payoutMode: deposit.payoutMode || 'on-maturity',
      yearlyPayoutMonthDay: deposit.yearlyPayoutMonthDay || '',
      interestPayoutBeforeTds: deposit.interestPayoutBeforeTds ?? '',
      interestPayoutAfterTds: deposit.interestPayoutAfterTds ?? '',
      allocations: deposit.allocations || [],
      isDeleted: Boolean(deposit.isDeleted),
    },
  )

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
  const computedTdsAmount =
    maturityAfterTax !== '' && maturityBeforeTax !== ''
      ? Math.max(Number(maturityBeforeTax) - Number(maturityAfterTax), 0)
      : 0
  const computedInterest =
    maturityAfterTax !== '' && principalAmount !== ''
      ? Math.max(Number(maturityAfterTax) - Number(principalAmount), 0)
      : 0

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
    tenure: formValues.tenure.trim(),
    interestRate: parseNumber(formValues.interestRate),
    principalAmount,
    investmentDate: formValues.investmentDate,
    maturityDate,
    maturityBeforeTax,
    maturityAfterTax,
    totalInterestEarned: computedInterest,
    tdsPercent: parseNumber(formValues.tdsPercent),
    tdsAmount: computedTdsAmount,
    status: formValues.status,
    allocations: parseAllocationEntries(formValues.allocationsText),
    notes: formValues.notes.trim(),
  })
}

export const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
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
