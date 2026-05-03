import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import request from 'supertest'

process.env.NODE_ENV = 'production'
process.env.SERVER_DISABLE_START = 'true'
process.env.SERVER_MONGO_URI = process.env.SERVER_MONGO_URI || 'mongodb://localhost:27017/YieldFlowTest'
process.env.SERVER_GOOGLE_CLIENT_ID =
  process.env.SERVER_GOOGLE_CLIENT_ID || 'test-client.apps.googleusercontent.com'
process.env.SERVER_SESSION_SECRET = process.env.SERVER_SESSION_SECRET || 'test-session-secret'
process.env.SERVER_ALLOWED_ORIGINS = 'https://app.example.test'
process.env.SERVER_CSRF_STRICT_ORIGIN = 'true'
process.env.SERVER_AUTH_RATE_LIMIT_MAX = '1'
process.env.SERVER_RATE_LIMIT_WINDOW_MS = '60000'
process.env.SERVER_HEALTH_DETAIL_TOKEN = 'health-token'

const { default: app } = await import('../server/index.js')
const allowedOrigin = 'https://app.example.test'

test('public health response exposes only minimal service status', async () => {
  const response = await request(app).get('/api/health').expect((result) => {
    assert.ok([200, 503].includes(result.status))
  })

  assert.equal(response.body.service, 'YieldFlow API')
  assert.equal(typeof response.body.ok, 'boolean')
  assert.equal(typeof response.body.timestamp, 'string')
  assert.equal(response.body.database, undefined)
  assert.equal(response.body.auth, undefined)
  assert.equal(response.body.collections, undefined)
  assert.equal(response.body.environment, undefined)
})

test('detailed health is hidden without admin session or detail token', async () => {
  await request(app).get('/api/health/details').expect(404)
})

test('detailed health can be accessed with configured health token', async () => {
  const response = await request(app)
    .get('/api/health/details?token=health-token')
    .expect((result) => {
      assert.ok([200, 503].includes(result.status))
    })

  assert.equal(response.body.database?.name, 'unavailable')
  assert.equal(response.body.collections?.investments, 'investments')
})

test('state-changing requests reject missing origin metadata in production', async () => {
  const response = await request(app).post('/api/auth/logout').expect(403)
  assert.equal(response.body.message, 'Request origin is not allowed')
  assert.equal(typeof response.body.requestId, 'string')
})

test('state-changing requests reject untrusted origin metadata', async () => {
  await request(app)
    .post('/api/auth/logout')
    .set('Origin', 'https://evil.example.test')
    .expect(403)
})

test('state-changing requests allow configured origins', async () => {
  await request(app)
    .post('/api/auth/logout')
    .set('Origin', allowedOrigin)
    .expect(200)
})

test('strict schema validation denies unknown auth body fields', async () => {
  const response = await request(app)
    .post('/api/auth/google')
    .set('Origin', allowedOrigin)
    .send({
      credential: 'fake-token',
      ownerUserId: 'attacker-controlled',
    })
    .expect(400)

  assert.equal(response.body.message, 'Request validation failed')
  assert.equal(response.body.issues[0].path, '')
})

test('auth endpoint is rate limited with a generic response', async () => {
  const response = await request(app)
    .post('/api/auth/google')
    .set('Origin', allowedOrigin)
    .send({ credential: 'fake-token' })
    .expect(429)

  assert.equal(response.body.message, 'Too many requests. Try again later.')
  assert.equal(typeof response.body.requestId, 'string')
})

test('production startup fails when SERVER_ALLOWED_ORIGINS is missing', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "await import('./server/index.js')"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SERVER_DISABLE_START: 'true',
        SERVER_ALLOWED_ORIGINS: '',
        SERVER_MONGO_URI: 'mongodb://localhost:27017/YieldFlowTest',
        SERVER_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        SERVER_SESSION_SECRET: 'test-session-secret',
      },
      encoding: 'utf8',
    },
  )

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /SERVER_ALLOWED_ORIGINS is required/)
})
