import crypto from 'node:crypto'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import mongoose from 'mongoose'
import { emptyMasterData, normalizeMasterData } from '../shared/masterData.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.SERVER_PORT || 4000)
const mongoUri = process.env.SERVER_MONGO_URI
const googleClientId = String(process.env.SERVER_GOOGLE_CLIENT_ID || '').trim()
const sessionSecret = String(process.env.SERVER_SESSION_SECRET || '').trim()
const adminEmails = new Set(
  String(process.env.SERVER_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)
const allowedOrigins = Array.from(
  new Set(
    String(process.env.SERVER_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
)
const cookieSameSite = String(process.env.SERVER_COOKIE_SAME_SITE || 'lax')
  .trim()
  .toLowerCase()
const cookieSecure =
  String(process.env.SERVER_COOKIE_SECURE || '').trim().toLowerCase() === 'true'
    ? true
    : String(process.env.SERVER_COOKIE_SECURE || '').trim().toLowerCase() === 'false'
      ? false
      : process.env.NODE_ENV === 'production'

if (!mongoUri) {
  throw new Error('SERVER_MONGO_URI is missing from the environment')
}

if (!googleClientId) {
  throw new Error('SERVER_GOOGLE_CLIENT_ID is missing from the environment')
}

if (!sessionSecret) {
  throw new Error('SERVER_SESSION_SECRET is missing from the environment')
}

const SESSION_COOKIE_NAME = 'yieldflow_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const normalizedCookieSameSite =
  cookieSameSite === 'none'
    ? 'None'
    : cookieSameSite === 'strict'
      ? 'Strict'
      : 'Lax'

const depositSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
  },
  {
    collection: 'investments',
    strict: false,
    versionKey: false,
    timestamps: true,
  },
)

const Deposit = mongoose.model('Deposit', depositSchema)

const masterDataSchema = new mongoose.Schema(
  {
    ownerUserId: { type: String, required: true, unique: true, index: true },
    owners: { type: Array, default: [] },
    institutions: { type: Array, default: [] },
    instrumentTypes: { type: Array, default: [] },
  },
  {
    collection: 'masterData',
    versionKey: false,
    timestamps: true,
  },
)

const MasterData = mongoose.model('MasterData', masterDataSchema)

const yieldflowUserSchema = new mongoose.Schema(
  {
    googleSub: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    photoUrl: { type: String, default: '' },
    systemRole: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
    lastLoginAt: { type: Date, default: null },
  },
  {
    collection: 'users',
    versionKey: false,
    timestamps: true,
  },
)

const YieldflowUser = mongoose.model('YieldflowUser', yieldflowUserSchema)

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    collection: 'sessions',
    versionKey: false,
    timestamps: true,
  },
)

const YieldflowSession = mongoose.model('YieldflowSession', sessionSchema)

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: String, required: true, index: true },
    actorEmail: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetRecordId: { type: String, default: '' },
    targetOwnerUserId: { type: String, default: '', index: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    collection: 'auditLogs',
    versionKey: false,
    timestamps: true,
  },
)

const YieldflowAuditLog = mongoose.model('YieldflowAuditLog', auditLogSchema)

const portfolioShareSchema = new mongoose.Schema(
  {
    ownerUserId: { type: String, required: true, index: true },
    guestUserId: { type: String, required: true, index: true },
    guestEmail: { type: String, required: true, index: true },
    permission: { type: String, default: 'read' },
    status: { type: String, default: 'active', index: true },
  },
  {
    collection: 'portfolioShares',
    versionKey: false,
    timestamps: true,
  },
)

portfolioShareSchema.index({ ownerUserId: 1, guestUserId: 1 }, { unique: true })

const PortfolioShare = mongoose.model('PortfolioShare', portfolioShareSchema)

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
  const uptimeSeconds = Math.floor(process.uptime())
  const databaseName = String(mongoose.connection.name || '').trim()

  return {
    ok: isMongoHealthy,
    status: isMongoHealthy ? 'healthy' : 'degraded',
    service: 'YieldFlow API',
    timestamp: new Date().toISOString(),
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

const getMasterData = async (ownerUserId, { createIfMissing = false } = {}) => {
  const existing = await MasterData.findOne({ ownerUserId }).lean()
  if (existing) {
    return normalizeMasterData(existing)
  }

  if (!createIfMissing) {
    return normalizeMasterData(emptyMasterData)
  }

  const created = await MasterData.create({
    ownerUserId,
    ...emptyMasterData,
  })
  return normalizeMasterData(created.toObject())
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
}) => {
  if (actor?.systemRole !== 'admin') {
    return
  }

  await YieldflowAuditLog.create({
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.systemRole,
    action,
    targetType,
    targetRecordId,
    targetOwnerUserId,
    before,
    after,
    metadata,
  })
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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`CORS origin not allowed: ${origin}`))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(loadSessionUser)

app.get('/api/health', (_request, response) => {
  const payload = buildHealthPayload()
  response.status(payload.ok ? 200 : 503).json(payload)
})

