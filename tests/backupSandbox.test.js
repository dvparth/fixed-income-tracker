import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import mongoose from 'mongoose'
import request from 'supertest'

process.env.NODE_ENV = 'production'
process.env.SERVER_DISABLE_START = 'true'
process.env.SERVER_MONGO_URI = 'mongodb://127.0.0.1:1/YieldFlowBackupSandbox'
process.env.SERVER_GOOGLE_CLIENT_ID = 'backup-sandbox.apps.example.test'
process.env.SERVER_SESSION_SECRET = 'backup-sandbox-session-secret'
process.env.SERVER_ALLOWED_ORIGINS = 'https://backup-sandbox.example.test'

const { default: app } = await import('../server/index.js')
const ownerUserId = '65f0000000000000000000a1'
const sessionToken = 'synthetic-backup-sandbox-session'
const sessionHash = createHmac('sha256', process.env.SERVER_SESSION_SECRET)
  .update(sessionToken)
  .digest('hex')
const Deposit = mongoose.model('Deposit')
const SalarySaving = mongoose.model('SalarySaving')
const MasterData = mongoose.model('MasterData')
const Session = mongoose.model('YieldflowSession')
const User = mongoose.model('YieldflowUser')
const AuditLog = mongoose.model('YieldflowAuditLog')
const originals = {}
const store = {
  deposits: [],
  salarySavings: [],
  masterData: null,
}

const clone = (value) => structuredClone(value)
const chain = (load) => ({
  session() { return this },
  sort() { return this },
  lean: async () => clone(load()),
})
const authenticatedRequest = (method, path) => request(app)[method](path)
  .set('Cookie', `yieldflow_session=${encodeURIComponent(sessionToken)}`)
const route = (path) => `${path}?ownerUserId=${ownerUserId}`
const parseBinary = (response, callback) => {
  const chunks = []
  response.on('data', (chunk) => chunks.push(chunk))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
}

const withOriginal = (target, key, replacement) => {
  originals[`${target.modelName || target.constructor?.name || 'object'}:${key}`] = {
    target,
    key,
    value: target[key],
  }
  target[key] = replacement
}

withOriginal(Session, 'findOne', () => chain(() => ({
  _id: 'sandbox-session-id',
  userId: ownerUserId,
  expiresAt: new Date(Date.now() + 60_000),
})))
withOriginal(Session, 'updateOne', async () => ({}))
withOriginal(User, 'findById', () => chain(() => ({
  _id: ownerUserId,
  displayName: 'Synthetic Sandbox Owner',
  email: 'sandbox@example.test',
  systemRole: 'user',
})))
withOriginal(User, 'find', () => chain(() => [{
  _id: ownerUserId,
  displayName: 'Synthetic Sandbox Owner',
  email: 'sandbox@example.test',
}]))
withOriginal(mongoose.model('PortfolioShare'), 'find', () => chain(() => []))
withOriginal(MasterData, 'distinct', async () => [ownerUserId])
withOriginal(Deposit, 'distinct', async () => [ownerUserId])
withOriginal(Deposit, 'find', (query = {}) => chain(() =>
  store.deposits.filter((deposit) =>
    (!query.ownerUserId || deposit.ownerUserId === query.ownerUserId) &&
    (!query.id?.$in || query.id.$in.includes(deposit.id)) &&
    (!query.id || query.id.$in?.includes(deposit.id)) &&
    (!query.isDeleted || deposit.isDeleted !== true),
)))
withOriginal(Deposit, 'deleteMany', async (query) => {
  store.deposits = store.deposits.filter((deposit) => deposit.ownerUserId !== query.ownerUserId)
})
withOriginal(Deposit, 'collection', Deposit.collection)
withOriginal(Deposit.collection, 'insertMany', async (rows) => {
  store.deposits.push(...clone(rows))
})
withOriginal(SalarySaving, 'find', (query = {}) => chain(() =>
  store.salarySavings.filter((saving) => !query.ownerUserId || saving.ownerUserId === query.ownerUserId),
))
withOriginal(SalarySaving, 'deleteMany', async (query) => {
  store.salarySavings = store.salarySavings.filter((saving) => saving.ownerUserId !== query.ownerUserId)
})
withOriginal(SalarySaving.collection, 'insertMany', async (rows) => {
  store.salarySavings.push(...clone(rows))
})
withOriginal(MasterData, 'findOne', () => chain(() => store.masterData))
withOriginal(MasterData, 'findOneAndUpdate', async (_query, update) => {
  store.masterData = clone(update)
  return store.masterData
})
withOriginal(AuditLog, 'create', async () => [])
withOriginal(mongoose, 'startSession', async () => {
  let inTransaction = false
  let beforeTransaction
  return {
    async startTransaction() {
      beforeTransaction = clone(store)
      inTransaction = true
    },
    inTransaction() { return inTransaction },
    async abortTransaction() {
      Object.assign(store, beforeTransaction)
      inTransaction = false
    },
    async commitTransaction() { inTransaction = false },
    async endSession() {},
  }
})

