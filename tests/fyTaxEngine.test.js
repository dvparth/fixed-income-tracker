import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateFinancialYearInterestAccruals,
  estimateInvestmentTaxView,
  normalizeInterestAccrualConfig,
  parseFinancialYearLabel,
} from '../shared/fyTaxEngine.js'

test('Simple + At maturity normalizes to quarterly compounding', () => {
  const normalized = normalizeInterestAccrualConfig({
    interestCalculationFrequency: 'Simple',
    interestPayoutFrequency: 'At maturity',
  })

  assert.equal(normalized.payoutFrequency, 'CUMULATIVE')
  assert.equal(normalized.compoundingEnabled, true)
  assert.equal(normalized.compoundingFrequency, 'QUARTERLY')
  assert.equal(normalized.calculationFrequency, 'QUARTERLY')
})

test('Quarterly calculation + quarterly payout stays non-compounding', () => {
  const normalized = normalizeInterestAccrualConfig({
    interestCalculationFrequency: 'Quarterly',
    interestPayoutFrequency: 'Quarterly',
  })

  assert.equal(normalized.payoutFrequency, 'QUARTERLY')
  assert.equal(normalized.compoundingEnabled, false)
  assert.equal(normalized.calculationFrequency, 'SIMPLE')
})

test('Quarterly payout products use simple daily interest on original principal', () => {
  const principal = 1500000
  const annualRate = 0.0725
  const valueDate = '2025-04-01'
  const maturityDate = '2026-03-31'

  const breakdown = estimateInvestmentTaxView(
    {
      principal,
      annualRate,
      valueDate,
      maturityDate,
      interestCalculationFrequency: 'Quarterly',
      interestPayoutFrequency: 'Quarterly',
      institutionName: 'Quarterly Payout FD',
      investmentType: 'SCSS',
    },
    parseFinancialYearLabel('2025-26'),
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  const daysInFy = 365
  const expectedSimpleInterest = Math.round(principal * annualRate * daysInFy / 365)

  assert.equal(breakdown.payoutFrequency, 'QUARTERLY')
  assert.equal(breakdown.calculationFrequency, 'SIMPLE')
  assert.equal(
    breakdown.estimatedTaxableInterest,
    expectedSimpleInterest,
    `Expected simple FY interest ${expectedSimpleInterest}, received ${breakdown.estimatedTaxableInterest}`,
  )
})

test('Simple + At maturity compounds for row-19 style case', () => {
  const breakdown = estimateInvestmentTaxView(
    {
      principal: 341621,
      annualRate: 0.0725,
      valueDate: '2025-01-22',
      maturityDate: '2026-07-22',
      interestCalculationFrequency: 'Simple',
      interestPayoutFrequency: 'At maturity',
      institutionName: 'Validation FD',
      investmentType: 'Term Deposit',
    },
    parseFinancialYearLabel('2026-27'),
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  assert.equal(breakdown.calculationFrequency, 'QUARTERLY')
  assert.equal(breakdown.payoutFrequency, 'CUMULATIVE')
  assert.ok(
    breakdown.estimatedTaxableInterest >= 8300 && breakdown.estimatedTaxableInterest <= 8450,
    `Expected compounded FY taxable interest near 8370, received ${breakdown.estimatedTaxableInterest}`,
  )
})

test('Cross-FY accrual stays continuous and yields multiple FY buckets', () => {
  const accruals = calculateFinancialYearInterestAccruals({
    principal: 200000,
    annualRate: 0.0725,
    valueDate: '2025-01-19',
    maturityDate: '2026-07-19',
    interestCalculationFrequency: 'Simple',
    interestPayoutFrequency: 'At maturity',
  })

  assert.deepEqual(
    accruals.map((entry) => entry.financialYear),
    ['2024-25', '2025-26', '2026-27'],
  )
  assert.ok(accruals[0].interestAccrued > 0)
  assert.ok(accruals[1].interestAccrued > accruals[0].interestAccrued)
  assert.ok(accruals[2].interestAccrued > 0)
})

test('Simple + At maturity yields compounded FY 2026-27 value near 4771 for 200000 case', () => {
  const breakdown = estimateInvestmentTaxView(
    {
      principal: 200000,
      annualRate: 0.0725,
      valueDate: '2025-01-19',
      maturityDate: '2026-07-19',
      interestCalculationFrequency: 'Simple',
      interestPayoutFrequency: 'At maturity',
      institutionName: 'Validation FD',
      investmentType: 'Term Deposit',
    },
    parseFinancialYearLabel('2026-27'),
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  assert.equal(breakdown.calculationFrequency, 'QUARTERLY')
  assert.equal(breakdown.payoutFrequency, 'CUMULATIVE')
  assert.ok(
    breakdown.estimatedTaxableInterest >= 4700 && breakdown.estimatedTaxableInterest <= 4850,
    `Expected compounded FY taxable interest near 4771, received ${breakdown.estimatedTaxableInterest}`,
  )
})

test('Selected FY clips accrual when investment starts after FY start', () => {
  const fy = parseFinancialYearLabel('2026-27')
  const clippedBreakdown = estimateInvestmentTaxView(
    {
      principal: 200000,
      annualRate: 0.0725,
      valueDate: '2026-04-09',
      maturityDate: '2027-04-09',
      interestCalculationFrequency: 'Simple',
      interestPayoutFrequency: 'At maturity',
      institutionName: 'Clipped FD',
      investmentType: 'Term Deposit',
    },
    fy,
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  const fullAccruals = calculateFinancialYearInterestAccruals({
    principal: 200000,
    annualRate: 0.0725,
    valueDate: '2026-04-09',
    maturityDate: '2027-04-09',
    interestCalculationFrequency: 'Simple',
    interestPayoutFrequency: 'At maturity',
  })
  const totalAcrossTenure = fullAccruals.reduce((sum, entry) => sum + entry.interestAccrued, 0)

  assert.ok(
    clippedBreakdown.estimatedTaxableInterest < totalAcrossTenure,
    `Expected FY-clipped interest less than full-tenure interest; received clipped=${clippedBreakdown.estimatedTaxableInterest}, full=${totalAcrossTenure}`,
  )
  assert.ok(
    clippedBreakdown.estimatedTaxableInterest > 0,
    `Expected positive FY-clipped interest, received ${clippedBreakdown.estimatedTaxableInterest}`,
  )
  assert.ok(
    totalAcrossTenure - clippedBreakdown.estimatedTaxableInterest < 1000,
    `Expected only a small tail outside FY 2026-27 for an investment starting on 2026-04-09; received clipped=${clippedBreakdown.estimatedTaxableInterest}, full=${totalAcrossTenure}`,
  )
})

test('Selected FY returns zero when investment has no overlap with the FY', () => {
  const breakdown = estimateInvestmentTaxView(
    {
      principal: 200000,
      annualRate: 0.0725,
      valueDate: '2024-01-01',
      maturityDate: '2024-12-31',
      interestCalculationFrequency: 'Simple',
      interestPayoutFrequency: 'At maturity',
      institutionName: 'Old FD',
      investmentType: 'Term Deposit',
    },
    parseFinancialYearLabel('2026-27'),
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  assert.equal(breakdown.appliedRule, 'OUTSIDE_FINANCIAL_YEAR')
  assert.equal(breakdown.estimatedTaxableInterest, 0)
})

test('Sum of FY splits stays aligned with full-tenure accrual for multi-FY FD', () => {
  const investment = {
    principal: 200000,
    annualRate: 0.0725,
    valueDate: '2025-01-19',
    maturityDate: '2026-07-19',
    interestCalculationFrequency: 'Simple',
    interestPayoutFrequency: 'At maturity',
    institutionName: 'Validation FD',
    investmentType: 'Term Deposit',
  }

  const accruals = calculateFinancialYearInterestAccruals(investment)
  const totalAcrossFinancialYears = accruals.reduce((sum, entry) => sum + entry.interestAccrued, 0)

  const fyTotals = ['2024-25', '2025-26', '2026-27'].map((financialYear) =>
    estimateInvestmentTaxView(investment, parseFinancialYearLabel(financialYear), {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    }).estimatedTaxableInterest,
  )

  const selectedFySum = fyTotals.reduce((sum, amount) => sum + amount, 0)
  assert.ok(
    Math.abs(selectedFySum - totalAcrossFinancialYears) <= 1,
    `Expected selected FY totals to reconcile with full-tenure accrual; received fySum=${selectedFySum}, full=${totalAcrossFinancialYears}`,
  )
})

test('Shifting start date by one day changes selected FY interest slightly', () => {
  const baseInvestment = {
    principal: 200000,
    annualRate: 0.0725,
    maturityDate: '2027-04-09',
    interestCalculationFrequency: 'Simple',
    interestPayoutFrequency: 'At maturity',
    institutionName: 'Shift Test FD',
    investmentType: 'Term Deposit',
  }
  const fy = parseFinancialYearLabel('2026-27')

  const startOnNinth = estimateInvestmentTaxView(
    {
      ...baseInvestment,
      valueDate: '2026-04-09',
    },
    fy,
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  const startOnTenth = estimateInvestmentTaxView(
    {
      ...baseInvestment,
      valueDate: '2026-04-10',
    },
    fy,
    {
      ownerId: 'owner-1',
      ownerName: 'Owner',
      ownerType: 'Individual',
      ownerTaxSlab: 0.3,
      hasConfiguredTaxProfile: true,
    },
  )

  assert.notEqual(
    startOnNinth.estimatedTaxableInterest,
    startOnTenth.estimatedTaxableInterest,
    'Expected one-day value-date shift to change selected FY interest',
  )
  assert.ok(
    Math.abs(startOnNinth.estimatedTaxableInterest - startOnTenth.estimatedTaxableInterest) < 100,
    `Expected one-day shift to create only a small delta; received ${startOnNinth.estimatedTaxableInterest} vs ${startOnTenth.estimatedTaxableInterest}`,
  )
})

test('Yearly compounding distributes FY accruals across a 5-year at-maturity deposit', () => {
  const accruals = calculateFinancialYearInterestAccruals({
    principal: 535000,
    annualRate: 0.068,
    valueDate: '2021-06-04',
    maturityDate: '2026-06-04',
    interestCalculationFrequency: 'Yearly',
    interestPayoutFrequency: 'At maturity',
  })

  assert.deepEqual(
    accruals.map((entry) => entry.financialYear),
    ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'],
  )

  const expected = {
    '2021-22': 29725,
    '2022-23': 38401,
    '2023-24': 41013,
    '2024-25': 43801,
    '2025-26': 46780,
    '2026-27': 8658,
  }

  accruals.forEach((entry) => {
    assert.ok(
      Math.abs(entry.interestAccrued - expected[entry.financialYear]) <= 300,
      `Expected FY ${entry.financialYear} near ${expected[entry.financialYear]}, received ${entry.interestAccrued}`,
    )
  })
})