app.get('/api/auth/session', async (request, response) => {
  if (!request.sessionUser) {
    response.json({ authenticated: false })
    return
  }

  response.json(await buildSessionResponse(request.sessionUser))
})

app.post('/api/auth/google', async (request, response) => {
  const googleProfile = await verifyGoogleCredential(request.body?.credential)
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

  const normalizedUser = normalizeUserDoc(upsertedUser.toObject())

  const { token } = await createSession(normalizedUser.id)
  setSessionCookie(response, token)
  response.json(await buildSessionResponse(normalizedUser))
})

app.post('/api/auth/logout', async (request, response) => {
  const sessionToken = parseCookies(request)[SESSION_COOKIE_NAME]
  if (sessionToken) {
    await YieldflowSession.deleteOne({ tokenHash: buildSessionTokenHash(sessionToken) })
  }

  clearSessionCookie(response)
  response.json({ ok: true })
})

app.get('/api/shares', requireAuth, requireUserRole, async (request, response) => {
  const ownerShares = await PortfolioShare.find({
    ownerUserId: request.sessionUser.id,
    status: 'active',
  }).lean()
  const sharedWithMe = await PortfolioShare.find({
    guestUserId: request.sessionUser.id,
    status: 'active',
  }).lean()

  const guestIds = ownerShares.map((share) => share.guestUserId)
  const ownerIds = sharedWithMe.map((share) => share.ownerUserId)
  const relatedUsers = await YieldflowUser.find({ _id: { $in: [...guestIds, ...ownerIds] } }).lean()
  const userLookup = new Map(relatedUsers.map((user) => [String(user._id), normalizeUserDoc(user)]))

  response.json({
    ownerShares: ownerShares.map((share) => {
      const guestUser = userLookup.get(String(share.guestUserId))
      return {
        id: String(share._id),
        ownerUserId: String(share.ownerUserId),
        guestUserId: String(share.guestUserId),
        guestEmail: share.guestEmail,
        guestDisplayName: guestUser?.displayName || share.guestEmail,
        permission: share.permission,
        status: share.status,
      }
    }),
    sharedWithMe: sharedWithMe.map((share) => {
      const ownerUser = userLookup.get(String(share.ownerUserId))
      return {
        id: String(share._id),
        ownerUserId: String(share.ownerUserId),
        ownerDisplayName: ownerUser?.displayName || 'Shared portfolio',
        ownerEmail: ownerUser?.email || '',
        permission: share.permission,
        status: share.status,
      }
    }),
  })
})

