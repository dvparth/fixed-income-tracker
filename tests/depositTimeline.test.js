import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDepositTimelineItems } from '../src/features/deposits/depositTimeline.js'

const formatCurrency = (value) => `$${value}`

test('deposit timeline combines investment, payout, reinvestment, settlement, and maturity chronologically', () => {
  const timeline = buildDepositTimelineItems({
    deposit: {
      id: 'deposit-1',
      investmentDate: '2024-01-01',
      principalAmount: 10000,
      maturityDate: '2025-01-01',
      maturityAfterTax: 11000,
      status: 'Closed',
    },
    effectiveMaturityDate: '2025-01-01',
    sourceEvents: [{
      bankName: 'Source Bank',
      type: 'Interest',
      date: '2023-12-20',
      allocatedAmount: 10000,
    }],
    interestEvents: [{
      eventId: 'interest-1',
      date: '2024-07-01',
      amount: 500,
      grossAmount: 550,
      isDue: true,
      allocations: [{
        amount: 300,
        deposit: {
          id: 'deposit-2',
          bankName: 'Next Bank',
          accountNumber: 'NEXT-2',
          investmentDate: '2024-07-15',
        },
      }],
      settlements: [{
        amount: 200,
        settledAt: '2024-08-01T10:00:00.000Z',
      }],
    }],
    reinvestmentSummary: {
      isRealized: true,
      uninvestedAmount: 500,
      children: [{
        amount: 10000,
        deposit: {
          id: 'deposit-3',
          bankName: 'Maturity Reinvestment Bank',
          investmentDate: '2025-01-10',
        },
      }],
      settlements: [],
    },
    formatCurrency,
  })

  assert.deepEqual(
    timeline.map(({ kind, date }) => [kind, date]),
    [
      ['Invested', '2024-01-01'],
      ['Interest', '2024-07-01'],
      ['Reinvested', '2024-07-15'],
      ['Settled', '2024-08-01'],
      ['Maturity', '2025-01-01'],
      ['Reinvested', '2025-01-10'],
    ],
  )
  assert.equal(timeline[0].detail, 'Funded from Source Bank interest cash $10000 received 2023-12-20.')
  assert.equal(timeline[2].relatedDepositId, 'deposit-2')
  assert.equal(timeline[3].status, 'Settled outside YieldFlow')
})

test('deposit timeline labels an early closure and omits invalidly dated events', () => {
  const timeline = buildDepositTimelineItems({
    deposit: {
      id: 'deposit-closed',
      investmentDate: '2024-01-01',
      principalAmount: 10000,
      maturityDate: '2025-01-01',
      closureDate: '2024-10-01',
      maturityAfterTax: 10200,
      status: 'Closed',
    },
    effectiveMaturityDate: '2024-10-01',
    interestEvents: [{
      eventId: 'invalid-date',
      date: '',
      amount: 100,
      grossAmount: 100,
      allocations: [],
      settlements: [],
    }],
    reinvestmentSummary: {
      isRealized: true,
      uninvestedAmount: 10200,
      children: [],
      settlements: [],
    },
    formatCurrency,
  })

  assert.deepEqual(timeline.map(({ kind }) => kind), ['Invested', 'Closed early'])
  assert.equal(timeline[1].date, '2024-10-01')
})
