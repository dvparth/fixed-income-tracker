export const createCoreServices = (dependencies) => {
  const {
    AUTH_RATE_LIMIT_MAX,
    BACKUP_RESTORE_RATE_LIMIT_MAX,
    CSRF_STRICT_ORIGIN,
    DEMO_RATE_LIMIT_MAX,
    Deposit,
    HEALTH_DETAIL_TOKEN,
    HIGH_RISK_ACTIONS,
    IMPORT_RATE_LIMIT_MAX,
    INVESTMENT_IMPORT_REQUIRED_COLUMNS,
    MasterData,
    PORT,
    PortfolioShare,
    RATE_LIMIT_WINDOW_MS,
    SESSION_COOKIE_NAME,
    SESSION_TTL_MS,
    WRITE_RATE_LIMIT_MAX,
    YieldflowAuditLog,
    YieldflowSession,
    YieldflowUser,
    adminEmails,
    allowedOrigins,
    cookieSecure,
    crypto,
    emptyMasterData,
    googleClientId,
    ipKeyGenerator,
    isProduction,
    mongoUri,
    mongoose,
    normalizeMasterData,
    normalizedCookieSameSite,
    rateLimit,
    sessionSecret,
  } = dependencies
  const {
    optionalTextField,
    numericFormField,
    booleanField,
    idParamSchema,
    ownerScopedQuerySchema,
    taxQuerySchema,
    importQuerySchema,
    googleAuthBodySchema,
    googleRedirectAuthBodySchema,
    shareCreateBodySchema,
    allocationSchema,
    salaryUnavailableSchema,
    salaryInvestmentAllocationSchema,
    salarySavingBodySchema,
    backupTimestampField,
    salarySavingBackupSchema,
    cashSettlementSchema,
    interestPayoutOverrideSchema,
    depositWriteBodySchema,
    investmentRenewalAllocationSchema,
    investmentRenewalBodySchema,
    namedMasterItemSchema,
    ownerMasterSchema,
    institutionMasterSchema,
    masterDataBodySchema,
    validateRequest,
    sanitizeDepositWritePayload,
    sanitizeRestoredDepositPayload,
  } = dependencies.schemas


  const getMaturitySourceEventId = (depositId) => `maturity:${depositId}`

  const normalizeDepositDoc = (deposit) => ({
    ...deposit,
    id: deposit.id || String(deposit._id),
    allocations: deposit.allocations || [],
    isDeleted: Boolean(deposit.isDeleted),
    ownerUserId: String(deposit.ownerUserId || ''),
    createdByUserId: deposit.createdByUserId ? String(deposit.createdByUserId) : '',
    updatedByUserId: deposit.updatedByUserId ? String(deposit.updatedByUserId) : '',
  })

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  const normalizeSystemRole = (user) => {
    const email = String(user?.email || '').trim().toLowerCase()
    const storedRole = String(user?.systemRole || '').trim()

    if (adminEmails.has(email) || storedRole === 'admin') {
      return 'admin'
    }

    if (storedRole === 'user') {
      return 'user'
    }

    return 'user'
  }

  const normalizeUserDoc = (user) => ({
    id: String(user._id),
    email: String(user.email || '').toLowerCase(),
    displayName: String(user.displayName || '').trim(),
    photoUrl: String(user.photoUrl || '').trim(),
    systemRole: normalizeSystemRole(user),
  })

  const buildPortfolioDisplayName = (user, fallbackId) => {
    const displayName = String(user?.displayName || '').trim()
    if (displayName) {
      return displayName
    }

    const email = String(user?.email || '').trim()
    if (email) {
      return email
    }

    const normalizedFallbackId = String(fallbackId || '').trim()
    return normalizedFallbackId ? `Portfolio ${normalizedFallbackId.slice(0, 6)}` : 'Portfolio'
  }

  const normalizeText = (value) => String(value || '').trim().toLowerCase()

  const createMasterKey = (value) =>
    normalizeText(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'

  const buildMasterNameLookupById = (items = []) =>
    new Map(
      items
        .map((item) => [String(item?.id || '').trim(), String(item?.name || '').trim()])
        .filter(([id, name]) => id && name),
    )

  const canonicalizeDepositAgainstMasterData = (deposit, masterData = emptyMasterData) => {
    const ownerLookup = buildMasterNameLookupById(masterData.owners || [])
    const institutionLookup = buildMasterNameLookupById(masterData.institutions || [])
    const instrumentTypeLookup = buildMasterNameLookupById(masterData.instrumentTypes || [])
    const institutionBranchLookup = new Map(
      (masterData.institutions || []).map((institution) => [
        String(institution?.id || '').trim(),
        buildMasterNameLookupById(institution.branches || []),
      ]),
    )

    const holderName = ownerLookup.get(createMasterKey(deposit.holderName)) || deposit.holderName
    const fundingSource =
      ownerLookup.get(createMasterKey(deposit.fundingSource)) || deposit.fundingSource
    const institutionId = createMasterKey(deposit.bankName)
    const bankName = institutionLookup.get(institutionId) || deposit.bankName
    const branchName =
      institutionBranchLookup.get(institutionId)?.get(createMasterKey(deposit.branchCity)) ||
      deposit.branchCity
    const instrumentType =
      instrumentTypeLookup.get(createMasterKey(deposit.instrumentType)) || deposit.instrumentType

    return {
      ...deposit,
      holderName,
      fundingSource,
      bankName,
      branchCity: branchName,
      instrumentType,
    }
  }

  const createMasterId = (value) =>
    normalizeText(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'

  const parseNumber = (value) => {
    if (value === '' || value === null || value === undefined) {
      return ''
    }

    const normalizedValue =
      typeof value === 'string' ? value.replace(/,/g, '').trim() : value
    const number = Number(normalizedValue)
    return Number.isFinite(number) ? number : ''
  }

  const toYmd = (date) => {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getDateDayCount = (startValue, endValue) => {
    const start = new Date(`${String(startValue || '').trim()}T00:00:00`)
    const end = new Date(`${String(endValue || '').trim()}T00:00:00`)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0
    }

    return Math.max(Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 0)
  }

  const getEffectiveMaturityDate = (deposit = {}) =>
    deposit.status === 'Closed' && deposit.closureDate ? deposit.closureDate : deposit.maturityDate

  const normalizeImportDate = (value) => {
    if (!value && value !== 0) {
      return ''
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return toYmd(value)
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const serialDay = Math.floor(value)
      const candidate = new Date(1899, 11, (serialDay < 60 ? 31 : 30) + serialDay)
      if (serialDay === 60) {
        candidate.setDate(candidate.getDate() + 1)
      }
      return Number.isNaN(candidate.getTime()) ? '' : toYmd(candidate)
    }

    const rawValue = String(value || '').trim()
    if (!rawValue) {
      return ''
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return rawValue
    }

    const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (slashMatch) {
      const [, day, month, year] = slashMatch
      const candidate = new Date(Number(year), Number(month) - 1, Number(day))
      return Number.isNaN(candidate.getTime()) ? '' : toYmd(candidate)
    }

    const candidate = new Date(rawValue)
    return Number.isNaN(candidate.getTime()) ? '' : toYmd(candidate)
  }

  const shiftDateByCalendar = (date, years = 0, months = 0) => {
    const source = new Date(date)
    const sourceDay = source.getDate()
    const targetMonthIndex = source.getMonth() + months
    const targetYear = source.getFullYear() + years + Math.floor(targetMonthIndex / 12)
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
    const maxDay = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate()
    const cappedDay = Math.min(sourceDay, maxDay)

    return new Date(targetYear, normalizedMonthIndex, cappedDay)
  }

  const deriveTenureParts = (investmentDate, maturityDate) => {
    if (!investmentDate || !maturityDate) {
      return { years: 0, months: 0, days: 0 }
    }

    const start = new Date(`${investmentDate}T00:00:00`)
    const end = new Date(`${maturityDate}T00:00:00`)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
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

  const computeTdsAmount = (maturityBeforeTax, maturityAfterTax) => {
    const grossAmount = parseNumber(maturityBeforeTax)
    const netAmount = parseNumber(maturityAfterTax)

    if (grossAmount === '' || netAmount === '') {
      return 0
    }

    return Math.max(Number(grossAmount) - Number(netAmount), 0)
  }

  const computeTdsPercent = (principalAmount, maturityBeforeTax, maturityAfterTax) => {
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

  const parsePayoutMode = (value) => {
    const normalizedValue = normalizeText(value)

    if (!normalizedValue) {
      return 'on-maturity'
    }

    if (['on-maturity', 'on maturity', 'on maturity only'].includes(normalizedValue)) {
      return 'on-maturity'
    }

    if (['quarterly-fy', 'quarterly', 'quarterly fy'].includes(normalizedValue)) {
      return 'quarterly-fy'
    }

    if (['yearly-fixed', 'yearly fixed', 'yearly on fixed date'].includes(normalizedValue)) {
      return 'yearly-fixed'
    }

    return null
  }

  const parseStatusValue = (value) => {
    const normalizedValue = normalizeText(value)

    if (normalizedValue === 'open') {
      return 'Open'
    }

    if (normalizedValue === 'closed') {
      return 'Closed'
    }

    return null
  }

  const getEffectivePayoutMode = ({ payoutMode }) => payoutMode || 'on-maturity'

  const normalizeImportRowText = (row, column) => String(row?.[column] || '').trim()

  const buildInvestmentIdentityKey = ({
    holderName,
    bankName,
    accountNumber,
    investmentDate,
  }) =>
    [
      normalizeText(holderName),
      normalizeText(bankName),
      normalizeText(accountNumber),
      String(investmentDate || '').trim(),
    ].join('|')

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

  const parseCookies = (request) =>
    String(request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce((cookies, part) => {
        const separatorIndex = part.indexOf('=')
        if (separatorIndex <= 0) {
          return cookies
        }

        const key = part.slice(0, separatorIndex).trim()
        const value = decodeURIComponent(part.slice(separatorIndex + 1).trim())
        cookies[key] = value
        return cookies
      }, {})

  const buildSessionTokenHash = (token) =>
    crypto.createHmac('sha256', sessionSecret).update(String(token || '')).digest('hex')

  const createSessionToken = () => crypto.randomBytes(32).toString('base64url')

  const setSessionCookie = (response, token) => {
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${normalizedCookieSameSite}; Max-Age=${Math.floor(
        SESSION_TTL_MS / 1000,
      )}${cookieSecure ? '; Secure' : ''}`,
    )
  }

  const clearSessionCookie = (response) => {
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${normalizedCookieSameSite}; Max-Age=0${
        cookieSecure ? '; Secure' : ''
      }`,
    )
  }

  const getFundingAllocations = (deposit) => {
    return (deposit.allocations || []).filter(
      (allocation) => allocation?.eventId && Number.isFinite(Number(allocation.amount)),
    )
  }

  const getArchiveDependents = (targetDeposit, deposits) => {
    const maturityEventId = getMaturitySourceEventId(targetDeposit.id)
    const interestPrefix = `interest:${targetDeposit.id}:`

    return deposits
      .filter((deposit) => deposit.id !== targetDeposit.id && !deposit.isDeleted)
      .map((deposit) => {
        const matchingAllocations = getFundingAllocations(deposit).filter((allocation) => {
          const eventId = String(allocation.eventId || '')
          return eventId === maturityEventId || eventId.startsWith(interestPrefix)
        })

        if (matchingAllocations.length === 0) {
          return null
        }

        return {
          id: deposit.id,
          bankName: deposit.bankName,
          accountNumber: deposit.accountNumber,
          allocations: matchingAllocations,
        }
      })
      .filter(Boolean)
  }

  const buildUpdateQuery = (id, ownerUserId) => ({ id, ownerUserId })

  const getMongoConnectionState = (readyState) => {
    switch (readyState) {
      case 0:
        return 'disconnected'
      case 1:
        return 'connected'
      case 2:
        return 'connecting'
      case 3:
        return 'disconnecting'
      default:
        return 'unknown'
    }
  }

  const buildHealthPayload = () => {
    const mongoState = getMongoConnectionState(mongoose.connection.readyState)
    const isMongoHealthy = mongoState === 'connected'

    return {
      ok: isMongoHealthy,
      status: isMongoHealthy ? 'healthy' : 'degraded',
      service: 'YieldFlow API',
      timestamp: new Date().toISOString(),
    }
  }

  const buildDetailedHealthPayload = () => {
    const mongoState = getMongoConnectionState(mongoose.connection.readyState)
    const isMongoHealthy = mongoState === 'connected'
    const databaseName = String(mongoose.connection.name || '').trim()
    const uptimeSeconds = Math.floor(process.uptime())

    return {
      ...buildHealthPayload(),
      uptimeSeconds,
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      database: {
        connected: isMongoHealthy,
        state: mongoState,
        name: databaseName || 'unavailable',
        host: mongoose.connection.host || 'unavailable',
      },
      auth: {
        googleClientConfigured: Boolean(googleClientId),
        sessionSecretConfigured: Boolean(sessionSecret),
        adminEmailCount: adminEmails.size,
        cookieSameSite: normalizedCookieSameSite,
        cookieSecure,
        allowedOriginCount: allowedOrigins.length,
      },
      collections: {
        investments: 'investments',
        masterData: 'masterData',
        users: 'users',
        sessions: 'sessions',
        portfolioShares: 'portfolioShares',
        auditLogs: 'auditLogs',
      },
    }
  }

  const validateAndNormalizeImportRows = ({ rows, existingDeposits }) => {
    const missingHeaders = INVESTMENT_IMPORT_REQUIRED_COLUMNS.filter(
      (column) => !rows.every((row) => Object.prototype.hasOwnProperty.call(row, column)),
    )

    if (rows.length === 0) {
      return {
        rows: [],
        errors: ['Workbook does not contain any investment rows.'],
        missingHeaders,
        validRows: [],
      }
    }

    const existingKeys = new Set(existingDeposits.map(buildInvestmentIdentityKey))
    const seenKeys = new Map()
    const results = rows.map((row, index) => {
      const rowNumber = index + 2
      const errors = []

      const holderName = normalizeImportRowText(row, 'Holder')
      const bankName = normalizeImportRowText(row, 'Bank or Issuer')
      const accountNumber = normalizeImportRowText(row, 'Account or Certificate No')
      const instrumentType = normalizeImportRowText(row, 'Instrument Type')
      const principalAmount = parseNumber(row['Principal Amount'])
      const investmentDate = normalizeImportDate(row['Investment Date'])
      const maturityDate = normalizeImportDate(row['Maturity Date'])
      const status = parseStatusValue(row.Status)
      const fundingSource = normalizeImportRowText(row, 'Funding Source') || holderName
      const branchCity = normalizeImportRowText(row, 'Branch City')
      const payoutMode = parsePayoutMode(row['Payout Mode'])
      const yearlyPayoutMonthDay = normalizeImportRowText(row, 'Interest Payment Date')
      const interestPayoutBeforeTds = parseNumber(row['Interest Paid Before TDS'])
      const interestPayoutAfterTds = parseNumber(row['Amount Received Each Payout'])
      const interestRate = parseNumber(row['Interest Rate %'])
      const maturityBeforeTax = parseNumber(row['Amount at Maturity Before TDS'])
      const maturityAfterTax = parseNumber(row['Amount Received at Maturity'])
      const notes = normalizeImportRowText(row, 'Notes')

      if (!holderName) {
        errors.push('Holder is required.')
      }
      if (!bankName) {
        errors.push('Bank or Issuer is required.')
      }
      if (!accountNumber) {
        errors.push('Account or Certificate No is required.')
      }
      if (!instrumentType) {
        errors.push('Instrument Type is required.')
      }
      if (principalAmount === '' || Number(principalAmount) <= 0) {
        errors.push('Principal Amount must be a positive number.')
      }
      if (!investmentDate) {
        errors.push('Investment Date is required and must be a valid date.')
      }
      if (!maturityDate) {
        errors.push('Maturity Date is required and must be a valid date.')
      }
      if (!status) {
        errors.push('Status must be Open or Closed.')
      }
      if (!payoutMode) {
        errors.push('Payout Mode must be on-maturity, quarterly-fy, or yearly-fixed when provided.')
      }

      const effectivePayoutMode = getEffectivePayoutMode({
        instrumentType,
        payoutMode,
      })

      if (
        investmentDate &&
        maturityDate &&
        new Date(`${maturityDate}T00:00:00`) < new Date(`${investmentDate}T00:00:00`)
      ) {
        errors.push('Maturity Date must be on or after Investment Date.')
      }

      if (status === 'Closed' && maturityAfterTax === '') {
        errors.push('Amount Received at Maturity is required when Status is Closed.')
      }

      if (effectivePayoutMode !== 'on-maturity' && interestPayoutAfterTds === '') {
        errors.push('Amount Received Each Payout is required for periodic payout products.')
      }

      if (effectivePayoutMode === 'yearly-fixed' && !/^\d{2}-\d{2}$/.test(yearlyPayoutMonthDay)) {
        errors.push('Interest Payment Date is required for yearly-fixed payout mode and must use MM-DD.')
      }

      const identityKey = buildInvestmentIdentityKey({
        holderName,
        bankName,
        accountNumber,
        investmentDate,
      })

      if (seenKeys.has(identityKey)) {
        errors.push(`This row duplicates row ${seenKeys.get(identityKey)} in the file.`)
      } else if (holderName && bankName && accountNumber && investmentDate) {
        seenKeys.set(identityKey, rowNumber)
      }

      if (existingKeys.has(identityKey)) {
        errors.push('This investment already exists in the selected portfolio.')
      }

      const tenure = deriveTenureParts(investmentDate, maturityDate)
      const tdsAmount = computeTdsAmount(maturityBeforeTax, maturityAfterTax)
      const tdsPercent = computeTdsPercent(principalAmount, maturityBeforeTax, maturityAfterTax)
      const totalInterestEarned =
        maturityAfterTax !== '' && principalAmount !== ''
          ? Math.max(Number(maturityAfterTax) - Number(principalAmount), 0)
          : 0

      return {
        rowNumber,
        source: row,
        errors,
        normalized: {
          holderName,
          bankName,
          accountNumber,
          instrumentType,
          principalAmount,
          investmentDate,
          maturityDate,
          status: status || '',
          fundingSource,
          branchCity,
          payoutMode: payoutMode || '',
          effectivePayoutMode,
          yearlyPayoutMonthDay,
          interestPayoutBeforeTds,
          interestPayoutAfterTds,
          interestRate,
          maturityBeforeTax,
          maturityAfterTax,
          notes,
          tenureYears: tenure.years,
          tenureMonths: tenure.months,
          tenureDays: tenure.days,
          totalInterestEarned,
          tdsAmount,
          tdsPercent,
        },
      }
    })

    return {
      rows: results,
      errors: missingHeaders.map((column) => `Workbook header is missing required column "${column}".`),
      missingHeaders,
      validRows: results.filter((row) => row.errors.length === 0).map((row) => row.normalized),
    }
  }

  const connectDatabase = async () => {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB successfully')
  }

  const verifyGoogleCredential = async (credential) => {
    const idToken = String(credential || '').trim()
    if (!idToken) {
      throw new Error('Google credential is required')
    }

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    )
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload) {
      throw new Error(payload?.error_description || 'Google authentication failed')
    }

    if (payload.aud !== googleClientId) {
      throw new Error('Google client id mismatch')
    }

    if (!payload.email || payload.email_verified !== 'true') {
      throw new Error('Verified Google email is required')
    }

    return {
      googleSub: String(payload.sub || '').trim(),
      email: String(payload.email || '').trim().toLowerCase(),
      displayName: String(payload.name || payload.email || '').trim(),
      photoUrl: String(payload.picture || '').trim(),
    }
  }

  const createSession = async (userId) => {
    const token = createSessionToken()
    const tokenHash = buildSessionTokenHash(token)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

    await YieldflowSession.create({
      tokenHash,
      userId,
      expiresAt,
      lastSeenAt: new Date(),
    })

    return { token, expiresAt }
  }

  const authenticateGoogleCredential = async (credential) => {
    const googleProfile = await verifyGoogleCredential(credential)
    const systemRole = adminEmails.has(googleProfile.email) ? 'admin' : 'user'
    const upsertedUser = await YieldflowUser.findOneAndUpdate(
      { googleSub: googleProfile.googleSub },
      {
        $set: {
          email: googleProfile.email,
          displayName: googleProfile.displayName,
          photoUrl: googleProfile.photoUrl,
          systemRole,
          lastLoginAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )

    return normalizeUserDoc(upsertedUser.toObject())
  }

  const getSafeAuthRedirectUrl = (request) => {
    const fallbackOrigin = allowedOrigins[0] || getServerOrigin(request)
    const fallbackUrl = `${fallbackOrigin}/`
    const requestOrigin = getRequestOrigin(request)

    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return `${requestOrigin}/`
    }

    const requestedUrl = String(request.query.returnTo || '').trim()

    if (!requestedUrl) {
      return fallbackUrl
    }

    try {
      const parsedUrl = new URL(requestedUrl)
      if (allowedOrigins.includes(parsedUrl.origin) || parsedUrl.origin === getServerOrigin(request)) {
        return parsedUrl.toString()
      }
    } catch {
      return fallbackUrl
    }

    return fallbackUrl
  }

  const getAccessiblePortfolioEntries = async (sessionUser) => {
    const userId = String(sessionUser.id)

    if (sessionUser.systemRole === 'admin') {
      const allUsers = await YieldflowUser.find({}).lean()
      const depositOwnerIds = await Deposit.distinct('ownerUserId', {
        ownerUserId: { $nin: ['', null] },
      })
      const masterOwnerIds = await MasterData.distinct('ownerUserId', {
        ownerUserId: { $nin: ['', null] },
      })
      const ownerIds = Array.from(
        new Set(
          [...allUsers.map((user) => String(user._id)), ...depositOwnerIds, ...masterOwnerIds]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      )
      const ownerLookup = new Map(allUsers.map((user) => [String(user._id), normalizeUserDoc(user)]))

      return ownerIds.map((ownerUserId) => {
        const ownerUser = ownerLookup.get(ownerUserId)
        return {
          ownerUserId,
          ownerDisplayName: buildPortfolioDisplayName(ownerUser, ownerUserId),
          ownerEmail: ownerUser?.email || '',
          accessType: 'admin',
        }
      })
    }

    const ownedEntry = {
      ownerUserId: userId,
      ownerDisplayName: sessionUser.displayName,
      ownerEmail: sessionUser.email,
      accessType: 'owner',
    }

    const sharedRecords = await PortfolioShare.find({
      guestUserId: userId,
      status: 'active',
      permission: 'read',
    }).lean()

    if (sharedRecords.length === 0) {
      return [ownedEntry]
    }

    const ownerIds = Array.from(new Set(sharedRecords.map((share) => String(share.ownerUserId))))
    const ownerUsers = await YieldflowUser.find({ _id: { $in: ownerIds } }).lean()
    const ownerLookup = new Map(ownerUsers.map((user) => [String(user._id), normalizeUserDoc(user)]))

    const guestEntries = sharedRecords.map((share) => {
      const ownerUser = ownerLookup.get(String(share.ownerUserId))
      return {
        ownerUserId: String(share.ownerUserId),
        ownerDisplayName: ownerUser?.displayName || share.guestEmail || 'Shared portfolio',
        ownerEmail: ownerUser?.email || '',
        accessType: 'guest',
      }
    })

    return [ownedEntry, ...guestEntries]
  }

  const buildSessionResponse = async (sessionUser) => {
    const accessiblePortfolios = await getAccessiblePortfolioEntries(sessionUser)

    return {
      authenticated: true,
      user: sessionUser,
      accessiblePortfolios,
      activePortfolioOwnerId: accessiblePortfolios[0]?.ownerUserId || sessionUser.id,
    }
  }

  const findSessionUser = async (request) => {
    const cookies = parseCookies(request)
    const sessionToken = cookies[SESSION_COOKIE_NAME]
    if (!sessionToken) {
      return null
    }

    const tokenHash = buildSessionTokenHash(sessionToken)
    const sessionRecord = await YieldflowSession.findOne({ tokenHash }).lean()
    if (!sessionRecord) {
      return null
    }

    if (new Date(sessionRecord.expiresAt).getTime() <= Date.now()) {
      await YieldflowSession.deleteOne({ _id: sessionRecord._id })
      return null
    }

    const user = await YieldflowUser.findById(sessionRecord.userId).lean()
    if (!user) {
      await YieldflowSession.deleteOne({ _id: sessionRecord._id })
      return null
    }

    await YieldflowSession.updateOne(
      { _id: sessionRecord._id },
      { $set: { lastSeenAt: new Date() } },
    )

    const normalizedUser = normalizeUserDoc(user)
    return {
      ...normalizedUser,
      sessionId: String(sessionRecord._id),
    }
  }

  const requireAuth = (request, response, next) => {
    if (!request.sessionUser) {
      response.status(401).json({ message: 'Sign in required' })
      return
    }

    next()
  }

  const loadSessionUser = async (request, _response, next) => {
    try {
      request.sessionUser = await findSessionUser(request)
      next()
    } catch (error) {
      next(error)
    }
  }

  const resolvePortfolioContext = async (request, response, next) => {
    const sessionUser = request.sessionUser
    if (!sessionUser) {
      response.status(401).json({ message: 'Sign in required' })
      return
    }

    const accessiblePortfolios = await getAccessiblePortfolioEntries(sessionUser)
    const requestedOwnerUserId = String(request.query.ownerUserId || sessionUser.id)
    const selectedPortfolio =
      accessiblePortfolios.find((portfolio) => portfolio.ownerUserId === requestedOwnerUserId) || null

    if (!selectedPortfolio) {
      response.status(403).json({ message: 'You do not have access to this portfolio' })
      return
    }

    request.portfolioContext = {
      ownerUserId: selectedPortfolio.ownerUserId,
      accessType: selectedPortfolio.accessType,
      isOwner: selectedPortfolio.accessType === 'owner',
      isAdminAccess: selectedPortfolio.accessType === 'admin',
    }
    request.accessiblePortfolios = accessiblePortfolios
    next()
  }

  const requirePortfolioWriteAccess = (request, response, next) => {
    if (!request.portfolioContext?.isOwner && request.sessionUser?.systemRole !== 'admin') {
      response.status(403).json({ message: 'Write access is required' })
      return
    }

    next()
  }

  const requireAdmin = (request, response, next) => {
    if (request.sessionUser?.systemRole !== 'admin') {
      response.status(403).json({ message: 'Admin access is required' })
      return
    }

    next()
  }

  const requireUserRole = (request, response, next) => {
    if (request.sessionUser?.systemRole !== 'user') {
      response.status(403).json({ message: 'This action is available only for portfolio users' })
      return
    }

    next()
  }

  const getMasterData = async (ownerUserId, { createIfMissing = false, session } = {}) => {
    const existing = await MasterData.findOne({ ownerUserId }).session(session || null).lean()
    if (existing) {
      return normalizeMasterData(existing)
    }

    if (!createIfMissing) {
      return normalizeMasterData(emptyMasterData)
    }

    const [created] = await MasterData.create(
      [
        {
          ownerUserId,
          ...emptyMasterData,
        },
      ],
      { session },
    )
    return normalizeMasterData(created.toObject())
  }

  const summarizeAuditValue = (value) => {
    if (value === null || value === undefined) {
      return null
    }

    if (Array.isArray(value)) {
      return {
        type: 'array',
        count: value.length,
      }
    }

    if (typeof value === 'object') {
      return {
        type: 'object',
        fields: Object.keys(value).sort(),
      }
    }

    return value
  }

  const countItems = (value) => (Array.isArray(value) ? value.length : 0)

  const sanitizeAuditMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return metadata || null
    }

    return Object.entries(metadata).reduce((safeMetadata, [key, value]) => {
      if (['before', 'after', 'masterData', 'deposits'].includes(key)) {
        safeMetadata[key] = summarizeAuditValue(value)
        return safeMetadata
      }

      if (key === 'createdValues' && value && typeof value === 'object') {
        safeMetadata.createdValueCounts = {
          owners: countItems(value.owners),
          institutions: countItems(value.institutions),
          branches: countItems(value.branches),
          instrumentTypes: countItems(value.instrumentTypes),
        }
        return safeMetadata
      }

      if (key === 'cleanedFundingLinks' && Array.isArray(value)) {
        safeMetadata.cleanedFundingLinkCount = value.length
        return safeMetadata
      }

      safeMetadata[key] = value
      return safeMetadata
    }, {})
  }

  const writeAdminAuditLog = async ({
    actor,
    action,
    targetType,
    targetRecordId = '',
    targetOwnerUserId = '',
    before = null,
    after = null,
    metadata = null,
    session = null,
  }) => {
    const isHighRisk = HIGH_RISK_ACTIONS.has(action)
    if (actor?.systemRole !== 'admin' && !isHighRisk) {
      return
    }

    await YieldflowAuditLog.create(
      [
        {
          actorUserId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.systemRole,
          action,
          targetType,
          targetRecordId,
          targetOwnerUserId,
          before: summarizeAuditValue(before),
          after: summarizeAuditValue(after),
          metadata: sanitizeAuditMetadata({
            ...(metadata || {}),
            highRisk: isHighRisk,
          }),
        },
      ],
      session ? { session } : undefined,
    )
  }

  const getFundingEventMatcherForDeposit = (depositId) => {
    const normalizedDepositId = String(depositId || '').trim()
    const maturityEventId = getMaturitySourceEventId(normalizedDepositId)
    const interestPrefix = `interest:${normalizedDepositId}:`

    return (eventId) => {
      const normalizedEventId = String(eventId || '').trim()
      return Boolean(normalizedEventId) && (
        normalizedEventId === maturityEventId || normalizedEventId.startsWith(interestPrefix)
      )
    }
  }

  const removeFundingLinksForDeletedDeposit = async ({
    deletedDeposit,
    ownerUserId,
    actor,
  }) => {
    const isDeletedFundingEvent = getFundingEventMatcherForDeposit(deletedDeposit.id)

    const siblingDeposits = await Deposit.find({
      ownerUserId,
      id: { $ne: deletedDeposit.id },
    }).lean()

    const updatedChildren = []

    for (const sibling of siblingDeposits) {
      const normalizedSibling = normalizeDepositDoc(sibling)
      const currentAllocations = Array.isArray(normalizedSibling.allocations)
        ? normalizedSibling.allocations
        : []
      const nextAllocations = currentAllocations.filter(
        (allocation) => !isDeletedFundingEvent(allocation?.eventId),
      )

      if (nextAllocations.length === currentAllocations.length) {
        continue
      }

        const updated = await Deposit.findOneAndUpdate(
        buildUpdateQuery(normalizedSibling.id, ownerUserId),
        {
          $set: {
            allocations: nextAllocations,
            updatedByUserId: actor.id,
          },
        },
        { new: true, upsert: false },
      ).lean()

      if (!updated) {
        continue
      }

      const normalizedUpdated = normalizeDepositDoc(updated)
      updatedChildren.push({
        id: normalizedUpdated.id,
        accountNumber: normalizedUpdated.accountNumber,
        bankName: normalizedUpdated.bankName,
        removedAllocationCount: currentAllocations.length - nextAllocations.length,
      })

      await writeAdminAuditLog({
        actor,
        action: 'admin.investment.cleanupFundingLinks',
        targetType: 'investment',
        targetRecordId: normalizedUpdated.id,
        targetOwnerUserId: ownerUserId,
        before: normalizedSibling,
        after: normalizedUpdated,
        metadata: {
          reason: 'Deleted funding source investment',
          sourceDepositId: String(deletedDeposit.id || ''),
        },
      })
    }

    return updatedChildren
  }

  const getRequestOrigin = (request) => {
    const origin = String(request.headers.origin || '').trim()
    if (origin) {
      return origin
    }

    const referer = String(request.headers.referer || request.headers.referrer || '').trim()
    if (!referer) {
      return ''
    }

    try {
      return new URL(referer).origin
    } catch {
      return ''
    }
  }

  const getServerOrigin = (request) => `${request.protocol}://${request.get('host')}`

  const isAllowedRequestOrigin = (request, requestOrigin) => {
    if (!requestOrigin) {
      return !isProduction || !CSRF_STRICT_ORIGIN
    }

    if (requestOrigin === getServerOrigin(request)) {
      return true
    }

    return allowedOrigins.includes(requestOrigin)
  }

  const rejectRequest = (response, status, message, requestId, extra = {}) => {
    response.status(status).json({
      message,
      requestId,
      ...extra,
    })
  }

  const requestIdMiddleware = (request, response, next) => {
    request.requestId = String(request.headers['x-request-id'] || '').trim() || crypto.randomUUID()
    response.setHeader('X-Request-Id', request.requestId)
    next()
  }

  const csrfOriginProtection = (request, response, next) => {
    if (!CSRF_STRICT_ORIGIN || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      next()
      return
    }

    if (request.path === '/api/auth/google/redirect') {
      next()
      return
    }

    const requestOrigin = getRequestOrigin(request)
    if (!isAllowedRequestOrigin(request, requestOrigin)) {
      console.warn('Blocked state-changing request with invalid origin', {
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        origin: requestOrigin || 'missing',
        ip: request.ip,
        userId: request.sessionUser?.id || '',
      })
      rejectRequest(response, 403, 'Request origin is not allowed', request.requestId)
      return
    }

    next()
  }

  const createSecurityRateLimiter = ({ name, max }) =>
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (request) =>
        request.sessionUser?.id
          ? `user:${request.sessionUser.id}`
          : `ip:${ipKeyGenerator(request.ip)}`,
      handler: (request, response) => {
        console.warn('Rate limit exceeded', {
          limiter: name,
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl,
          ip: request.ip,
          userId: request.sessionUser?.id || '',
        })
        rejectRequest(response, 429, 'Too many requests. Try again later.', request.requestId)
      },
    })

  const authRateLimiter = createSecurityRateLimiter({
    name: 'auth',
    max: AUTH_RATE_LIMIT_MAX,
  })

  const writeRateLimiter = createSecurityRateLimiter({
    name: 'write',
    max: WRITE_RATE_LIMIT_MAX,
  })

  const importRateLimiter = createSecurityRateLimiter({
    name: 'import',
    max: IMPORT_RATE_LIMIT_MAX,
  })

  const backupRestoreRateLimiter = createSecurityRateLimiter({
    name: 'backup-restore',
    max: BACKUP_RESTORE_RATE_LIMIT_MAX,
  })

  const demoRateLimiter = createSecurityRateLimiter({
    name: 'demo',
    max: DEMO_RATE_LIMIT_MAX,
  })

  const validateHealthDetailAccess = (request, response, next) => {
    const suppliedToken = String(request.headers['x-health-token'] || request.query.token || '').trim()
    if (
      (HEALTH_DETAIL_TOKEN && suppliedToken === HEALTH_DETAIL_TOKEN) ||
      request.sessionUser?.systemRole === 'admin'
    ) {
      next()
      return
    }

    rejectRequest(response, 404, 'Not found', request.requestId)
  }

  return {
    getMaturitySourceEventId,
    normalizeDepositDoc,
    optionalTextField,
    numericFormField,
    booleanField,
    idParamSchema,
    ownerScopedQuerySchema,
    taxQuerySchema,
    importQuerySchema,
    googleAuthBodySchema,
    googleRedirectAuthBodySchema,
    shareCreateBodySchema,
    allocationSchema,
    salaryUnavailableSchema,
    salaryInvestmentAllocationSchema,
    salarySavingBodySchema,
    backupTimestampField,
    salarySavingBackupSchema,
    cashSettlementSchema,
    interestPayoutOverrideSchema,
    depositWriteBodySchema,
    investmentRenewalAllocationSchema,
    investmentRenewalBodySchema,
    namedMasterItemSchema,
    ownerMasterSchema,
    institutionMasterSchema,
    masterDataBodySchema,
    validateRequest,
    sanitizeDepositWritePayload,
    sanitizeRestoredDepositPayload,
    normalizeSystemRole,
    normalizeUserDoc,
    buildPortfolioDisplayName,
    normalizeText,
    createMasterKey,
    buildMasterNameLookupById,
    canonicalizeDepositAgainstMasterData,
    createMasterId,
    parseNumber,
    toYmd,
    getDateDayCount,
    getEffectiveMaturityDate,
    normalizeImportDate,
    shiftDateByCalendar,
    deriveTenureParts,
    computeTdsAmount,
    computeTdsPercent,
    parsePayoutMode,
    parseStatusValue,
    getEffectivePayoutMode,
    normalizeImportRowText,
    buildInvestmentIdentityKey,
    buildTaxEstimationInvestmentInput,
    parseCookies,
    buildSessionTokenHash,
    createSessionToken,
    setSessionCookie,
    clearSessionCookie,
    getFundingAllocations,
    getArchiveDependents,
    buildUpdateQuery,
    getMongoConnectionState,
    buildHealthPayload,
    buildDetailedHealthPayload,
    validateAndNormalizeImportRows,
    connectDatabase,
    verifyGoogleCredential,
    createSession,
    authenticateGoogleCredential,
    getSafeAuthRedirectUrl,
    getAccessiblePortfolioEntries,
    buildSessionResponse,
    findSessionUser,
    requireAuth,
    loadSessionUser,
    resolvePortfolioContext,
    requirePortfolioWriteAccess,
    requireAdmin,
    requireUserRole,
    getMasterData,
    summarizeAuditValue,
    countItems,
    sanitizeAuditMetadata,
    writeAdminAuditLog,
    getFundingEventMatcherForDeposit,
    removeFundingLinksForDeletedDeposit,
    getRequestOrigin,
    getServerOrigin,
    isAllowedRequestOrigin,
    rejectRequest,
    requestIdMiddleware,
    csrfOriginProtection,
    createSecurityRateLimiter,
    authRateLimiter,
    writeRateLimiter,
    importRateLimiter,
    backupRestoreRateLimiter,
    demoRateLimiter,
    validateHealthDetailAccess,
  }
}
