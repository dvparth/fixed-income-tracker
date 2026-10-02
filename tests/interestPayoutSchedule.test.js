import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRORATED_PAYOUT_SCHEDULE,
  emptyForm,
  generateInterestEvents,
  getEditableNetPayoutValue,
  normalizeDeposit,
} from '../src/features/deposits/depositModel.js'

const quarterlyScss = {
  id: 'scss-1',
  instrumentType: 'SCSS',
  bankName: 'Example Bank',
  principalAmount: 1500000,
  interestRate: 8.2,
  investmentDate: '2026-08-31',
  maturityDate: '2031-08-31',
  payoutMode: 'quarterly-fy',
  interestPayoutBeforeTds: 30750,
  interestPayoutAfterTds: 27675,
  tdsPercent: 10,
}

test('prorated quarterly schedule separates first and final interest from principal maturity', () => {
  const events = generateInterestEvents({
    ...quarterlyScss,
    interestPayoutSchedule: PRORATED_PAYOUT_SCHEDULE,
  })

  const first = events.find((event) => event.isFirstPeriod)
  const final = events.find((event) => event.isFinalPeriod)

  assert.deepEqual(
    { date: first.date, gross: first.grossAmount, net: first.amount, days: first.calculatedGrossAmount !== null ? 30 : 0 },
    { date: '2026-09-30', gross: 10109.59, net: 9098.63, days: 30 },
  )
  assert.deepEqual(
    { date: final.date, gross: final.grossAmount, net: final.amount },
    { date: '2031-08-31', gross: 20893.15, net: 18803.84 },
  )
  assert.equal(events.some((event) => event.type === 'Maturity'), false)
})

test('first and final payout overrides replace only the calculated boundary interest', () => {
  const events = generateInterestEvents({
    ...quarterlyScss,
    interestPayoutSchedule: PRORATED_PAYOUT_SCHEDULE,
    interestPayoutOverrides: [
      { key: 'first', grossAmount: 10000, netAmount: 9000 },
      { key: 'final', grossAmount: 21000, netAmount: 18900 },
    ],
  })

  assert.equal(events.find((event) => event.isFirstPeriod).amount, 9000)
  assert.equal(events.find((event) => event.isFinalPeriod).grossAmount, 21000)
  assert.equal(events.find((event) => event.date === '2026-12-31').amount, 27675)
})

test('prorated payouts use the default TDS rate when the standard net payout is not entered yet', () => {
  const events = generateInterestEvents({
    ...quarterlyScss,
    interestPayoutAfterTds: '',
    interestPayoutSchedule: PRORATED_PAYOUT_SCHEDULE,
  })

  assert.equal(events.find((event) => event.isFirstPeriod).amount, 9098.63)
})

test('standard net payout is retained when the investment is normalized for saving and re-editing', () => {
  const savedDeposit = normalizeDeposit(
    {
      ...emptyForm,
      ...quarterlyScss,
      holderName: 'Owner',
      accountNumber: 'SCSS-1',
      interestPayoutSchedule: PRORATED_PAYOUT_SCHEDULE,
    },
    'scss-1',
    1,
  )

  assert.equal(savedDeposit.interestPayoutAfterTds, 27675)
  assert.equal(savedDeposit.interestPayoutBeforeTds, 30750)
  assert.equal(getEditableNetPayoutValue(savedDeposit), 27675)
})

test('re-editing an older gross-only payout shows the calculated net amount', () => {
  assert.equal(
    getEditableNetPayoutValue({ interestPayoutBeforeTds: 30750, interestPayoutAfterTds: '', tdsPercent: 10 }),
    27675,
  )
})

test('legacy quarterly investments keep their current event dates and fixed payout amount', () => {
  const events = generateInterestEvents(quarterlyScss)

  assert.equal(events.at(-1).date, '2031-06-30')
  assert.equal(events.every((event) => event.amount === 27675), true)
  assert.equal(events.some((event) => event.isFinalPeriod), false)
})
