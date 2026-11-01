import mongoose from 'mongoose'

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

export const Deposit = mongoose.model('Deposit', depositSchema)

// Keep salary savings separate so existing investment documents remain unchanged.
const salarySavingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    salaryMonth: { type: String, required: true },
    amount: { type: Number, required: true },
    unavailable: { type: Array, default: [] },
    investmentAllocations: { type: Array, default: [] },
    notes: { type: String, default: '' },
    createdByUserId: { type: String, default: '' },
    updatedByUserId: { type: String, default: '' },
  },
  { collection: 'salarySavings', versionKey: false, timestamps: true },
)

salarySavingSchema.index({ ownerUserId: 1, salaryMonth: 1 }, { unique: true })

export const SalarySaving = mongoose.model('SalarySaving', salarySavingSchema)

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

export const MasterData = mongoose.model('MasterData', masterDataSchema)

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

export const YieldflowUser = mongoose.model('YieldflowUser', yieldflowUserSchema)

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

export const YieldflowSession = mongoose.model('YieldflowSession', sessionSchema)

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

export const YieldflowAuditLog = mongoose.model('YieldflowAuditLog', auditLogSchema)

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

export const PortfolioShare = mongoose.model('PortfolioShare', portfolioShareSchema)
