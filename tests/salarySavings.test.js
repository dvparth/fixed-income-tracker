import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import mongoose from 'mongoose'
import request from 'supertest'
import XLSX from 'xlsx'
import {
  filterSavingsByFinancialYear,
  summarizeInvestmentSalaryFunding,
  summarizeSavings,
} from '../src/features/salary/salarySavingsModel.js'

process.env.NODE_ENV = 'production'
process.env.SERVER_DISABLE_START = 'true'
process.env.SERVER_MONGO_URI = process.env.SERVER_MONGO_URI || 'mongodb://localhost:27017/YieldFlowTest'
process.env.SERVER_GOOGLE_CLIENT_ID =
  process.env.SERVER_GOOGLE_CLIENT_ID || 'test-client.apps.googleusercontent.com'
process.env.SERVER_SESSION_SECRET = 'salary-test-session-secret'
process.env.SERVER_ALLOWED_ORIGINS = 'https://app.example.test'

const { default: app, parseBackupWorkbook, validateBackupSnapshot } = await import('../server/index.js')
const ownerUserId = '65f000000000000000000001'
const sessionToken = 'salary-savings-test-session'
const sessionHash = createHmac('sha256', process.env.SERVER_SESSION_SECRET).update(sessionToken).digest('hex')
const SalarySaving = mongoose.model('SalarySaving')
const Deposit = mongoose.model('Deposit')
let currentUserRole = 'user'
const testInvestments = [
  { id: 'investment-1', bankName: 'Test Bank', accountNumber: 'A-1', principalAmount: 1000 },
  { id: 'investment-2', bankName: 'Other Bank', accountNumber: 'B-1', principalAmount: 1000 },
]
const storedSalarySavings = []

mongoose.model('YieldflowSession').findOne = () => ({
  lean: async () => ({ _id: 'session-id', userId: ownerUserId, expiresAt: new Date(Date.now() + 60_000) }),
})
mongoose.model('YieldflowSession').updateOne = async () => ({})
mongoose.model('YieldflowUser').findById = () => ({
  lean: async () => ({ _id: ownerUserId, displayName: 'Test Owner', email: 'owner@example.test', systemRole: currentUserRole }),
})
mongoose.model('YieldflowUser').find = () => ({
  lean: async () => [{ _id: ownerUserId, displayName: 'Test Owner', email: 'owner@example.test' }],
})
mongoose.model('PortfolioShare').find = () => ({ lean: async () => [] })
mongoose.model('MasterData').distinct = async () => [ownerUserId]
Deposit.distinct = async () => [ownerUserId]
Deposit.find = (query = {}) => ({
  lean: async () => testInvestments.filter((investment) =>
    !query.id?.$in || query.id.$in.includes(investment.id),
  ),
})
Deposit.findOne = () => ({
  lean: async () => ({
    id: 'investment-1',
    ownerUserId,
    bankName: 'Test Bank',
    accountNumber: 'A-1',
    principalAmount: 1000,
    status: 'Open',
    isDeleted: false,
  }),
})
SalarySaving.find = (query = {}) => ({
  sort() { return this },
  lean: async () => storedSalarySavings.filter((saving) => {
    if (query.ownerUserId && saving.ownerUserId !== query.ownerUserId) return false
    if (query.id?.$ne && saving.id === query.id.$ne) return false
    const investmentIds = query['investmentAllocations.investmentId']?.$in
    return !investmentIds || saving.investmentAllocations.some((link) => investmentIds.includes(link.investmentId))
  }),
})
SalarySaving.create = async (payload) => {
  const saving = { ...payload, _id: `db-${storedSalarySavings.length + 1}` }
  storedSalarySavings.push(saving)
  return { toObject: () => saving }
}
SalarySaving.countDocuments = async (query) => storedSalarySavings.filter((saving) =>
  saving.ownerUserId === query.ownerUserId &&
  saving.investmentAllocations.some((link) => link.investmentId === 'investment-1'),
).length