app.post('/api/shares', requireAuth, requireUserRole, async (request, response) => {
  const guestEmail = String(request.body?.guestEmail || '').trim().toLowerCase()
  if (!guestEmail) {
    response.status(400).json({ message: 'Guest email is required' })
    return
  }

  if (guestEmail === request.sessionUser.email) {
    response.status(400).json({ message: 'You cannot share a portfolio with yourself' })
    return
  }

  const guestUser = await YieldflowUser.findOne({ email: guestEmail }).lean()
  if (!guestUser) {
    response.status(404).json({ message: 'That Google user has not signed in to YieldFlow yet' })
    return
  }

  const savedShare = await PortfolioShare.findOneAndUpdate(
    {
      ownerUserId: request.sessionUser.id,
      guestUserId: String(guestUser._id),
    },
    {
      $set: {
        guestEmail,
        permission: 'read',
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean()

  response.status(201).json({
    id: String(savedShare._id),
    ownerUserId: String(savedShare.ownerUserId),
    guestUserId: String(savedShare.guestUserId),
    guestEmail: savedShare.guestEmail,
    guestDisplayName: guestUser.displayName || guestEmail,
    permission: savedShare.permission,
    status: savedShare.status,
  })
})

app.delete('/api/shares/:id', requireAuth, requireUserRole, async (request, response) => {
  const deleted = await PortfolioShare.findOneAndDelete({
    _id: request.params.id,
    ownerUserId: request.sessionUser.id,
  }).lean()

  if (!deleted) {
    response.status(404).json({ message: 'Share not found' })
    return
  }

  response.json({ ok: true })
})

app.get('/api/deposits', requireAuth, resolvePortfolioContext, async (request, response) => {
  const deposits = await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
  response.json(deposits.map(normalizeDepositDoc))
})

app.get('/api/master-data', requireAuth, resolvePortfolioContext, async (request, response) => {
  response.json(
    await getMasterData(request.portfolioContext.ownerUserId, {
      createIfMissing: request.portfolioContext.isOwner,
    }),
  )
})

app.put(
  '/api/master-data',
  requireAuth,
  resolvePortfolioContext,
  requirePortfolioWriteAccess,
  async (request, response) => {
    const normalized = normalizeMasterData(request.body || {})
    const previous = await MasterData.findOne({
      ownerUserId: request.portfolioContext.ownerUserId,
    }).lean()
    const updated = await MasterData.findOneAndUpdate(
      { ownerUserId: request.portfolioContext.ownerUserId },
      {
        ownerUserId: request.portfolioContext.ownerUserId,
        ...normalized,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: previous ? 'admin.masterData.update' : 'admin.masterData.create',
      targetType: 'masterData',
      targetRecordId: String(updated._id),
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      before: previous ? normalizeMasterData(previous) : null,
      after: normalizeMasterData(updated),
    })

    response.json(normalizeMasterData(updated))
  },
)

app.post('/api/deposits', requireAuth, resolvePortfolioContext, requirePortfolioWriteAccess, async (request, response) => {
  const created = await Deposit.create({
    ...request.body,
    ownerUserId: request.portfolioContext.ownerUserId,
    createdByUserId: request.sessionUser.id,
    updatedByUserId: request.sessionUser.id,
  })

  await writeAdminAuditLog({
    actor: request.sessionUser,
    action: 'admin.investment.create',
    targetType: 'investment',
    targetRecordId: created.id,
    targetOwnerUserId: request.portfolioContext.ownerUserId,
    after: normalizeDepositDoc(created.toObject()),
  })

  response.status(201).json(normalizeDepositDoc(created.toObject()))
})

app.put('/api/deposits/:id', requireAuth, resolvePortfolioContext, requirePortfolioWriteAccess, async (request, response) => {
  const existing = await Deposit.findOne(
    buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
  ).lean()

  if (!existing) {
    response.status(404).json({ message: 'Deposit not found' })
    return
  }

  const updated = await Deposit.findOneAndUpdate(
    buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
    {
      ...request.body,
      ownerUserId: request.portfolioContext.ownerUserId,
      updatedByUserId: request.sessionUser.id,
    },
    { new: true, upsert: false },
  ).lean()

  await writeAdminAuditLog({
    actor: request.sessionUser,
    action: 'admin.investment.update',
    targetType: 'investment',
    targetRecordId: request.params.id,
    targetOwnerUserId: request.portfolioContext.ownerUserId,
    before: normalizeDepositDoc(existing),
    after: normalizeDepositDoc(updated),
  })

  response.json(normalizeDepositDoc(updated))
})

app.post('/api/deposits/:id/archive', requireAuth, resolvePortfolioContext, requirePortfolioWriteAccess, async (request, response) => {
  const existing = await Deposit.findOne(
    buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
  ).lean()

  if (!existing) {
    response.status(404).json({ message: 'Deposit not found' })
    return
  }

  const normalizedExisting = normalizeDepositDoc(existing)
  if (normalizedExisting.isDeleted) {
    response.json(normalizedExisting)
    return
  }

  const ownerDeposits = (
    await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
  ).map(normalizeDepositDoc)
  const dependents = getArchiveDependents(normalizedExisting, ownerDeposits)

  if (dependents.length > 0) {
    const dependentLabels = dependents
      .map((deposit) => deposit.accountNumber || deposit.bankName || deposit.id)
      .join(', ')

    response.status(409).json({
      message: `Cannot archive this investment because it is still used as a funding source by: ${dependentLabels}`,
      dependents,
    })
    return
  }

  const archived = await Deposit.findOneAndUpdate(
    buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
    {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedByUserId: request.sessionUser.id,
    },
    { new: true, upsert: false },
  ).lean()

  await writeAdminAuditLog({
    actor: request.sessionUser,
    action: 'admin.investment.archive',
    targetType: 'investment',
    targetRecordId: request.params.id,
    targetOwnerUserId: request.portfolioContext.ownerUserId,
    before: normalizedExisting,
    after: normalizeDepositDoc(archived),
  })

  response.json(normalizeDepositDoc(archived))
})

app.delete(
  '/api/deposits/:id',
  requireAuth,
  resolvePortfolioContext,
  requireAdmin,
  async (request, response) => {
    const existing = await Deposit.findOne(
      buildUpdateQuery(request.params.id, request.portfolioContext.ownerUserId),
    ).lean()

    if (!existing) {
      response.status(404).json({ message: 'Deposit not found' })
      return
    }

    const normalizedExisting = normalizeDepositDoc(existing)
    const cleanedChildren = await removeFundingLinksForDeletedDeposit({
      deletedDeposit: normalizedExisting,
      ownerUserId: request.portfolioContext.ownerUserId,
      actor: request.sessionUser,
    })

    await Deposit.deleteOne({
      id: request.params.id,
      ownerUserId: request.portfolioContext.ownerUserId,
    })

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'admin.investment.delete',
      targetType: 'investment',
      targetRecordId: request.params.id,
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      before: normalizedExisting,
      metadata: {
        cleanedFundingLinks: cleanedChildren,
      },
    })

    response.json({ ok: true })
  },
)

app.get(
  '/api/admin/export-data',
  requireAuth,
  resolvePortfolioContext,
  requireAdmin,
  async (request, response) => {
    const deposits = await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
    response.json({
      deposits: deposits.map(normalizeDepositDoc),
    })
  },
)

// Express recognizes error middleware only when all 4 parameters are present.
// eslint-disable-next-line no-unused-vars
app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({
    message: error?.message || 'Unexpected server error',
  })
})

const start = async () => {
  await connectDatabase()
  app.listen(PORT, () => {
    console.log(`FD tracker API listening on http://localhost:${PORT}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