const syntheticInvestment = () => ({
  id: 'sandbox-investment-1',
  ownerUserId,
  srNo: 1,
  bankName: 'Synthetic Bank',
  branchCity: 'Test Branch',
  holderName: 'Sandbox Owner',
  fundingSource: 'Sandbox Owner',
  instrumentType: 'FD',
  calculationFrequency: 'QUARTERLY',
  payoutMode: 'quarterly-fy',
  interestPayoutSchedule: 'prorated-boundaries-v1',
  interestPayoutOverrides: [{ key: 'first', grossAmount: 125, netAmount: 112.5 }],
  accountNumber: 'SYNTH-001',
  principalAmount: 10000,
  interestRate: 7.5,
  investmentDate: '2026-04-01',
  maturityDate: '2027-04-01',
  maturityBeforeTax: 10750,
  maturityAfterTax: 10675,
  totalInterestEarned: 750,
  tdsPercent: 10,
  tdsAmount: 75,
  interestPayoutBeforeTds: 300,
  interestPayoutAfterTds: 270,
  status: 'Open',
  isDeleted: false,
  allocations: [],
  cashSettlements: [],
  createdByUserId: ownerUserId,
  updatedByUserId: ownerUserId,
  createdAt: new Date('2026-04-01T10:00:00.000Z'),
  updatedAt: new Date('2026-04-02T10:00:00.000Z'),
})

const syntheticSalarySaving = () => ({
  id: 'sandbox-salary-1',
  ownerUserId,
  salaryMonth: '2026-04',
  amount: 15000,
  unavailable: [{ id: 'line-unavailable', amount: 1000, reason: 'Emergency fund' }],
  investmentAllocations: [{
    id: 'line-invested',
    investmentId: 'sandbox-investment-1',
    amount: 10000,
  }],
  notes: 'Synthetic sandbox record',
  createdByUserId: ownerUserId,
  updatedByUserId: ownerUserId,
  createdAt: new Date('2026-04-03T10:00:00.000Z'),
  updatedAt: new Date('2026-04-04T10:00:00.000Z'),
})

test('sandbox exports, previews, replaces, and verifies a synthetic portfolio without MongoDB', async () => {
  store.deposits = [syntheticInvestment()]
  store.salarySavings = [syntheticSalarySaving()]
  store.masterData = {
    ownerUserId,
    owners: [{
      id: 'sandbox-owner',
      name: 'Sandbox Owner',
      aliases: [],
      ownerType: 'Individual',
      taxSlabRate: 20,
    }],
    institutions: [{
      id: 'sandbox-bank',
      name: 'Synthetic Bank',
      branches: [{ id: 'sandbox-branch', name: 'Test Branch' }],
    }],
    instrumentTypes: [{ id: 'sandbox-fd', name: 'FD' }],
  }

  const before = clone({
    deposits: store.deposits,
    salarySavings: store.salarySavings,
    masterData: store.masterData,
  })

  const exported = await authenticatedRequest('get', route('/api/data-backup/export'))
    .buffer(true)
    .parse(parseBinary)
    .expect(200)
  assert.ok(Buffer.isBuffer(exported.body), 'export endpoint should return an XLSX buffer')
  assert.match(exported.headers['content-type'], /spreadsheetml\.sheet/)

  const preview = await authenticatedRequest('post', route('/api/data-backup/preview'))
    .set('Origin', 'https://backup-sandbox.example.test')
    .attach('file', exported.body, 'synthetic-backup.xlsx')
    .expect((response) => {
      assert.equal(response.status, 200, JSON.stringify(response.body))
    })
  assert.equal(preview.body.hasErrors, false, preview.body.errors.join('; '))
  assert.equal(preview.body.sourcePortfolioStatus, 'match')
  assert.equal(preview.body.summary.investmentCount, 1)
  assert.equal(preview.body.summary.salarySavingsCount, 1)
  assert.equal(preview.body.summary.preservedExistingSalarySavingsCount, 0)

  store.deposits = [{
    ...syntheticInvestment(),
    id: 'destination-only-investment',
    accountNumber: 'DESTINATION-ONLY',
  }]
  store.salarySavings = [{
    ...syntheticSalarySaving(),
    id: 'destination-only-salary',
    salaryMonth: '2026-05',
  }]
  store.masterData = {
    ownerUserId,
    owners: [],
    institutions: [],
    instrumentTypes: [],
  }

  const restored = await authenticatedRequest('post', route('/api/data-backup/restore'))
    .set('Origin', 'https://backup-sandbox.example.test')
    .field('confirmSourceIdentity', 'true')
    .attach('file', exported.body, 'synthetic-backup.xlsx')
    .expect((response) => {
      assert.equal(response.status, 200, JSON.stringify(response.body))
    })

  assert.equal(restored.body.summary.investmentCount, 1)
  assert.equal(restored.body.summary.salarySavingsCount, 1)
  assert.deepEqual(store.deposits[0].interestPayoutOverrides, before.deposits[0].interestPayoutOverrides)
  assert.equal(store.deposits[0].createdAt.toISOString(), before.deposits[0].createdAt.toISOString())
  assert.deepEqual(store.salarySavings[0].investmentAllocations, before.salarySavings[0].investmentAllocations)
  assert.equal(store.salarySavings[0].createdAt.toISOString(), before.salarySavings[0].createdAt.toISOString())
  assert.deepEqual(store.masterData.owners, before.masterData.owners)
  assert.equal(store.deposits.some((deposit) => deposit.id === 'destination-only-investment'), false)
  assert.equal(store.salarySavings.some((saving) => saving.id === 'destination-only-salary'), false)
})

test('sandbox does not connect to MongoDB or keep test monkey patches installed', async () => {
  assert.equal(mongoose.connection.readyState, 0)

  Object.values(originals).forEach(({ target, key, value }) => {
    target[key] = value
  })
  Object.keys(originals).forEach((key) => delete originals[key])
})
