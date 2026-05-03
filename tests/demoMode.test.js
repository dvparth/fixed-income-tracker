import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import mongoose from 'mongoose'
import request from 'supertest'
import { DEFAULT_DEMO_OWNER_ID, buildDemoPortfolioSnapshot } from '../shared/demoPortfolio.js'

process.env.NODE_ENV = 'production'
process.env.SERVER_DISABLE_START = 'true'
process.env.SERVER_MONGO_URI = process.env.SERVER_MONGO_URI || 'mongodb://localhost:27017/YieldFlowTest'
process.env.SERVER_GOOGLE_CLIENT_ID =
  process.env.SERVER_GOOGLE_CLIENT_ID || 'test-client.apps.googleusercontent.com'
process.env.SERVER_SESSION_SECRET = process.env.SERVER_SESSION_SECRET || 'test-session-secret'
process.env.SERVER_ALLOWED_ORIGINS = 'https://app.example.test'
process.env.SERVER_DEMO_ENABLED = 'true'
process.env.SERVER_DEMO_OWNER_ID = DEFAULT_DEMO_OWNER_ID
process.env.SERVER_DEMO_RATE_LIMIT_MAX = '3'
process.env.SERVER_RATE_LIMIT_WINDOW_MS = '60000'

const { default: app } = await import('../server/index.js')
const demoSnapshot = buildDemoPortfolioSnapshot(DEFAULT_DEMO_OWNER_ID)
const Deposit = mongoose.model('Deposit')
const MasterData = mongoose.model('MasterData')

Deposit.find = () => ({
  lean: async () => demoSnapshot.deposits,
})

MasterData.findOne = () => ({
  session: () => ({
    lean: async () => demoSnapshot.masterData,
  }),
})

test('demo seed data uses one owner id and valid funding references', () => {
  const depositIds = new Set(demoSnapshot.deposits.map((deposit) => deposit.id))

  assert.ok(demoSnapshot.deposits.every((deposit) => deposit.ownerUserId === DEFAULT_DEMO_OWNER_ID))

  demoSnapshot.deposits.forEach((deposit) => {
    ;(deposit.allocations || []).forEach((allocation) => {
      const eventId = String(allocation.eventId || '')
      const referencedDepositId = eventId.startsWith('maturity:')
        ? eventId.slice('maturity:'.length)
        : eventId.startsWith('interest:')
          ? eventId.slice('interest:'.length).split(':')[0]
          : ''

      assert.ok(
        depositIds.has(referencedDepositId),
        `Funding reference ${eventId} should point to a seeded demo deposit`,
      )
    })
  })
})

test('demo portfolio is public and returns only demo portfolio data', async () => {
  const response = await request(app).get('/api/demo/portfolio').expect(200)

  assert.equal(response.body.portfolio.label, 'YieldFlow Demo Portfolio')
  assert.equal(response.body.portfolio.ownerUserId, DEFAULT_DEMO_OWNER_ID)
  assert.ok(response.body.deposits.length >= 10)
  assert.ok(response.body.masterData.owners.length >= 4)
  assert.equal(response.body.authenticated, undefined)
  assert.equal(response.body.user, undefined)
  assert.equal(response.body.sessions, undefined)
  assert.equal(response.body.shares, undefined)
  assert.equal(response.body.auditLogs, undefined)
  assert.equal(response.body.database, undefined)
})

test('demo tax estimation is public and uses demo data', async () => {
  const response = await request(app).get('/api/demo/tax-estimation?fy=2025-26').expect(200)

  assert.equal(response.body.fy, '2025-26')
  assert.ok(response.body.ownerWiseSummary.length > 0)
  assert.ok(response.body.consolidatedPortfolioSummary.totalEstimatedTaxableInterest > 0)
})

test('demo endpoint returns generic rate-limit response', async () => {
  await request(app).get('/api/demo/portfolio').expect(200)
  const response = await request(app).get('/api/demo/portfolio').expect(429)

  assert.equal(response.body.message, 'Too many requests. Try again later.')
  assert.equal(typeof response.body.requestId, 'string')
})

test('demo endpoints are hidden when demo mode is disabled', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "const request = (await import('supertest')).default; const app = (await import('./server/index.js')).default; const response = await request(app).get('/api/demo/portfolio'); console.log(response.statusCode);"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SERVER_DISABLE_START: 'true',
        SERVER_DEMO_ENABLED: 'false',
        SERVER_ALLOWED_ORIGINS: 'https://app.example.test',
        SERVER_MONGO_URI: 'mongodb://localhost:27017/YieldFlowTest',
        SERVER_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        SERVER_SESSION_SECRET: 'test-session-secret',
      },
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0)
  assert.match(result.stdout, /404/)
})