const salarySaving = (overrides = {}) => ({
  id: 'salary-1',
  salaryMonth: '2026-04',
  amount: 1000,
  unavailable: [{ id: 'unavailable-1', amount: 100, reason: 'Expense' }],
  investmentAllocations: [{ id: 'allocation-1', investmentId: 'deposit-1', amount: 700 }],
  notes: '',
  ...overrides,
})

const validDeposit = (overrides = {}) => ({
  rowNumber: 2,
  row: {},
  parseError: '',
  payload: {
    id: 'deposit-1',
    holderName: 'Owner',
    bankName: 'Bank',
    instrumentType: 'FD',
    investmentDate: '2026-01-01',
    maturityDate: '2027-01-01',
    principalAmount: 1000,
    allocations: [],
    cashSettlements: [],
    ...overrides,
  },
})

const validate = (salarySavings, deposits = []) => validateBackupSnapshot({
  metadataRows: [],
  masterData: {
    owners: [{ name: 'Owner' }],
    institutions: [{ name: 'Bank', branches: [] }],
    instrumentTypes: [{ name: 'FD' }],
  },
  deposits,
  salarySavings,
})

test('salary savings financial years include April through March boundaries', () => {
  const savings = [
    { salaryMonth: '2026-03' },
    { salaryMonth: '2026-04' },
    { salaryMonth: '2027-03' },
    { salaryMonth: '2027-04' },
  ]

  assert.deepEqual(
    filterSavingsByFinancialYear(savings, '2026-27').map((item) => item.salaryMonth),
    ['2026-04', '2027-03'],
  )
})

test('salary summaries total targets, invested, unavailable, and remaining amounts', () => {
  assert.deepEqual(summarizeSavings([
    { amount: 1000, investedAmount: 700, unavailableAmount: 100, remainingAmount: 200 },
    { amount: 500, investedAmount: 200, unavailableAmount: 0, remainingAmount: 300 },
  ]), { savings: 1500, invested: 900, unavailable: 100, remaining: 500 })
})

test('investment salary funding only includes links to the selected investment', () => {
  assert.deepEqual(summarizeInvestmentSalaryFunding([
    { salaryMonth: '2026-04', investmentAllocations: [{ investmentId: 'deposit-1', amount: 300 }] },
    { salaryMonth: '2026-05', investmentAllocations: [{ investmentId: 'deposit-1', amount: 200 }, { investmentId: 'deposit-2', amount: 900 }] },
  ], 'deposit-1', 1000), {
    total: 500,
    outsideAmount: 500,
    links: [{ salaryMonth: '2026-04', amount: 300 }, { salaryMonth: '2026-05', amount: 200 }],
  })
})

test('backup parser preserves malformed salary rows for validation', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Field', 'Value']]), 'Metadata')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ID', 'Name']]), 'Owners')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ID', 'Name']]), 'Institutions')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Institution ID', 'Branch ID']]), 'Branches')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ID', 'Name']]), 'InstrumentTypes')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Investment ID']]), 'Deposits')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Record Data'],
    [JSON.stringify(salarySaving({ investmentAllocations: [] }))],
    ['{invalid json'],
  ]), 'Salary Savings')

  const parsed = parseBackupWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

  assert.equal(parsed.salarySavings.length, 2)
  assert.equal(parsed.salarySavings[1].rowNumber, 3)
  assert.match(parsed.salarySavings[1].parseError, /Could not read/)
  assert.equal(validateBackupSnapshot(parsed).hasErrors, true)
})

test('backup validation accepts valid salary savings with matching investment references', () => {
  const result = validate([salarySaving()], [validDeposit()])

  assert.equal(result.hasErrors, false)
  assert.deepEqual(result.snapshot.salarySavings, [salarySaving()])
  assert.equal(result.summary.salarySavingsCount, 1)
})

