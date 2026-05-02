const CALCULATION_FREQUENCIES = ['QUARTERLY', 'YEARLY', 'MONTHLY', 'SIMPLE']
const PAYOUT_FREQUENCIES = ['CUMULATIVE', 'QUARTERLY', 'MONTHLY', 'YEARLY']
const CALCULATION_PERIOD_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
}
const PAYOUT_PERIOD_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
}

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const roundAmount = (value) => Math.round(Number(value) || 0)

const parsePercentToDecimal = (value) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0
  }

  return numericValue > 1 ? numericValue / 100 : numericValue
}

const parseDate = (value) => {
  if (!value) {
    return null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const candidate = new Date(`${String(value).trim()}T00:00:00`)
  if (Number.isNaN(candidate.getTime())) {
    return null
  }

  return new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
}

const toYmd = (date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const isSameOrAfter = (left, right) => left.getTime() >= right.getTime()
const isSameOrBefore = (left, right) => left.getTime() <= right.getTime()

const addMonths = (date, months) => {
  const source = new Date(date)
  const sourceDay = source.getDate()
  const targetMonthIndex = source.getMonth() + months
  const targetYear = source.getFullYear() + Math.floor(targetMonthIndex / 12)
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
  const maxDay = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate()

  return new Date(targetYear, normalizedMonthIndex, Math.min(sourceDay, maxDay))
}

const clipTimelineToFinancialYear = (valueDate, maturityDate, financialYear) => {
  if (!financialYear?.start || !financialYear?.end || !valueDate || !maturityDate) {
    return {
      effectiveStart: null,
      effectiveEnd: null,
      hasOverlap: false,
    }
  }

  const effectiveStart = isSameOrAfter(valueDate, financialYear.start)
    ? valueDate
    : financialYear.start
  const effectiveEnd = isSameOrBefore(maturityDate, financialYear.end)
    ? maturityDate
    : financialYear.end

  return {
    effectiveStart,
    effectiveEnd,
    hasOverlap: isSameOrBefore(effectiveStart, effectiveEnd),
  }
}

const buildOwnerProfileLookup = (ownerProfiles = []) =>
  ownerProfiles.reduce((lookup, ownerProfile) => {
    const profile = {
      ownerId: String(ownerProfile.id || ownerProfile.ownerId || ownerProfile.name || '').trim(),
      ownerName: String(ownerProfile.name || ownerProfile.ownerName || '').trim(),
      ownerType: String(ownerProfile.ownerType || 'Individual').trim() || 'Individual',
      ownerTaxSlab: Number.isFinite(Number(ownerProfile.taxSlabRate))
        ? Number(ownerProfile.taxSlabRate)
        : Number.isFinite(Number(ownerProfile.ownerTaxSlab))
          ? Number(ownerProfile.ownerTaxSlab)
          : 0,
      aliases: Array.from(
        new Set(
          (ownerProfile.aliases || [])
            .map((alias) => String(alias || '').trim())
            .filter(Boolean),
        ),
      ),
    }

    ;[profile.ownerName, ...profile.aliases].forEach((name) => {
      const normalizedName = normalizeText(name)
      if (normalizedName) {
        lookup.set(normalizedName, profile)
      }
    })

    return lookup
  }, new Map())

const resolveOwnerProfile = (investment, ownerProfileLookup) => {
  const ownerName = String(investment.ownerName || investment.holderName || '').trim()
  const matchedProfile = ownerProfileLookup.get(normalizeText(ownerName))

  return {
    ownerId: String(
      matchedProfile?.ownerId || investment.ownerId || normalizeText(ownerName) || ownerName || 'unknown-owner',
    ),
    ownerName: matchedProfile?.ownerName || ownerName || 'Unknown owner',
    ownerType: matchedProfile?.ownerType || String(investment.ownerType || 'Individual'),
    ownerTaxSlab: matchedProfile?.ownerTaxSlab ?? Number(investment.ownerTaxSlab || 0),
    hasConfiguredTaxProfile: Boolean(matchedProfile),
  }
}

export const parseFinancialYearLabel = (label) => {
  const [startYearText] = String(label || '').split('-')
  const startYear = Number(startYearText)
  const safeStartYear = Number.isFinite(startYear) ? startYear : new Date().getFullYear()

  return {
    label: `${safeStartYear}-${String((safeStartYear + 1) % 100).padStart(2, '0')}`,
    start: new Date(safeStartYear, 3, 1),
    end: new Date(safeStartYear + 1, 2, 31),
  }
}

const getFinancialYearLabelFromDate = (date) => {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

const normalizeCalculationFrequency = (value) => {
  const normalizedValue = String(value || '').trim().toUpperCase()
  if (normalizedValue === 'SIMPLE INTEREST') {
    return 'SIMPLE'
  }
  return CALCULATION_FREQUENCIES.includes(normalizedValue) ? normalizedValue : ''
}

const normalizePayoutFrequency = (value) => {
  const normalizedValue = String(value || '').trim().toUpperCase()
  if (normalizedValue === 'AT MATURITY') {
    return 'CUMULATIVE'
  }
  return PAYOUT_FREQUENCIES.includes(normalizedValue) ? normalizedValue : ''
}

const buildAppliedRuleLabel = (calculationFrequency, payoutFrequency) => {
  if (payoutFrequency === 'CUMULATIVE') {
    return `DAILY_${calculationFrequency}_CUMULATIVE`
  }

  if (calculationFrequency === payoutFrequency) {
    return `DAILY_${calculationFrequency}_PERIODIC_PAYOUT`
  }

  return `DAILY_${calculationFrequency}_CALC_${payoutFrequency}_PAYOUT`
}

export const normalizeInterestAccrualConfig = (config = {}) => {
  const explicitPayoutFrequency = normalizePayoutFrequency(
    config.interestPayoutFrequency || config.payoutFrequency,
  )
  const payoutMode = normalizeText(config.payoutMode)
  const investmentType = normalizeText(config.investmentType)
  const derivedPayoutFrequency =
    explicitPayoutFrequency ||
    (investmentType === 'scss' || payoutMode === 'quarterly-fy'
      ? 'QUARTERLY'
      : payoutMode === 'yearly-fixed' ||
          (investmentType === 'bond' &&
            payoutMode === 'on-maturity' &&
            config.yearlyPayoutMonthDay)
        ? 'YEARLY'
        : 'CUMULATIVE')
  const explicitCalculationFrequency = normalizeCalculationFrequency(
    config.interestCalculationFrequency || config.calculationFrequency,
  )

  if (derivedPayoutFrequency === 'CUMULATIVE') {
    const compoundingFrequency =
      explicitCalculationFrequency &&
      ['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(explicitCalculationFrequency)
        ? explicitCalculationFrequency
        : 'QUARTERLY'

    const normalized = {
      payoutFrequency: 'CUMULATIVE',
      compoundingEnabled: true,
      compoundingFrequency,
      calculationFrequency: compoundingFrequency,
      hasExplicitCalculationFrequency: Boolean(explicitCalculationFrequency),
      hasExplicitPayoutFrequency: Boolean(explicitPayoutFrequency),
    }

    return normalized
  }

  const normalized = {
    payoutFrequency: derivedPayoutFrequency,
    compoundingEnabled: false,
    compoundingFrequency: 'SIMPLE',
    calculationFrequency: 'SIMPLE',
    hasExplicitCalculationFrequency: Boolean(explicitCalculationFrequency),
    hasExplicitPayoutFrequency: Boolean(explicitPayoutFrequency),
  }

  return normalized
}

const buildConfidenceLevel = ({
  hasExplicitCalculationFrequency,
  hasExplicitPayoutFrequency,
  hasConfiguredTaxProfile,
}) => {
  if (!hasConfiguredTaxProfile) {
    return 'MEDIUM'
  }

  if (hasExplicitCalculationFrequency && hasExplicitPayoutFrequency) {
    return 'HIGH'
  }

  if (hasExplicitCalculationFrequency || hasExplicitPayoutFrequency) {
    return 'MEDIUM'
  }

  return 'MEDIUM'
}

const createFinancialYearAccumulator = () => ({
  interestAccrued: 0,
  interestPaid: 0,
})

const addToFinancialYearMap = (map, financialYear, field, amount) => {
  const entry = map.get(financialYear) || createFinancialYearAccumulator()
  entry[field] += amount
  map.set(financialYear, entry)
}

const buildBoundarySet = (valueDate, maturityDate, periodMonths) => {
  const boundaries = new Set()
  if (!periodMonths || periodMonths <= 0) {
    return boundaries
  }

  let cursor = addMonths(valueDate, periodMonths)
  while (cursor.getTime() <= maturityDate.getTime()) {
    boundaries.add(toYmd(cursor))
    cursor = addMonths(cursor, periodMonths)
  }

  return boundaries
}

const buildDailyAccrualTimeline = (investment, selectedFinancialYear = null) => {
  const valueDate = parseDate(investment.valueDate || investment.investmentDate)
  const maturityDate = parseDate(investment.maturityDate)
  const principal = Number(investment.principal || investment.principalAmount)
  const annualRate = parsePercentToDecimal(investment.annualRate || investment.interestRate)

  if (
    !valueDate ||
    !maturityDate ||
    maturityDate.getTime() <= valueDate.getTime() ||
    !Number.isFinite(principal) ||
    principal <= 0 ||
    annualRate <= 0
  ) {
    return {
      valid: false,
      valueDate,
      maturityDate,
      principal: Number.isFinite(principal) ? principal : 0,
      annualRate,
      accrualByFinancialYear: [],
      selectedFinancialYearInterest: null,
      calculationFrequency: '',
      payoutFrequency: '',
      hasExplicitCalculationFrequency: false,
      hasExplicitPayoutFrequency: false,
    }
  }

  const { effectiveStart, effectiveEnd, hasOverlap: hasSelectedFinancialYearOverlap } =
    clipTimelineToFinancialYear(valueDate, maturityDate, selectedFinancialYear)

  const normalizedConfig = normalizeInterestAccrualConfig({
    ...investment,
    interestCalculationFrequency:
      investment.interestCalculationFrequency || investment.calculationFrequency,
    interestPayoutFrequency:
      investment.interestPayoutFrequency || investment.payoutFrequency,
  })
  const payoutFrequency = normalizedConfig.payoutFrequency
  const calculationFrequency = normalizedConfig.calculationFrequency
  const compoundingDates =
    !normalizedConfig.compoundingEnabled || calculationFrequency === 'SIMPLE'
      ? new Set()
      : buildBoundarySet(valueDate, maturityDate, CALCULATION_PERIOD_MONTHS[calculationFrequency])
  compoundingDates.delete(toYmd(maturityDate))
  const payoutDates =
    payoutFrequency === 'CUMULATIVE'
      ? new Set([toYmd(maturityDate)])
      : buildBoundarySet(valueDate, maturityDate, PAYOUT_PERIOD_MONTHS[payoutFrequency])
  const financialYearMap = new Map()
  const dailyRate = annualRate / 365
  const originalPrincipal = principal
  let currentPrincipal = originalPrincipal
  let accumulatedInterestSinceLastPayout = 0
  let accumulatedInterestSinceLastCompounding = 0
  let cursor = new Date(valueDate)
  let totalInterest = 0
  let selectedFinancialYearInterestAccrued = 0
  let selectedFinancialYearInterestPaid = 0

  while (cursor.getTime() <= maturityDate.getTime()) {
    const dayKey = toYmd(cursor)
    const interestBasePrincipal = normalizedConfig.compoundingEnabled
      ? currentPrincipal
      : originalPrincipal
    const interestForDay = interestBasePrincipal * dailyRate
    const financialYear = getFinancialYearLabelFromDate(cursor)
    const nextDay = addDays(cursor, 1)
    const boundaryKey = toYmd(nextDay)
    const isInSelectedFinancialYear =
      hasSelectedFinancialYearOverlap &&
      isSameOrAfter(cursor, effectiveStart) &&
      isSameOrBefore(cursor, effectiveEnd)

    totalInterest += interestForDay
    addToFinancialYearMap(financialYearMap, financialYear, 'interestAccrued', interestForDay)
    if (isInSelectedFinancialYear) {
      selectedFinancialYearInterestAccrued += interestForDay
    }

    accumulatedInterestSinceLastPayout += interestForDay
    if (normalizedConfig.compoundingEnabled) {
      accumulatedInterestSinceLastCompounding += interestForDay
    }

    if (compoundingDates.has(dayKey) && normalizedConfig.compoundingEnabled) {
      currentPrincipal += accumulatedInterestSinceLastCompounding
      accumulatedInterestSinceLastCompounding = 0
    }

    if (
      payoutDates.has(boundaryKey) &&
      !(payoutFrequency === 'CUMULATIVE' && boundaryKey === toYmd(maturityDate))
    ) {
      addToFinancialYearMap(
        financialYearMap,
        getFinancialYearLabelFromDate(nextDay),
        'interestPaid',
        accumulatedInterestSinceLastPayout,
      )
      if (
        hasSelectedFinancialYearOverlap &&
        isSameOrAfter(nextDay, effectiveStart) &&
        isSameOrBefore(nextDay, effectiveEnd)
      ) {
        selectedFinancialYearInterestPaid += accumulatedInterestSinceLastPayout
      }

      currentPrincipal = originalPrincipal
      accumulatedInterestSinceLastPayout = 0
      accumulatedInterestSinceLastCompounding = 0
    }

    cursor = nextDay
  }

  if (accumulatedInterestSinceLastPayout > 0 && payoutFrequency === 'CUMULATIVE') {
    addToFinancialYearMap(
      financialYearMap,
      getFinancialYearLabelFromDate(maturityDate),
      'interestPaid',
      accumulatedInterestSinceLastPayout,
    )
    if (
      hasSelectedFinancialYearOverlap &&
      isSameOrAfter(maturityDate, effectiveStart) &&
      isSameOrBefore(maturityDate, effectiveEnd)
    ) {
      selectedFinancialYearInterestPaid += accumulatedInterestSinceLastPayout
    }
  }

  const accrualByFinancialYear = Array.from(financialYearMap.entries())
    .map(([financialYear, entry]) => ({
      financialYear,
      interestAccrued: roundAmount(entry.interestAccrued),
      interestPaid: roundAmount(entry.interestPaid),
      totalInterest: roundAmount(entry.interestAccrued),
    }))
    .sort((left, right) => left.financialYear.localeCompare(right.financialYear))

  return {
    valid: true,
    valueDate,
    maturityDate,
    principal,
    annualRate,
    accrualByFinancialYear,
    totalInterest: roundAmount(totalInterest),
    selectedFinancialYearInterest: hasSelectedFinancialYearOverlap
      ? roundAmount(selectedFinancialYearInterestAccrued)
      : 0,
    selectedFinancialYearBreakdown: {
      financialYear: selectedFinancialYear?.label || '',
      interestAccrued: hasSelectedFinancialYearOverlap
        ? roundAmount(selectedFinancialYearInterestAccrued)
        : 0,
      interestPaid: hasSelectedFinancialYearOverlap
        ? roundAmount(selectedFinancialYearInterestPaid)
        : 0,
      totalInterest: hasSelectedFinancialYearOverlap
        ? roundAmount(selectedFinancialYearInterestAccrued)
        : 0,
    },
    calculationFrequency,
    payoutFrequency,
    hasExplicitCalculationFrequency: normalizedConfig.hasExplicitCalculationFrequency,
    hasExplicitPayoutFrequency: normalizedConfig.hasExplicitPayoutFrequency,
  }
}

const createZeroBreakdown = ({
  investment,
  profile,
  fy,
  appliedRule,
  confidenceLevel,
  calculationFrequency,
  payoutFrequency,
}) => ({
  ownerId: profile.ownerId,
  ownerName: profile.ownerName,
  ownerType: profile.ownerType,
  institutionName: String(investment.institutionName || investment.bankName || '').trim(),
  investmentType: String(investment.investmentType || '').trim(),
  principal: Number.isFinite(Number(investment.principal || investment.principalAmount))
    ? Number(investment.principal || investment.principalAmount)
    : 0,
  interestRate: Number.isFinite(Number(investment.annualRate || investment.interestRate))
    ? Number(investment.annualRate || investment.interestRate)
    : 0,
  valueDate: investment.valueDate || investment.investmentDate || '',
  maturityDate: investment.maturityDate || '',
  financialYear: fy.label,
  estimatedInterestPaid: 0,
  estimatedInterestAccrued: 0,
  estimatedTotalInterest: 0,
  estimatedTds: 0,
  estimatedTaxableInterest: 0,
  estimatedAdditionalTaxLiability: 0,
  appliedRule,
  confidenceLevel,
  calculationFrequency,
  payoutFrequency,
  hasConfiguredTaxProfile: profile.hasConfiguredTaxProfile,
  investmentId: String(investment.id || ''),
  accountNumber: String(investment.accountNumber || '').trim(),
  status: String(investment.status || '').trim() || 'Open',
  financialYearBreakdown: [],
})

export const calculateFinancialYearInterestAccruals = (investment) => {
  const timeline = buildDailyAccrualTimeline(investment)
  return timeline.accrualByFinancialYear.map((entry) => ({
    financialYear: entry.financialYear,
    interestAccrued: entry.interestAccrued,
  }))
}

export const estimateInvestmentTaxView = (investment, selectedFY, ownerTaxProfile = null) => {
  const fy = typeof selectedFY === 'string' ? parseFinancialYearLabel(selectedFY) : selectedFY
  const profile = ownerTaxProfile || {
    ownerId: String(investment.ownerId || ''),
    ownerName: String(investment.ownerName || investment.holderName || ''),
    ownerType: String(investment.ownerType || 'Individual'),
    ownerTaxSlab: Number(investment.ownerTaxSlab || 0),
    hasConfiguredTaxProfile: ownerTaxProfile !== null,
  }

  const timeline = buildDailyAccrualTimeline(investment, fy)
  const appliedRule = timeline.valid
    ? buildAppliedRuleLabel(timeline.calculationFrequency, timeline.payoutFrequency)
    : 'INSUFFICIENT_DATA'
  const confidenceLevel = timeline.valid
    ? buildConfidenceLevel({
        hasExplicitCalculationFrequency: timeline.hasExplicitCalculationFrequency,
        hasExplicitPayoutFrequency: timeline.hasExplicitPayoutFrequency,
        hasConfiguredTaxProfile: profile.hasConfiguredTaxProfile,
      })
    : 'LOW'

  if (!timeline.valid) {
    return createZeroBreakdown({
      investment,
      profile,
      fy,
      appliedRule,
      confidenceLevel,
      calculationFrequency: timeline.calculationFrequency || '',
      payoutFrequency: timeline.payoutFrequency || '',
    })
  }

  if (timeline.selectedFinancialYearInterest <= 0) {
    return createZeroBreakdown({
      investment,
      profile,
      fy,
      appliedRule: 'OUTSIDE_FINANCIAL_YEAR',
      confidenceLevel: 'HIGH',
      calculationFrequency: timeline.calculationFrequency,
      payoutFrequency: timeline.payoutFrequency,
    })
  }

  const selectedYearBreakdown = timeline.selectedFinancialYearBreakdown || {
    financialYear: fy.label,
    interestAccrued: timeline.selectedFinancialYearInterest,
    interestPaid: 0,
    totalInterest: timeline.selectedFinancialYearInterest,
  }

  const estimatedTotalInterest = timeline.selectedFinancialYearInterest
  const estimatedTds = Math.max(roundAmount(estimatedTotalInterest * 0.1), 0)
  const ownerTaxSlabDecimal = parsePercentToDecimal(profile.ownerTaxSlab)
  const estimatedAdditionalTaxLiability = Math.max(
    roundAmount(estimatedTotalInterest * ownerTaxSlabDecimal - estimatedTds),
    0,
  )

  return {
    ownerId: profile.ownerId,
    ownerName: profile.ownerName,
    ownerType: profile.ownerType,
    institutionName: String(investment.institutionName || investment.bankName || '').trim(),
    investmentType: String(investment.investmentType || '').trim(),
    principal: timeline.principal,
    interestRate: Number(investment.annualRate || investment.interestRate),
    valueDate: toYmd(timeline.valueDate),
    maturityDate: toYmd(timeline.maturityDate),
    financialYear: fy.label,
    estimatedInterestPaid: selectedYearBreakdown.interestPaid,
    estimatedInterestAccrued: estimatedTotalInterest,
    estimatedTotalInterest,
    estimatedTds,
    estimatedTaxableInterest: estimatedTotalInterest,
    estimatedAdditionalTaxLiability,
    appliedRule,
    confidenceLevel,
    calculationFrequency: timeline.calculationFrequency,
    payoutFrequency: timeline.payoutFrequency,
    hasConfiguredTaxProfile: profile.hasConfiguredTaxProfile,
    investmentId: String(investment.id || ''),
    accountNumber: String(investment.accountNumber || '').trim(),
    status: String(investment.status || '').trim() || 'Open',
    financialYearBreakdown: timeline.accrualByFinancialYear,
  }
}

const createEmptySummaryTotals = () => ({
  totalEstimatedInterestPaid: 0,
  totalEstimatedInterestAccrued: 0,
  totalEstimatedTaxableInterest: 0,
  totalEstimatedTds: 0,
  totalEstimatedAdditionalTaxLiability: 0,
})

const addBreakdownToTotals = (totals, breakdown) => ({
  totalEstimatedInterestPaid:
    totals.totalEstimatedInterestPaid + breakdown.estimatedInterestPaid,
  totalEstimatedInterestAccrued:
    totals.totalEstimatedInterestAccrued + breakdown.estimatedInterestAccrued,
  totalEstimatedTaxableInterest:
    totals.totalEstimatedTaxableInterest + breakdown.estimatedTaxableInterest,
  totalEstimatedTds: totals.totalEstimatedTds + breakdown.estimatedTds,
  totalEstimatedAdditionalTaxLiability:
    totals.totalEstimatedAdditionalTaxLiability + breakdown.estimatedAdditionalTaxLiability,
})

const addSummaryToTotals = (totals, summary) => ({
  totalEstimatedInterestPaid:
    totals.totalEstimatedInterestPaid + summary.totalEstimatedInterestPaid,
  totalEstimatedInterestAccrued:
    totals.totalEstimatedInterestAccrued + summary.totalEstimatedInterestAccrued,
  totalEstimatedTaxableInterest:
    totals.totalEstimatedTaxableInterest + summary.totalEstimatedTaxableInterest,
  totalEstimatedTds: totals.totalEstimatedTds + summary.totalEstimatedTds,
  totalEstimatedAdditionalTaxLiability:
    totals.totalEstimatedAdditionalTaxLiability + summary.totalEstimatedAdditionalTaxLiability,
})

export const generateOwnerWiseFYTaxSummary = (investmentList = [], selectedFY, ownerProfiles = []) => {
  const fy = typeof selectedFY === 'string' ? parseFinancialYearLabel(selectedFY) : selectedFY
  const ownerProfileLookup = buildOwnerProfileLookup(ownerProfiles)
  const ownerMap = new Map()

  investmentList.forEach((investment) => {
    const ownerProfile = resolveOwnerProfile(investment, ownerProfileLookup)
    const breakdown = estimateInvestmentTaxView(investment, fy, ownerProfile)

    if (
      breakdown.appliedRule === 'OUTSIDE_FINANCIAL_YEAR' ||
      breakdown.appliedRule === 'INSUFFICIENT_DATA'
    ) {
      return
    }

    const current = ownerMap.get(breakdown.ownerId) || {
      ownerId: breakdown.ownerId,
      ownerName: breakdown.ownerName,
      ownerType: breakdown.ownerType,
      ownerTaxSlabRate: ownerProfile.ownerTaxSlab,
      hasConfiguredTaxProfile: ownerProfile.hasConfiguredTaxProfile,
      investmentCount: 0,
      investmentBreakdown: [],
      ...createEmptySummaryTotals(),
    }

    current.investmentBreakdown.push(breakdown)
    current.investmentCount += 1
    Object.assign(current, addBreakdownToTotals(current, breakdown))
    ownerMap.set(breakdown.ownerId, current)
  })

  const ownerWiseSummary = Array.from(ownerMap.values())
    .map((summary) => ({
      ...summary,
      investmentBreakdown: summary.investmentBreakdown.sort(
        (left, right) =>
          new Date(left.maturityDate).getTime() - new Date(right.maturityDate).getTime(),
      ),
    }))
    .sort((left, right) => right.totalEstimatedTaxableInterest - left.totalEstimatedTaxableInterest)

  const consolidatedPortfolioSummary = ownerWiseSummary.reduce(
    (totals, ownerSummary) => addSummaryToTotals(totals, ownerSummary),
    {
      ownerCount: ownerWiseSummary.length,
      investmentCount: ownerWiseSummary.reduce(
        (sum, ownerSummary) => sum + ownerSummary.investmentCount,
        0,
      ),
      ...createEmptySummaryTotals(),
    },
  )

  return {
    fy: fy.label,
    ownerWiseSummary,
    consolidatedPortfolioSummary,
  }
}
