import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeActiveInvestmentsByIssuer } from '../src/features/dashboard/dashboardModel.js'

test('issuer summary groups active investments and adds their principal values', () => {
  const summary = summarizeActiveInvestmentsByIssuer([
    { status: 'Open', bankName: 'North Bank', principalAmount: 12000 },
    { status: 'Open', bankName: 'North Bank', principalAmount: 8000 },
    { status: 'Open', bankName: 'South Bank', principalAmount: 15000 },
  ])

  assert.deepEqual(summary, [
    { issuerName: 'North Bank', investmentCount: 2, principalAmount: 20000 },
    { issuerName: 'South Bank', investmentCount: 1, principalAmount: 15000 },
  ])
})

test('issuer summary ignores closed investments', () => {
  const summary = summarizeActiveInvestmentsByIssuer([
    { status: 'Open', bankName: 'North Bank', principalAmount: 12000 },
    { status: 'Closed', bankName: 'North Bank', principalAmount: 18000 },
    { status: 'Closed', bankName: 'South Bank', principalAmount: 9000 },
  ])

  assert.deepEqual(summary, [
    { issuerName: 'North Bank', investmentCount: 1, principalAmount: 12000 },
  ])
})

test('issuer summary trims names and groups missing issuer names as unknown', () => {
  const summary = summarizeActiveInvestmentsByIssuer([
    { status: 'Open', bankName: ' North Bank ', principalAmount: 5000 },
    { status: 'Open', bankName: '', principalAmount: 3000 },
    { status: 'Open', bankName: null, principalAmount: 2000 },
  ])

  assert.deepEqual(summary, [
    { issuerName: 'North Bank', investmentCount: 1, principalAmount: 5000 },
    { issuerName: 'Unknown issuer', investmentCount: 2, principalAmount: 5000 },
  ])
})

test('issuer summary orders equal values alphabetically and returns no rows without active investments', () => {
  const summary = summarizeActiveInvestmentsByIssuer([
    { status: 'Open', bankName: 'Zulu Bank', principalAmount: 5000 },
    { status: 'Open', bankName: 'Alpha Bank', principalAmount: 5000 },
  ])

  assert.deepEqual(summary.map(({ issuerName }) => issuerName), ['Alpha Bank', 'Zulu Bank'])
  assert.deepEqual(summarizeActiveInvestmentsByIssuer([{ status: 'Closed', bankName: 'Old Bank', principalAmount: 1000 }]), [])
})