test('backup validation rejects duplicate months and salary allocations over target', () => {
  const result = validate([
    { rowNumber: 2, payload: salarySaving() },
    { rowNumber: 3, payload: salarySaving({ id: 'salary-2', amount: 500 }) },
  ], [validDeposit()])

  assert.equal(result.hasErrors, true)
  assert.ok(result.errors.some((message) => message.includes('appears more than once')))
  assert.ok(result.errors.some((message) => message.includes('cannot exceed the monthly savings amount')))
})

test('backup validation rejects missing investment references and principal over-allocation', () => {
  const missingReference = validate([salarySaving()], [])
  assert.equal(missingReference.hasErrors, true)
  assert.ok(missingReference.errors.some((message) => message.includes('not present as a valid investment')))

  const overAllocated = validate([
    { rowNumber: 2, payload: salarySaving({ investmentAllocations: [{ investmentId: 'deposit-1', amount: 700 }] }) },
    { rowNumber: 3, payload: salarySaving({ id: 'salary-2', salaryMonth: '2026-05', unavailable: [], investmentAllocations: [{ investmentId: 'deposit-1', amount: 700 }] }) },
  ], [validDeposit({ principalAmount: 1000 })])
  assert.equal(overAllocated.hasErrors, true)
  assert.ok(overAllocated.errors.some((message) => message.includes('exceed its principal amount')))
})

const authenticatedRequest = (method, path) => request(app)[method](path)
  .set('Cookie', `yieldflow_session=${encodeURIComponent(sessionToken)}`)

test('salary savings API creates a valid record and returns normalized totals', async () => {
  const response = await authenticatedRequest('post', `/api/salary-savings?ownerUserId=${ownerUserId}`)
    .set('Origin', 'https://app.example.test')
    .send({
      salaryMonth: '2026-06',
      amount: 1000,
      unavailable: [{ amount: 100, reason: 'Expense' }],
      investmentAllocations: [{ investmentId: 'investment-1', amount: 600 }],
      notes: 'Monthly target',
    })
    .expect(201)

  assert.equal(response.body.salaryMonth, '2026-06')
  assert.equal(response.body.investedAmount, 600)
  assert.equal(response.body.unavailableAmount, 100)
  assert.equal(response.body.remainingAmount, 300)

  const list = await authenticatedRequest('get', `/api/salary-savings?ownerUserId=${ownerUserId}`).expect(200)
  assert.equal(list.body.length, 1)
  assert.equal(list.body[0].investmentAllocations[0].investmentLabel, 'Test Bank · A-1')
})

test('salary savings API rejects over-target and over-investment allocations', async () => {
  const overTarget = await authenticatedRequest('post', `/api/salary-savings?ownerUserId=${ownerUserId}`)
    .set('Origin', 'https://app.example.test')
    .send({ salaryMonth: '2026-07', amount: 500, investmentAllocations: [{ investmentId: 'investment-1', amount: 501 }] })
    .expect(400)
  assert.match(overTarget.body.message, /cannot exceed the monthly savings amount/)

  const overInvestment = await authenticatedRequest('post', `/api/salary-savings?ownerUserId=${ownerUserId}`)
    .set('Origin', 'https://app.example.test')
    .send({ salaryMonth: '2026-07', amount: 1500, investmentAllocations: [{ investmentId: 'investment-2', amount: 1100 }] })
    .expect(400)
  assert.match(overInvestment.body.message, /cannot exceed its investment amount/)
})

test('linked investments cannot be archived or permanently deleted', async () => {
  await authenticatedRequest('post', `/api/deposits/investment-1/archive?ownerUserId=${ownerUserId}`)
    .set('Origin', 'https://app.example.test')
    .expect(409)

  currentUserRole = 'admin'
  await authenticatedRequest('delete', `/api/deposits/investment-1?ownerUserId=${ownerUserId}`)
    .set('Origin', 'https://app.example.test')
    .expect(409)
  currentUserRole = 'user'
})