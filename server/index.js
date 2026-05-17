import crypto from 'node:crypto'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import helmet from 'helmet'
import mongoose from 'mongoose'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { z, ZodError } from 'zod'
import { DEFAULT_DEMO_OWNER_ID, DEMO_PORTFOLIO_LABEL } from '../shared/demoPortfolio.js'
import { generateOwnerWiseFYTaxSummary, parseFinancialYearLabel } from '../shared/fyTaxEngine.js'
import { INVESTMENT_IMPORT_REQUIRED_COLUMNS, INVESTMENT_IMPORT_SHEET_NAME } from '../shared/investmentImport.js'
import { emptyMasterData, normalizeMasterData } from '../shared/masterData.js'
import { BACKUP_DEPOSIT_JSON_COLUMN, BACKUP_SHEETS, BACKUP_WORKBOOK_VERSION } from '../shared/systemBackup.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.SERVER_PORT || 4000)
const isProduction = process.env.NODE_ENV === 'production'
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
const parsePositiveNumberEnv = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}
const parseBooleanEnv = (value, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'true') {
    return true
  }
  if (normalized === 'false') {
    return false
  }
  return fallback
}

if (isProduction && allowedOrigins.length === 0) {
  throw new Error('SERVER_ALLOWED_ORIGINS is required in production')
}

if (!mongoUri) {
  throw new Error('SERVER_MONGO_URI is missing from the environment')
}

if (!googleClientId) {
  throw new Error('SERVER_GOOGLE_CLIENT_ID is missing from the environment')
}

if (!sessionSecret) {
  throw new Error('SERVER_SESSION_SECRET is missing from the environment')
}

const SESSION_COOKIE_NAME =
  String(process.env.SERVER_SESSION_COOKIE_NAME || '').trim() || 'yieldflow_session'
const SESSION_TTL_MS =
  1000 * 60 * 60 * 24 * parsePositiveNumberEnv(process.env.SERVER_SESSION_TTL_DAYS, 30)
const UPLOAD_MAX_BYTES =
  1024 * 1024 * parsePositiveNumberEnv(process.env.SERVER_UPLOAD_MAX_MB, 5)
const BACKUP_PREVIEW_ROW_LIMIT = Math.floor(
  parsePositiveNumberEnv(process.env.SERVER_BACKUP_PREVIEW_ROW_LIMIT, 8),
)
const RATE_LIMIT_WINDOW_MS = parsePositiveNumberEnv(
  process.env.SERVER_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
)
const AUTH_RATE_LIMIT_MAX = Math.floor(
  parsePositiveNumberEnv(process.env.SERVER_AUTH_RATE_LIMIT_MAX, 20),
)
const WRITE_RATE_LIMIT_MAX = Math.floor(
  parsePositiveNumberEnv(process.env.SERVER_WRITE_RATE_LIMIT_MAX, 120),
)
const IMPORT_RATE_LIMIT_MAX = Math.floor(
  parsePositiveNumberEnv(process.env.SERVER_IMPORT_RATE_LIMIT_MAX, 10),
)
const BACKUP_RESTORE_RATE_LIMIT_MAX = Math.floor(
  parsePositiveNumberEnv(process.env.SERVER_BACKUP_RESTORE_RATE_LIMIT_MAX, 5),
)
const HEALTH_DETAIL_TOKEN = String(process.env.SERVER_HEALTH_DETAIL_TOKEN || '').trim()
const CSRF_STRICT_ORIGIN = parseBooleanEnv(process.env.SERVER_CSRF_STRICT_ORIGIN, true)
const DEMO_ENABLED = parseBooleanEnv(process.env.SERVER_DEMO_ENABLED, !isProduction)
const DEMO_OWNER_ID =
  String(process.env.SERVER_DEMO_OWNER_ID || '').trim() || DEFAULT_DEMO_OWNER_ID
const DEMO_RATE_LIMIT_MAX = Math.floor(
  parsePositiveNumberEnv(process.env.SERVER_DEMO_RATE_LIMIT_MAX, 120),
)
const HIGH_RISK_ACTIONS = new Set([
  'admin.investment.delete',
  'admin.backup.restore',
  'admin.exportData.download',
  'admin.masterData.update',
  'admin.masterData.create',
  'share.create',
  'share.delete',
])
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_MAX_BYTES,
  },
})
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

const optionalTextField = z.union([z.string(), z.literal('')]).optional()
const numericFormField = z.union([z.number(), z.literal('')]).optional()
const booleanField = z.boolean().optional()
const idParamSchema = z.object({ id: z.string().trim().min(1).max(240) }).strict()
const ownerScopedQuerySchema = z.object({
  ownerUserId: z.string().trim().min(1).max(120).optional(),
}).strict()
const taxQuerySchema = ownerScopedQuerySchema.extend({
  fy: z.string().trim().min(1).max(12).optional(),
}).strict()
const importQuerySchema = ownerScopedQuerySchema.extend({
  dryRun: z.enum(['true', 'false']).optional(),
}).strict()
const googleAuthBodySchema = z.object({
  credential: z.string().trim().min(1),
}).strict()
const googleRedirectAuthBodySchema = googleAuthBodySchema.extend({
  g_csrf_token: z.string().trim().min(1).optional(),
}).passthrough()
const shareCreateBodySchema = z.object({
  guestEmail: z.string().trim().email().max(320),
}).strict()
const allocationSchema = z.object({
  eventId: z.string().trim().min(1).max(260),
  amount: z.number().positive(),
}).strict()
const cashSettlementSchema = z.object({
  eventId: z.string().trim().min(1).max(260),
  amount: z.number().positive(),
  settledAt: optionalTextField,
}).strict()
const depositWriteBodySchema = z.object({
  id: z.string().trim().min(1).max(240).optional(),
  srNo: numericFormField,
  bankName: optionalTextField,
  branchCity: optionalTextField,
  holderName: optionalTextField,
  fundingSource: optionalTextField,
  instrumentType: optionalTextField,
  calculationFrequency: optionalTextField,
  payoutMode: optionalTextField,
  yearlyPayoutMonthDay: optionalTextField,
  interestPayoutBeforeTds: numericFormField,
  interestPayoutAfterTds: numericFormField,
  accountNumber: optionalTextField,
  tenureYears: numericFormField,
  tenureMonths: numericFormField,
  tenureDays: numericFormField,
  interestRate: numericFormField,
  principalAmount: numericFormField,
  investmentDate: optionalTextField,
  maturityDate: optionalTextField,
  closureDate: optionalTextField,
  maturityBeforeTax: numericFormField,
  maturityAfterTax: numericFormField,
  totalInterestEarned: numericFormField,
  tdsPercent: numericFormField,
  tdsAmount: numericFormField,
  status: optionalTextField,
  allocations: z.array(allocationSchema).optional(),
  cashSettlements: z.array(cashSettlementSchema).optional(),
  notes: optionalTextField,
  isDeleted: booleanField,
  deletedAt: optionalTextField,
  ownerUserId: optionalTextField,
  createdByUserId: optionalTextField,
  updatedByUserId: optionalTextField,
  createdAt: optionalTextField,
  updatedAt: optionalTextField,
  _id: z.any().optional(),
  __v: z.any().optional(),
}).strict()
const namedMasterItemSchema = z.object({
  id: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1).max(160),
}).strict()
const ownerMasterSchema = namedMasterItemSchema.extend({
  ownerType: z.string().trim().max(80).optional(),
  taxSlabRate: z.number().min(0).max(100).optional(),
  aliases: z.array(z.string().trim().min(1).max(160)).optional(),
}).strict()
const institutionMasterSchema = namedMasterItemSchema.extend({
  branches: z.array(namedMasterItemSchema).optional(),
}).strict()
const masterDataBodySchema = z.object({
  owners: z.array(ownerMasterSchema).optional(),
  institutions: z.array(institutionMasterSchema).optional(),
  instrumentTypes: z.array(namedMasterItemSchema).optional(),
}).strict()

const validateRequest = (schema, source = 'body') => (request, response, next) => {
  const result = schema.safeParse(request[source] || {})
  if (!result.success) {
    response.status(400).json({
      message: 'Request validation failed',
      requestId: request.requestId,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  if (source === 'query') {
    Object.keys(request.query).forEach((key) => {
      delete request.query[key]
    })
    Object.assign(request.query, result.data)
  } else {
    request[source] = result.data
  }
  next()
}

const sanitizeDepositWritePayload = (payload = {}) => {
  const parsed = depositWriteBodySchema.parse(payload)
  const sanitized = { ...parsed }
  delete sanitized.ownerUserId
  delete sanitized.createdByUserId
  delete sanitized.updatedByUserId
  delete sanitized.createdAt
  delete sanitized.updatedAt
  delete sanitized._id
  delete sanitized.__v
  delete sanitized.isDeleted
  delete sanitized.deletedAt
  return sanitized
}

const sanitizeRestoredDepositPayload = (payload = {}) => {
  const sanitized = { ...depositWriteBodySchema.parse(payload) }
  delete sanitized.ownerUserId
  delete sanitized._id
  delete sanitized.__v
  return sanitized
}

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

const normalizeText = (value) => String(value || '').trim().toLowerCase()
const createMasterKey = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item'

const buildMasterNameLookupById = (items = []) =>
  new Map(
    items
      .map((item) => [String(item?.id || '').trim(), String(item?.name || '').trim()])
      .filter(([id, name]) => id && name),
  )

const canonicalizeDepositAgainstMasterData = (deposit, masterData = emptyMasterData) => {
  const ownerLookup = buildMasterNameLookupById(masterData.owners || [])
  const institutionLookup = buildMasterNameLookupById(masterData.institutions || [])
  const instrumentTypeLookup = buildMasterNameLookupById(masterData.instrumentTypes || [])
  const institutionBranchLookup = new Map(
    (masterData.institutions || []).map((institution) => [
      String(institution?.id || '').trim(),
      buildMasterNameLookupById(institution.branches || []),
    ]),
  )

  const holderName = ownerLookup.get(createMasterKey(deposit.holderName)) || deposit.holderName
  const fundingSource =
    ownerLookup.get(createMasterKey(deposit.fundingSource)) || deposit.fundingSource
  const institutionId = createMasterKey(deposit.bankName)
  const bankName = institutionLookup.get(institutionId) || deposit.bankName
  const branchName =
    institutionBranchLookup.get(institutionId)?.get(createMasterKey(deposit.branchCity)) ||
    deposit.branchCity
  const instrumentType =
    instrumentTypeLookup.get(createMasterKey(deposit.instrumentType)) || deposit.instrumentType

  return {
    ...deposit,
    holderName,
    fundingSource,
    bankName,
    branchCity: branchName,
    instrumentType,
  }
}

const createMasterId = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item'

const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return ''
  }

  const normalizedValue =
    typeof value === 'string' ? value.replace(/,/g, '').trim() : value
  const number = Number(normalizedValue)
  return Number.isFinite(number) ? number : ''
}

const toYmd = (date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDateDayCount = (startValue, endValue) => {
  const start = new Date(`${String(startValue || '').trim()}T00:00:00`)
  const end = new Date(`${String(endValue || '').trim()}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0
  }

  return Math.max(Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 0)
}

const getEffectiveMaturityDate = (deposit = {}) =>
  deposit.status === 'Closed' && deposit.closureDate ? deposit.closureDate : deposit.maturityDate

const normalizeImportDate = (value) => {
  if (!value && value !== 0) {
    return ''
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toYmd(value)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) {
      return ''
    }

    const candidate = new Date(parsed.y, parsed.m - 1, parsed.d)
    return Number.isNaN(candidate.getTime()) ? '' : toYmd(candidate)
  }

  const rawValue = String(value || '').trim()
  if (!rawValue) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue
  }

  const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    const candidate = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(candidate.getTime()) ? '' : toYmd(candidate)
  }

  const candidate = new Date(rawValue)
  return Number.isNaN(candidate.getTime()) ? '' : toYmd(candidate)
}

const shiftDateByCalendar = (date, years = 0, months = 0) => {
  const source = new Date(date)
  const sourceDay = source.getDate()
  const targetMonthIndex = source.getMonth() + months
  const targetYear = source.getFullYear() + years + Math.floor(targetMonthIndex / 12)
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
  const maxDay = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate()
  const cappedDay = Math.min(sourceDay, maxDay)

  return new Date(targetYear, normalizedMonthIndex, cappedDay)
}

const deriveTenureParts = (investmentDate, maturityDate) => {
  if (!investmentDate || !maturityDate) {
    return { years: 0, months: 0, days: 0 }
  }

  const start = new Date(`${investmentDate}T00:00:00`)
  const end = new Date(`${maturityDate}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { years: 0, months: 0, days: 0 }
  }

  let years = end.getFullYear() - start.getFullYear()
  while (years > 0 && shiftDateByCalendar(start, years, 0) > end) {
    years -= 1
  }

  const afterYears = shiftDateByCalendar(start, years, 0)
  let months =
    (end.getFullYear() - afterYears.getFullYear()) * 12 +
    (end.getMonth() - afterYears.getMonth())
  while (months > 0 && shiftDateByCalendar(afterYears, 0, months) > end) {
    months -= 1
  }

  const afterMonths = shiftDateByCalendar(afterYears, 0, months)
  const days = Math.max(
    Math.round((end.getTime() - afterMonths.getTime()) / (1000 * 60 * 60 * 24)),
    0,
  )

  return { years, months, days }
}

const computeTdsAmount = (maturityBeforeTax, maturityAfterTax) => {
  const grossAmount = parseNumber(maturityBeforeTax)
  const netAmount = parseNumber(maturityAfterTax)

  if (grossAmount === '' || netAmount === '') {
    return 0
  }

  return Math.max(Number(grossAmount) - Number(netAmount), 0)
}

const computeTdsPercent = (principalAmount, maturityBeforeTax, maturityAfterTax) => {
  const principal = parseNumber(principalAmount)
  const grossAmount = parseNumber(maturityBeforeTax)
  const tdsAmount = computeTdsAmount(maturityBeforeTax, maturityAfterTax)
  const preTdsInterest =
    principal === '' || grossAmount === ''
      ? 0
      : Math.max(Number(grossAmount) - Number(principal), 0)

  if (preTdsInterest <= 0 || tdsAmount <= 0) {
    return 0
  }

  return Number(((tdsAmount / preTdsInterest) * 100).toFixed(2))
}

const parsePayoutMode = (value) => {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return 'on-maturity'
  }

  if (['on-maturity', 'on maturity', 'on maturity only'].includes(normalizedValue)) {
    return 'on-maturity'
  }

  if (['quarterly-fy', 'quarterly', 'quarterly fy'].includes(normalizedValue)) {
    return 'quarterly-fy'
  }

  if (['yearly-fixed', 'yearly fixed', 'yearly on fixed date'].includes(normalizedValue)) {
    return 'yearly-fixed'
  }

  return null
}

const parseStatusValue = (value) => {
  const normalizedValue = normalizeText(value)

  if (normalizedValue === 'open') {
    return 'Open'
  }

  if (normalizedValue === 'closed') {
    return 'Closed'
  }

  return null
}

const getEffectivePayoutMode = ({ payoutMode }) => payoutMode || 'on-maturity'

const normalizeImportRowText = (row, column) => String(row?.[column] || '').trim()

const buildInvestmentIdentityKey = ({
  holderName,
  bankName,
  accountNumber,
  investmentDate,
}) =>
  [
    normalizeText(holderName),
    normalizeText(bankName),
    normalizeText(accountNumber),
    String(investmentDate || '').trim(),
  ].join('|')

const buildTaxEstimationInvestmentInput = (deposit) => {
  const normalizedPayoutMode = String(deposit.payoutMode || '').trim().toLowerCase()
  const effectiveMaturityDate = getEffectiveMaturityDate(deposit)
  const derivedTenureDays =
    !deposit.closureDate && Number.isFinite(Number(deposit.tenureDays)) && Number(deposit.tenureDays) > 0
      ? Number(deposit.tenureDays)
      : getDateDayCount(deposit.investmentDate, effectiveMaturityDate)
  const payoutFrequency =
    normalizedPayoutMode === 'quarterly-fy'
      ? 'QUARTERLY'
      : normalizedPayoutMode === 'yearly-fixed'
        ? 'YEARLY'
        : 'CUMULATIVE'
  const explicitCalculationFrequency = String(deposit.calculationFrequency || '').trim().toUpperCase()
  const shouldPreferQuarterlyCompounding =
    payoutFrequency === 'CUMULATIVE' && derivedTenureDays >= 365
  const calculationFrequency =
    explicitCalculationFrequency && explicitCalculationFrequency !== 'SIMPLE'
      ? explicitCalculationFrequency
      : shouldPreferQuarterlyCompounding
        ? 'QUARTERLY'
        : explicitCalculationFrequency || 'SIMPLE'

  return {
    id: String(deposit.id || ''),
    ownerId: String(deposit.holderName || '').trim(),
    ownerName: String(deposit.holderName || '').trim(),
    ownerType: 'Individual',
    principal: Number(deposit.principalAmount || 0),
    interestRate: Number(deposit.interestRate || 0),
    valueDate: deposit.investmentDate,
    maturityDate: effectiveMaturityDate,
    contractualMaturityDate: deposit.maturityDate,
    closureDate: deposit.closureDate || '',
    status: deposit.status || 'Open',
    maturityBeforeTax: deposit.maturityBeforeTax,
    tenureDays: derivedTenureDays,
    institutionName: String(deposit.bankName || '').trim(),
    investmentType: String(deposit.instrumentType || '').trim(),
    payoutMode: String(deposit.payoutMode || '').trim(),
    accountNumber: String(deposit.accountNumber || '').trim(),
    calculationFrequency,
    payoutFrequency,
    annualRate: Number(deposit.interestRate || 0),
    yearlyPayoutMonthDay: String(deposit.yearlyPayoutMonthDay || '').trim(),
  }
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

  return {
    ok: isMongoHealthy,
    status: isMongoHealthy ? 'healthy' : 'degraded',
    service: 'YieldFlow API',
    timestamp: new Date().toISOString(),
  }
}

const buildDetailedHealthPayload = () => {
  const mongoState = getMongoConnectionState(mongoose.connection.readyState)
  const isMongoHealthy = mongoState === 'connected'
  const databaseName = String(mongoose.connection.name || '').trim()
  const uptimeSeconds = Math.floor(process.uptime())

  return {
    ...buildHealthPayload(),
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

const parseImportWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
  })

  const worksheet = workbook.Sheets[INVESTMENT_IMPORT_SHEET_NAME]
  if (!worksheet) {
    throw new Error(`Workbook must contain a sheet named "${INVESTMENT_IMPORT_SHEET_NAME}"`)
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: true,
  })

  return {
    worksheet,
    rows,
  }
}

const mergeMasterDataForImport = (masterData, additions) => {
  const nextOwners = [...(masterData.owners || [])]
  const ownerLookup = new Set(nextOwners.map((owner) => normalizeText(owner.name)))

  additions.owners.forEach((ownerName) => {
    const normalizedOwnerName = normalizeText(ownerName)
    if (!normalizedOwnerName || ownerLookup.has(normalizedOwnerName)) {
      return
    }

    ownerLookup.add(normalizedOwnerName)
    nextOwners.push({
      id: createMasterId(ownerName),
      name: ownerName,
      aliases: [],
    })
  })

  const nextInstrumentTypes = [...(masterData.instrumentTypes || [])]
  const instrumentLookup = new Set(nextInstrumentTypes.map((item) => normalizeText(item.name)))

  additions.instrumentTypes.forEach((instrumentType) => {
    const normalizedInstrumentType = normalizeText(instrumentType)
    if (!normalizedInstrumentType || instrumentLookup.has(normalizedInstrumentType)) {
      return
    }

    instrumentLookup.add(normalizedInstrumentType)
    nextInstrumentTypes.push({
      id: createMasterId(instrumentType),
      name: instrumentType,
    })
  })

  const institutionMap = new Map(
    (masterData.institutions || []).map((institution) => [
      normalizeText(institution.name),
      {
        ...institution,
        branches: [...(institution.branches || [])],
      },
    ]),
  )

  additions.institutions.forEach((institutionName) => {
    const normalizedInstitutionName = normalizeText(institutionName)
    if (!normalizedInstitutionName || institutionMap.has(normalizedInstitutionName)) {
      return
    }

    institutionMap.set(normalizedInstitutionName, {
      id: createMasterId(institutionName),
      name: institutionName,
      branches: [],
    })
  })

  additions.branches.forEach(({ institutionName, branchName }) => {
    const normalizedInstitutionName = normalizeText(institutionName)
    const normalizedBranchName = normalizeText(branchName)
    if (!normalizedInstitutionName || !normalizedBranchName) {
      return
    }

    const institution =
      institutionMap.get(normalizedInstitutionName) ||
      {
        id: createMasterId(institutionName),
        name: institutionName,
        branches: [],
      }
    const branchLookup = new Set((institution.branches || []).map((branch) => normalizeText(branch.name)))

    if (!branchLookup.has(normalizedBranchName)) {
      institution.branches.push({
        id: createMasterId(branchName),
        name: branchName,
      })
    }

    institutionMap.set(normalizedInstitutionName, institution)
  })

  return normalizeMasterData({
    owners: nextOwners,
    institutions: Array.from(institutionMap.values()),
    instrumentTypes: nextInstrumentTypes,
  })
}

const toBackupDateStamp = (date = new Date()) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}`
}

const sanitizeBackupFilenamePart = (value, fallback = 'portfolio') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

const buildBackupFilename = (portfolioLabel, prefix = 'yieldflow-backup') =>
  `${prefix}-${sanitizeBackupFilenamePart(portfolioLabel)}-${toBackupDateStamp()}.xlsx`

const roundBackupNumber = (value, digits = 2) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return value
  }

  return Number(numeric.toFixed(digits))
}

const sanitizeDepositForBackupExport = (deposit) => ({
  ...deposit,
  interestRate: roundBackupNumber(deposit.interestRate, 2),
  principalAmount: roundBackupNumber(deposit.principalAmount, 2),
  maturityBeforeTax: roundBackupNumber(deposit.maturityBeforeTax, 2),
  maturityAfterTax:
    deposit.maturityAfterTax === '' || deposit.maturityAfterTax === null || deposit.maturityAfterTax === undefined
      ? deposit.maturityAfterTax
      : roundBackupNumber(deposit.maturityAfterTax, 2),
  totalInterestEarned: roundBackupNumber(deposit.totalInterestEarned, 2),
  tdsPercent: roundBackupNumber(deposit.tdsPercent, 2),
  tdsAmount: roundBackupNumber(deposit.tdsAmount, 2),
  interestPayoutBeforeTds:
    deposit.interestPayoutBeforeTds === '' || deposit.interestPayoutBeforeTds === null || deposit.interestPayoutBeforeTds === undefined
      ? deposit.interestPayoutBeforeTds
      : roundBackupNumber(deposit.interestPayoutBeforeTds, 2),
  interestPayoutAfterTds:
    deposit.interestPayoutAfterTds === '' || deposit.interestPayoutAfterTds === null || deposit.interestPayoutAfterTds === undefined
      ? deposit.interestPayoutAfterTds
      : roundBackupNumber(deposit.interestPayoutAfterTds, 2),
  allocations: Array.isArray(deposit.allocations)
    ? deposit.allocations.map((allocation) => ({
        ...allocation,
        amount: roundBackupNumber(allocation.amount, 2),
      }))
    : [],
  cashSettlements: Array.isArray(deposit.cashSettlements)
    ? deposit.cashSettlements.map((settlement) => ({
        ...settlement,
        amount: roundBackupNumber(settlement.amount, 2),
      }))
    : [],
})

const buildBackupWorkbookBuffer = ({ portfolioLabel, ownerUserId, deposits, masterData }) => {
  const workbook = XLSX.utils.book_new()
  const exportedAt = new Date().toISOString()
  const normalizedMasterData = normalizeMasterData(masterData)
  const normalizedDeposits = deposits.map((deposit) => {
    const normalized = normalizeDepositDoc(deposit)
    const snapshot = { ...normalized }
    delete snapshot._id
    delete snapshot.__v
    return sanitizeDepositForBackupExport(snapshot)
  })

  const metadataRows = [
    { Field: 'Backup type', Value: 'YieldFlow full backup' },
    { Field: 'Workbook version', Value: BACKUP_WORKBOOK_VERSION },
    { Field: 'Exported at', Value: exportedAt },
    { Field: 'Portfolio label', Value: portfolioLabel },
    { Field: 'Portfolio owner user ID', Value: ownerUserId },
    { Field: 'Investment count', Value: normalizedDeposits.length },
    { Field: 'Owner count', Value: (normalizedMasterData.owners || []).length },
    { Field: 'Institution count', Value: (normalizedMasterData.institutions || []).length },
    { Field: 'Instrument type count', Value: (normalizedMasterData.instrumentTypes || []).length },
  ]

  const ownerRows = (normalizedMasterData.owners || []).map((owner) => ({
    ID: owner.id,
    Name: owner.name,
    Type: owner.ownerType || '',
    'Tax %': Number(owner.taxSlabRate || 0),
    Aliases: (owner.aliases || []).join(' | '),
  }))

  const institutionRows = (normalizedMasterData.institutions || []).map((institution) => ({
    ID: institution.id,
    Name: institution.name,
  }))

  const branchRows = (normalizedMasterData.institutions || []).flatMap((institution) =>
    (institution.branches || []).map((branch) => ({
      'Institution ID': institution.id,
      Institution: institution.name,
      'Branch ID': branch.id,
      Branch: branch.name,
    })),
  )

  const instrumentRows = (normalizedMasterData.instrumentTypes || []).map((instrumentType) => ({
    ID: instrumentType.id,
    Name: instrumentType.name,
  }))

  const depositRows = normalizedDeposits.map((deposit) => ({
    'Investment ID': deposit.id,
    Holder: deposit.holderName || '',
    'Bank / Issuer': deposit.bankName || '',
    'Account / Certificate': deposit.accountNumber || '',
    Instrument: deposit.instrumentType || '',
    Status: deposit.status || '',
    'Investment Date': deposit.investmentDate || '',
    'Maturity Date': deposit.maturityDate || '',
    'Closure Date': deposit.closureDate || '',
    Principal: Number(deposit.principalAmount || 0),
    'Payout Mode': deposit.payoutMode || '',
    'Calculation Frequency': deposit.calculationFrequency || '',
    'Payout Day': deposit.yearlyPayoutMonthDay || '',
    [BACKUP_DEPOSIT_JSON_COLUMN]: JSON.stringify(deposit),
  }))

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(metadataRows, { skipHeader: false }),
    BACKUP_SHEETS.metadata,
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(ownerRows, { skipHeader: false }),
    BACKUP_SHEETS.owners,
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(institutionRows, { skipHeader: false }),
    BACKUP_SHEETS.institutions,
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(branchRows, { skipHeader: false }),
    BACKUP_SHEETS.branches,
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(instrumentRows, { skipHeader: false }),
    BACKUP_SHEETS.instrumentTypes,
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(depositRows, { skipHeader: false }),
    BACKUP_SHEETS.deposits,
  )

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

const getBackupSheetRows = (workbook, sheetName) => {
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    throw new Error(`Backup file must contain a sheet named "${sheetName}"`)
  }

  return XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
  })
}

const parseDelimitedList = (value) =>
  String(value || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)

const parseBackupWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
  })

  const metadataRows = getBackupSheetRows(workbook, BACKUP_SHEETS.metadata)
  const ownerRows = getBackupSheetRows(workbook, BACKUP_SHEETS.owners)
  const institutionRows = getBackupSheetRows(workbook, BACKUP_SHEETS.institutions)
  const branchRows = getBackupSheetRows(workbook, BACKUP_SHEETS.branches)
  const instrumentRows = getBackupSheetRows(workbook, BACKUP_SHEETS.instrumentTypes)
  const depositRows = getBackupSheetRows(workbook, BACKUP_SHEETS.deposits)

  const institutionsById = new Map(
    institutionRows
      .map((row) => ({
        id: String(row.ID || '').trim(),
        name: String(row.Name || '').trim(),
      }))
      .filter((row) => row.id && row.name)
      .map((row) => [row.id, { ...row, branches: [] }]),
  )

  branchRows.forEach((row) => {
    const institutionId = String(row['Institution ID'] || '').trim()
    const institutionName = String(row.Institution || '').trim()
    const branchId = String(row['Branch ID'] || '').trim()
    const branchName = String(row.Branch || '').trim()

    const institution =
      institutionsById.get(institutionId) ||
      (institutionName
        ? {
            id: institutionId || sanitizeBackupFilenamePart(institutionName, 'institution'),
            name: institutionName,
            branches: [],
          }
        : null)

    if (!institution || !branchName) {
      return
    }

    institution.branches.push({
      id: branchId || sanitizeBackupFilenamePart(branchName, 'branch'),
      name: branchName,
    })
    institutionsById.set(institution.id, institution)
  })

  const masterData = normalizeMasterData({
    owners: ownerRows.map((row) => ({
      id: String(row.ID || '').trim(),
      name: String(row.Name || '').trim(),
      ownerType: String(row.Type || '').trim(),
      taxSlabRate: Number(row['Tax %'] || 0),
      aliases: parseDelimitedList(row.Aliases),
    })),
    institutions: Array.from(institutionsById.values()),
    instrumentTypes: instrumentRows.map((row) => ({
      id: String(row.ID || '').trim(),
      name: String(row.Name || '').trim(),
    })),
  })

  const deposits = depositRows.map((row, index) => {
    const payloadText = String(row[BACKUP_DEPOSIT_JSON_COLUMN] || '').trim()
    let payload = null
    let parseError = ''

    if (!payloadText) {
      parseError = 'Missing full deposit record data.'
    } else {
      try {
        payload = JSON.parse(payloadText)
      } catch (error) {
        parseError = `Could not read deposit record data: ${error.message}`
      }
    }

    return {
      rowNumber: index + 2,
      row,
      payload,
      parseError,
    }
  })

  return {
    metadataRows,
    masterData,
    deposits,
  }
}

const isValidBackupDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())

const validateBackupSnapshot = ({ metadataRows, masterData, deposits }) => {
  const errors = []
  const rowErrors = []
  const ownerNames = new Set((masterData.owners || []).map((owner) => normalizeText(owner.name)).filter(Boolean))
  const institutionNames = new Set(
    (masterData.institutions || []).map((institution) => normalizeText(institution.name)).filter(Boolean),
  )
  const instrumentNames = new Set(
    (masterData.instrumentTypes || []).map((instrumentType) => normalizeText(instrumentType.name)).filter(Boolean),
  )
  const branchLookup = new Map(
    (masterData.institutions || []).map((institution) => [
      normalizeText(institution.name),
      new Set((institution.branches || []).map((branch) => normalizeText(branch.name)).filter(Boolean)),
    ]),
  )

  const versionRow = metadataRows.find(
    (row) => normalizeText(row.Field) === normalizeText('Workbook version'),
  )

  if (versionRow && String(versionRow.Value || '').trim() !== BACKUP_WORKBOOK_VERSION) {
    errors.push(`Backup version ${String(versionRow.Value || '').trim()} is not supported.`)
  }

  const parsedDeposits = []
  const depositIds = new Set()

  deposits.forEach((entry) => {
    const payloadErrors = []
    if (entry.parseError) {
      payloadErrors.push(entry.parseError)
    }

    const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null
    const depositId = String(payload?.id || entry.row?.['Investment ID'] || '').trim()
    const holderName = String(payload?.holderName || entry.row?.Holder || '').trim()
    const fundingSource = String(payload?.fundingSource || '').trim()
    const bankName = String(payload?.bankName || entry.row?.['Bank / Issuer'] || '').trim()
    const branchCity = String(payload?.branchCity || '').trim()
    const instrumentType = String(payload?.instrumentType || entry.row?.Instrument || '').trim()
    const investmentDate = String(payload?.investmentDate || entry.row?.['Investment Date'] || '').trim()
    const maturityDate = String(payload?.maturityDate || entry.row?.['Maturity Date'] || '').trim()
    const closureDate = String(payload?.closureDate || entry.row?.['Closure Date'] || '').trim()
    const principalAmount = Number(payload?.principalAmount || entry.row?.Principal || 0)
    const allocations = Array.isArray(payload?.allocations) ? payload.allocations : []
    const cashSettlements = Array.isArray(payload?.cashSettlements) ? payload.cashSettlements : []

    if (!depositId) {
      payloadErrors.push('Investment ID is missing.')
    } else if (depositIds.has(depositId)) {
      payloadErrors.push(`Investment ID "${depositId}" appears more than once.`)
    } else {
      depositIds.add(depositId)
    }

    if (!holderName) {
      payloadErrors.push('Holder is missing.')
    } else if (!ownerNames.has(normalizeText(holderName))) {
      payloadErrors.push(`Holder "${holderName}" is not present in Owners.`)
    }

    if (fundingSource && !ownerNames.has(normalizeText(fundingSource))) {
      payloadErrors.push(`Funding source "${fundingSource}" is not present in Owners.`)
    }

    if (!bankName) {
      payloadErrors.push('Bank / issuer is missing.')
    } else if (!institutionNames.has(normalizeText(bankName))) {
      payloadErrors.push(`Institution "${bankName}" is not present in Institutions.`)
    }

    if (branchCity) {
      const institutionBranches = branchLookup.get(normalizeText(bankName)) || new Set()
      if (!institutionBranches.has(normalizeText(branchCity))) {
        payloadErrors.push(`Branch "${branchCity}" is not present under institution "${bankName}".`)
      }
    }

    if (!instrumentType) {
      payloadErrors.push('Instrument type is missing.')
    } else if (!instrumentNames.has(normalizeText(instrumentType))) {
      payloadErrors.push(`Instrument type "${instrumentType}" is not present in Instrument types.`)
    }

    if (!isValidBackupDate(investmentDate)) {
      payloadErrors.push('Investment date must be in YYYY-MM-DD format.')
    }

    if (!isValidBackupDate(maturityDate)) {
      payloadErrors.push('Maturity date must be in YYYY-MM-DD format.')
    }

    if (closureDate && !isValidBackupDate(closureDate)) {
      payloadErrors.push('Closure date must be in YYYY-MM-DD format.')
    }

    if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
      payloadErrors.push('Principal must be a positive number.')
    }

    const invalidAllocations = allocations.some(
      (allocation) =>
        !allocation ||
        !String(allocation.eventId || '').trim() ||
        !Number.isFinite(Number(allocation.amount || 0)) ||
        Number(allocation.amount || 0) <= 0,
    )

    if (invalidAllocations) {
      payloadErrors.push('Funding links contain an invalid amount or missing source reference.')
    }

    const invalidCashSettlements = cashSettlements.some(
      (settlement) =>
        !settlement ||
        !String(settlement.eventId || '').trim() ||
        !Number.isFinite(Number(settlement.amount || 0)) ||
        Number(settlement.amount || 0) <= 0,
    )

    if (invalidCashSettlements) {
      payloadErrors.push('Cash status contains an invalid amount or missing source reference.')
    }

    parsedDeposits.push({
      rowNumber: entry.rowNumber,
      investment: {
        id: depositId,
        holderName,
        bankName,
        accountNumber: String(payload?.accountNumber || entry.row?.['Account / Certificate'] || '').trim(),
        instrumentType,
        principalAmount,
        status: String(payload?.status || entry.row?.Status || '').trim() || 'Open',
        investmentDate,
        maturityDate,
        closureDate,
      },
      payload: payload
        ? {
            ...payload,
            id: depositId,
            holderName,
            fundingSource: fundingSource || holderName,
            bankName,
            branchCity,
            instrumentType,
            investmentDate,
            maturityDate,
            closureDate,
            principalAmount,
          }
        : null,
      errors: payloadErrors,
    })

    if (payloadErrors.length > 0) {
      rowErrors.push({
        rowNumber: entry.rowNumber,
        messages: payloadErrors,
      })
    }
  })

  const knownDepositIds = new Set(parsedDeposits.map((deposit) => deposit.investment.id).filter(Boolean))

  parsedDeposits.forEach((deposit) => {
    if (!deposit.payload) {
      return
    }

    const referenceErrors = []
    ;[...(deposit.payload.allocations || []), ...(deposit.payload.cashSettlements || [])].forEach((entry) => {
      const eventId = String(entry?.eventId || '').trim()
      if (!eventId) {
        return
      }

      if (eventId.startsWith('maturity:')) {
        const sourceDepositId = eventId.slice('maturity:'.length)
        if (!knownDepositIds.has(sourceDepositId)) {
          referenceErrors.push(`Funding reference "${eventId}" points to a deposit that is not in this backup.`)
        }
        return
      }

      if (eventId.startsWith('interest:')) {
        const sourceDepositId = eventId.split(':')[1] || ''
        if (!knownDepositIds.has(sourceDepositId)) {
          referenceErrors.push(`Funding reference "${eventId}" points to a deposit that is not in this backup.`)
        }
      }
    })

    if (referenceErrors.length > 0) {
      const existing = rowErrors.find((entry) => entry.rowNumber === deposit.rowNumber)
      if (existing) {
        existing.messages.push(...referenceErrors)
      } else {
        rowErrors.push({
          rowNumber: deposit.rowNumber,
          messages: referenceErrors,
        })
      }
      deposit.errors.push(...referenceErrors)
    }
  })

  return {
    hasErrors: errors.length > 0 || rowErrors.length > 0,
    errors,
    rowErrors,
    parsedRowCount: deposits.length,
    validRowCount: parsedDeposits.filter((entry) => entry.errors.length === 0).length,
    previewRows: parsedDeposits.slice(0, BACKUP_PREVIEW_ROW_LIMIT).map((entry) => ({
      rowNumber: entry.rowNumber,
      investment: entry.investment,
      errors: entry.errors,
    })),
    summary: {
      investmentCount: parsedDeposits.length,
      ownerCount: (masterData.owners || []).length,
      institutionCount: (masterData.institutions || []).length,
      instrumentTypeCount: (masterData.instrumentTypes || []).length,
      branchCount: (masterData.institutions || []).reduce(
        (sum, institution) => sum + (institution.branches || []).length,
        0,
      ),
      archivedInvestmentCount: parsedDeposits.filter(
        (entry) => String(entry.payload?.status || '').trim().toLowerCase() === 'closed' || entry.payload?.isDeleted,
      ).length,
    },
    snapshot: {
      masterData,
      deposits: parsedDeposits.filter((entry) => entry.errors.length === 0).map((entry) => entry.payload),
    },
  }
}

const buildMasterRenameMap = (previousItems = [], nextItems = []) =>
  previousItems.reduce((lookup, previousItem) => {
    const previousId = String(previousItem?.id || '').trim()
    const previousName = String(previousItem?.name || '').trim()
    if (!previousId || !previousName) {
      return lookup
    }

    const nextMatch = nextItems.find((item) => String(item?.id || '').trim() === previousId)
    if (!nextMatch) {
      return lookup
    }

    const nextName = String(nextMatch.name || '').trim()
    if (!nextName || nextName === previousName) {
      return lookup
    }

    lookup[previousName] = nextName
    return lookup
  }, {})

const buildDeletedMasterItems = (previousItems = [], nextItems = []) => {
  const nextIds = new Set(nextItems.map((item) => String(item?.id || '').trim()).filter(Boolean))

  return previousItems.filter((item) => {
    const previousId = String(item?.id || '').trim()
    return previousId && !nextIds.has(previousId)
  })
}

const buildBranchRenameEffects = (previousInstitutions = [], nextInstitutions = []) =>
  previousInstitutions.flatMap((previousInstitution) => {
    const previousInstitutionId = String(previousInstitution?.id || '').trim()
    const previousInstitutionName = String(previousInstitution?.name || '').trim()
    if (!previousInstitutionId || !previousInstitutionName) {
      return []
    }

    const nextInstitution = nextInstitutions.find(
      (institution) => String(institution?.id || '').trim() === previousInstitutionId,
    )
    if (!nextInstitution) {
      return []
    }

    const nextInstitutionName = String(nextInstitution.name || '').trim()
    const nextBranches = nextInstitution.branches || []

    return (previousInstitution.branches || []).flatMap((previousBranch) => {
      const previousBranchId = String(previousBranch?.id || '').trim()
      const previousBranchName = String(previousBranch?.name || '').trim()
      if (!previousBranchId || !previousBranchName) {
        return []
      }

      const nextBranch = nextBranches.find(
        (branch) => String(branch?.id || '').trim() === previousBranchId,
      )
      if (!nextBranch) {
        return []
      }

      const nextBranchName = String(nextBranch.name || '').trim()
      if (
        !nextBranchName ||
        (nextBranchName === previousBranchName && nextInstitutionName === previousInstitutionName)
      ) {
        return []
      }

      return [
        {
          institutionNameFrom: previousInstitutionName,
          institutionNameTo: nextInstitutionName || previousInstitutionName,
          branchNameFrom: previousBranchName,
          branchNameTo: nextBranchName,
        },
      ]
    })
  })

const findMasterReferenceViolations = (deposits, previousMasterData, nextMasterData) => {
  const violations = []

  buildDeletedMasterItems(previousMasterData.instrumentTypes || [], nextMasterData.instrumentTypes || []).forEach(
    (instrumentType) => {
      const name = String(instrumentType.name || '').trim()
      const referencedCount = deposits.filter((deposit) => String(deposit.instrumentType || '').trim() === name).length
      if (referencedCount > 0) {
        violations.push(`Instrument type "${name}" is used by ${referencedCount} investment${referencedCount === 1 ? '' : 's'}.`)
      }
    },
  )

  buildDeletedMasterItems(previousMasterData.owners || [], nextMasterData.owners || []).forEach((owner) => {
    const name = String(owner.name || '').trim()
    const referencedCount = deposits.filter(
      (deposit) =>
        String(deposit.holderName || '').trim() === name ||
        String(deposit.fundingSource || '').trim() === name,
    ).length
    if (referencedCount > 0) {
      violations.push(`Owner "${name}" is used by ${referencedCount} investment${referencedCount === 1 ? '' : 's'}.`)
    }
  })

  buildDeletedMasterItems(previousMasterData.institutions || [], nextMasterData.institutions || []).forEach(
    (institution) => {
      const name = String(institution.name || '').trim()
      const referencedCount = deposits.filter((deposit) => String(deposit.bankName || '').trim() === name).length
      if (referencedCount > 0) {
        violations.push(`Institution "${name}" is used by ${referencedCount} investment${referencedCount === 1 ? '' : 's'}.`)
      }
    },
  )

  ;(previousMasterData.institutions || []).forEach((previousInstitution) => {
    const previousInstitutionId = String(previousInstitution?.id || '').trim()
    const previousInstitutionName = String(previousInstitution?.name || '').trim()
    if (!previousInstitutionId || !previousInstitutionName) {
      return
    }

    const nextInstitution = (nextMasterData.institutions || []).find(
      (institution) => String(institution?.id || '').trim() === previousInstitutionId,
    )
    if (!nextInstitution) {
      return
    }

    buildDeletedMasterItems(previousInstitution.branches || [], nextInstitution.branches || []).forEach((branch) => {
      const branchName = String(branch.name || '').trim()
      const referencedCount = deposits.filter(
        (deposit) =>
          String(deposit.bankName || '').trim() === previousInstitutionName &&
          String(deposit.branchCity || '').trim() === branchName,
      ).length
      if (referencedCount > 0) {
        violations.push(
          `Branch "${branchName}" under "${previousInstitutionName}" is used by ${referencedCount} investment${referencedCount === 1 ? '' : 's'}.`,
        )
      }
    })
  })

  return violations
}

const toRenameEntries = (renameMap = {}) =>
  Object.entries(renameMap).filter(
    ([previousName, nextName]) => previousName && nextName && previousName !== nextName,
  )

const propagateMasterRenames = async (
  ownerUserId,
  {
    ownerRenameMap = {},
    institutionRenameMap = {},
    instrumentTypeRenameMap = {},
    branchRenameEffects = [],
  } = {},
) => {
  const ownerRenameEntries = toRenameEntries(ownerRenameMap)
  const institutionRenameEntries = toRenameEntries(institutionRenameMap)
  const instrumentTypeRenameEntries = toRenameEntries(instrumentTypeRenameMap)
  const normalizedBranchRenames = branchRenameEffects.filter(
    (effect) =>
      effect?.institutionNameFrom &&
      effect?.institutionNameTo &&
      effect?.branchNameFrom &&
      effect?.branchNameTo &&
      (effect.branchNameFrom !== effect.branchNameTo ||
        effect.institutionNameFrom !== effect.institutionNameTo),
  )

  if (
    ownerRenameEntries.length === 0 &&
    institutionRenameEntries.length === 0 &&
    instrumentTypeRenameEntries.length === 0 &&
    normalizedBranchRenames.length === 0
  ) {
    return 0
  }

  const result = await Deposit.bulkWrite(
    [
      ...ownerRenameEntries.flatMap(([previousName, nextName]) => [
        {
          updateMany: {
            filter: {
              ownerUserId,
              isDeleted: { $ne: true },
              holderName: previousName,
            },
            update: {
              $set: {
                holderName: nextName,
              },
            },
          },
        },
        {
          updateMany: {
            filter: {
              ownerUserId,
              isDeleted: { $ne: true },
              fundingSource: previousName,
            },
            update: {
              $set: {
                fundingSource: nextName,
              },
            },
          },
        },
      ]),
      ...institutionRenameEntries.map(([previousName, nextName]) => ({
        updateMany: {
          filter: {
            ownerUserId,
            isDeleted: { $ne: true },
            bankName: previousName,
          },
          update: {
            $set: {
              bankName: nextName,
            },
          },
        },
      })),
      ...instrumentTypeRenameEntries.map(([previousName, nextName]) => ({
        updateMany: {
          filter: {
            ownerUserId,
            isDeleted: { $ne: true },
            instrumentType: previousName,
          },
          update: {
            $set: {
              instrumentType: nextName,
            },
          },
        },
      })),
      ...normalizedBranchRenames.map((effect) => ({
        updateMany: {
          filter: {
            ownerUserId,
            isDeleted: { $ne: true },
            bankName: { $in: [effect.institutionNameFrom, effect.institutionNameTo] },
            branchCity: effect.branchNameFrom,
          },
          update: {
            $set: {
              bankName: effect.institutionNameTo,
              branchCity: effect.branchNameTo,
            },
          },
        },
      })),
    ],
    { ordered: true },
  )

  return Number(result.modifiedCount || 0)
}

const reconcileDepositsWithMasterData = async (ownerUserId, masterData) => {
  const deposits = await Deposit.find({
    ownerUserId,
    isDeleted: { $ne: true },
  }).lean()

  const updates = deposits
    .map((deposit) => {
      const canonical = canonicalizeDepositAgainstMasterData(deposit, masterData)
      const changes = {}

      ;['holderName', 'fundingSource', 'bankName', 'branchCity', 'instrumentType'].forEach(
        (field) => {
          if (String(canonical[field] || '') !== String(deposit[field] || '')) {
            changes[field] = canonical[field]
          }
        },
      )

      return Object.keys(changes).length > 0
        ? {
            updateOne: {
              filter: { _id: deposit._id },
              update: { $set: changes },
            },
          }
        : null
    })
    .filter(Boolean)

  if (updates.length === 0) {
    return 0
  }

  const result = await Deposit.bulkWrite(updates, { ordered: true })
  return Number(result.modifiedCount || 0)
}

const buildImportMasterChanges = (rows, masterData) => {
  const ownerLookup = new Set((masterData.owners || []).map((owner) => normalizeText(owner.name)))
  const instrumentLookup = new Set(
    (masterData.instrumentTypes || []).map((instrumentType) => normalizeText(instrumentType.name)),
  )
  const institutionLookup = new Map(
    (masterData.institutions || []).map((institution) => [
      normalizeText(institution.name),
      new Set((institution.branches || []).map((branch) => normalizeText(branch.name))),
    ]),
  )

  const owners = new Set()
  const instrumentTypes = new Set()
  const institutions = new Set()
  const branchMap = new Map()

  rows.forEach((row) => {
    ;[row.holderName, row.fundingSource].forEach((ownerName) => {
      const normalizedOwnerName = normalizeText(ownerName)
      if (normalizedOwnerName && !ownerLookup.has(normalizedOwnerName)) {
        owners.add(ownerName)
      }
    })

    const normalizedInstrumentType = normalizeText(row.instrumentType)
    if (normalizedInstrumentType && !instrumentLookup.has(normalizedInstrumentType)) {
      instrumentTypes.add(row.instrumentType)
    }

    const normalizedInstitutionName = normalizeText(row.bankName)
    if (normalizedInstitutionName) {
      if (!institutionLookup.has(normalizedInstitutionName)) {
        institutions.add(row.bankName)
      }

      const existingBranches = institutionLookup.get(normalizedInstitutionName) || new Set()
      const normalizedBranchName = normalizeText(row.branchCity)
      if (normalizedBranchName && !existingBranches.has(normalizedBranchName)) {
        const existingValues = branchMap.get(normalizedInstitutionName) || []
        if (!existingValues.some((branchName) => normalizeText(branchName) === normalizedBranchName)) {
          branchMap.set(normalizedInstitutionName, [...existingValues, row.branchCity])
        }
      }
    }
  })

  return {
    owners: Array.from(owners).sort((left, right) => left.localeCompare(right)),
    instrumentTypes: Array.from(instrumentTypes).sort((left, right) => left.localeCompare(right)),
    institutions: Array.from(institutions).sort((left, right) => left.localeCompare(right)),
    branches: Array.from(branchMap.entries())
      .flatMap(([institutionKey, branches]) =>
        branches.map((branchName) => ({
          institutionName:
            rows.find((row) => normalizeText(row.bankName) === institutionKey)?.bankName || institutionKey,
          branchName,
        })),
      ),
  }
}

const validateAndNormalizeImportRows = ({ rows, existingDeposits }) => {
  const missingHeaders = INVESTMENT_IMPORT_REQUIRED_COLUMNS.filter(
    (column) => !rows.every((row) => Object.prototype.hasOwnProperty.call(row, column)),
  )

  if (rows.length === 0) {
    return {
      rows: [],
      errors: ['Workbook does not contain any investment rows.'],
      missingHeaders,
      validRows: [],
    }
  }

  const existingKeys = new Set(existingDeposits.map(buildInvestmentIdentityKey))
  const seenKeys = new Map()
  const results = rows.map((row, index) => {
    const rowNumber = index + 2
    const errors = []

    const holderName = normalizeImportRowText(row, 'Holder')
    const bankName = normalizeImportRowText(row, 'Bank or Issuer')
    const accountNumber = normalizeImportRowText(row, 'Account or Certificate No')
    const instrumentType = normalizeImportRowText(row, 'Instrument Type')
    const principalAmount = parseNumber(row['Principal Amount'])
    const investmentDate = normalizeImportDate(row['Investment Date'])
    const maturityDate = normalizeImportDate(row['Maturity Date'])
    const status = parseStatusValue(row.Status)
    const fundingSource = normalizeImportRowText(row, 'Funding Source') || holderName
    const branchCity = normalizeImportRowText(row, 'Branch City')
    const payoutMode = parsePayoutMode(row['Payout Mode'])
    const yearlyPayoutMonthDay = normalizeImportRowText(row, 'Interest Payment Date')
    const interestPayoutBeforeTds = parseNumber(row['Interest Paid Before TDS'])
    const interestPayoutAfterTds = parseNumber(row['Amount Received Each Payout'])
    const interestRate = parseNumber(row['Interest Rate %'])
    const maturityBeforeTax = parseNumber(row['Amount at Maturity Before TDS'])
    const maturityAfterTax = parseNumber(row['Amount Received at Maturity'])
    const notes = normalizeImportRowText(row, 'Notes')

    if (!holderName) {
      errors.push('Holder is required.')
    }
    if (!bankName) {
      errors.push('Bank or Issuer is required.')
    }
    if (!accountNumber) {
      errors.push('Account or Certificate No is required.')
    }
    if (!instrumentType) {
      errors.push('Instrument Type is required.')
    }
    if (principalAmount === '' || Number(principalAmount) <= 0) {
      errors.push('Principal Amount must be a positive number.')
    }
    if (!investmentDate) {
      errors.push('Investment Date is required and must be a valid date.')
    }
    if (!maturityDate) {
      errors.push('Maturity Date is required and must be a valid date.')
    }
    if (!status) {
      errors.push('Status must be Open or Closed.')
    }
    if (!payoutMode) {
      errors.push('Payout Mode must be on-maturity, quarterly-fy, or yearly-fixed when provided.')
    }

    const effectivePayoutMode = getEffectivePayoutMode({
      instrumentType,
      payoutMode,
    })

    if (
      investmentDate &&
      maturityDate &&
      new Date(`${maturityDate}T00:00:00`) < new Date(`${investmentDate}T00:00:00`)
    ) {
      errors.push('Maturity Date must be on or after Investment Date.')
    }

    if (status === 'Closed' && maturityAfterTax === '') {
      errors.push('Amount Received at Maturity is required when Status is Closed.')
    }

    if (effectivePayoutMode !== 'on-maturity' && interestPayoutAfterTds === '') {
      errors.push('Amount Received Each Payout is required for periodic payout products.')
    }

    if (effectivePayoutMode === 'yearly-fixed' && !/^\d{2}-\d{2}$/.test(yearlyPayoutMonthDay)) {
      errors.push('Interest Payment Date is required for yearly-fixed payout mode and must use MM-DD.')
    }

    const identityKey = buildInvestmentIdentityKey({
      holderName,
      bankName,
      accountNumber,
      investmentDate,
    })

    if (seenKeys.has(identityKey)) {
      errors.push(`This row duplicates row ${seenKeys.get(identityKey)} in the file.`)
    } else if (holderName && bankName && accountNumber && investmentDate) {
      seenKeys.set(identityKey, rowNumber)
    }

    if (existingKeys.has(identityKey)) {
      errors.push('This investment already exists in the selected portfolio.')
    }

    const tenure = deriveTenureParts(investmentDate, maturityDate)
    const tdsAmount = computeTdsAmount(maturityBeforeTax, maturityAfterTax)
    const tdsPercent = computeTdsPercent(principalAmount, maturityBeforeTax, maturityAfterTax)
    const totalInterestEarned =
      maturityAfterTax !== '' && principalAmount !== ''
        ? Math.max(Number(maturityAfterTax) - Number(principalAmount), 0)
        : 0

    return {
      rowNumber,
      source: row,
      errors,
      normalized: {
        holderName,
        bankName,
        accountNumber,
        instrumentType,
        principalAmount,
        investmentDate,
        maturityDate,
        status: status || '',
        fundingSource,
        branchCity,
        payoutMode: payoutMode || '',
        effectivePayoutMode,
        yearlyPayoutMonthDay,
        interestPayoutBeforeTds,
        interestPayoutAfterTds,
        interestRate,
        maturityBeforeTax,
        maturityAfterTax,
        notes,
        tenureYears: tenure.years,
        tenureMonths: tenure.months,
        tenureDays: tenure.days,
        totalInterestEarned,
        tdsAmount,
        tdsPercent,
      },
    }
  })

  return {
    rows: results,
    errors: missingHeaders.map((column) => `Workbook header is missing required column "${column}".`),
    missingHeaders,
    validRows: results.filter((row) => row.errors.length === 0).map((row) => row.normalized),
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

const authenticateGoogleCredential = async (credential) => {
  const googleProfile = await verifyGoogleCredential(credential)
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

  return normalizeUserDoc(upsertedUser.toObject())
}

const getSafeAuthRedirectUrl = (request) => {
  const fallbackOrigin = allowedOrigins[0] || getServerOrigin(request)
  const fallbackUrl = `${fallbackOrigin}/`
  const requestOrigin = getRequestOrigin(request)

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return `${requestOrigin}/`
  }

  const requestedUrl = String(request.query.returnTo || '').trim()

  if (!requestedUrl) {
    return fallbackUrl
  }

  try {
    const parsedUrl = new URL(requestedUrl)
    if (allowedOrigins.includes(parsedUrl.origin) || parsedUrl.origin === getServerOrigin(request)) {
      return parsedUrl.toString()
    }
  } catch {
    return fallbackUrl
  }

  return fallbackUrl
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

const getMasterData = async (ownerUserId, { createIfMissing = false, session } = {}) => {
  const existing = await MasterData.findOne({ ownerUserId }).session(session || null).lean()
  if (existing) {
    return normalizeMasterData(existing)
  }

  if (!createIfMissing) {
    return normalizeMasterData(emptyMasterData)
  }

  const [created] = await MasterData.create(
    [
      {
        ownerUserId,
        ...emptyMasterData,
      },
    ],
    { session },
  )
  return normalizeMasterData(created.toObject())
}

const summarizeAuditValue = (value) => {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      count: value.length,
    }
  }

  if (typeof value === 'object') {
    return {
      type: 'object',
      fields: Object.keys(value).sort(),
    }
  }

  return value
}

const countItems = (value) => (Array.isArray(value) ? value.length : 0)

const sanitizeAuditMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata || null
  }

  return Object.entries(metadata).reduce((safeMetadata, [key, value]) => {
    if (['before', 'after', 'masterData', 'deposits'].includes(key)) {
      safeMetadata[key] = summarizeAuditValue(value)
      return safeMetadata
    }

    if (key === 'createdValues' && value && typeof value === 'object') {
      safeMetadata.createdValueCounts = {
        owners: countItems(value.owners),
        institutions: countItems(value.institutions),
        branches: countItems(value.branches),
        instrumentTypes: countItems(value.instrumentTypes),
      }
      return safeMetadata
    }

    if (key === 'cleanedFundingLinks' && Array.isArray(value)) {
      safeMetadata.cleanedFundingLinkCount = value.length
      return safeMetadata
    }

    safeMetadata[key] = value
    return safeMetadata
  }, {})
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
  session = null,
}) => {
  const isHighRisk = HIGH_RISK_ACTIONS.has(action)
  if (actor?.systemRole !== 'admin' && !isHighRisk) {
    return
  }

  await YieldflowAuditLog.create(
    [
      {
        actorUserId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.systemRole,
        action,
        targetType,
        targetRecordId,
        targetOwnerUserId,
        before: summarizeAuditValue(before),
        after: summarizeAuditValue(after),
        metadata: sanitizeAuditMetadata({
          ...(metadata || {}),
          highRisk: isHighRisk,
        }),
      },
    ],
    session ? { session } : undefined,
  )
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

const getRequestOrigin = (request) => {
  const origin = String(request.headers.origin || '').trim()
  if (origin) {
    return origin
  }

  const referer = String(request.headers.referer || request.headers.referrer || '').trim()
  if (!referer) {
    return ''
  }

  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

const getServerOrigin = (request) => `${request.protocol}://${request.get('host')}`

const isAllowedRequestOrigin = (request, requestOrigin) => {
  if (!requestOrigin) {
    return !isProduction || !CSRF_STRICT_ORIGIN
  }

  if (requestOrigin === getServerOrigin(request)) {
    return true
  }

  return allowedOrigins.includes(requestOrigin)
}

const rejectRequest = (response, status, message, requestId, extra = {}) => {
  response.status(status).json({
    message,
    requestId,
    ...extra,
  })
}

const requestIdMiddleware = (request, response, next) => {
  request.requestId = String(request.headers['x-request-id'] || '').trim() || crypto.randomUUID()
  response.setHeader('X-Request-Id', request.requestId)
  next()
}

const csrfOriginProtection = (request, response, next) => {
  if (!CSRF_STRICT_ORIGIN || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    next()
    return
  }

  if (request.path === '/api/auth/google/redirect') {
    next()
    return
  }

  const requestOrigin = getRequestOrigin(request)
  if (!isAllowedRequestOrigin(request, requestOrigin)) {
    console.warn('Blocked state-changing request with invalid origin', {
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
      origin: requestOrigin || 'missing',
      ip: request.ip,
      userId: request.sessionUser?.id || '',
    })
    rejectRequest(response, 403, 'Request origin is not allowed', request.requestId)
    return
  }

  next()
}

const createSecurityRateLimiter = ({ name, max }) =>
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) =>
      request.sessionUser?.id
        ? `user:${request.sessionUser.id}`
        : `ip:${ipKeyGenerator(request.ip)}`,
    handler: (request, response) => {
      console.warn('Rate limit exceeded', {
        limiter: name,
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        ip: request.ip,
        userId: request.sessionUser?.id || '',
      })
      rejectRequest(response, 429, 'Too many requests. Try again later.', request.requestId)
    },
  })

const authRateLimiter = createSecurityRateLimiter({
  name: 'auth',
  max: AUTH_RATE_LIMIT_MAX,
})
const writeRateLimiter = createSecurityRateLimiter({
  name: 'write',
  max: WRITE_RATE_LIMIT_MAX,
})
const importRateLimiter = createSecurityRateLimiter({
  name: 'import',
  max: IMPORT_RATE_LIMIT_MAX,
})
const backupRestoreRateLimiter = createSecurityRateLimiter({
  name: 'backup-restore',
  max: BACKUP_RESTORE_RATE_LIMIT_MAX,
})
const demoRateLimiter = createSecurityRateLimiter({
  name: 'demo',
  max: DEMO_RATE_LIMIT_MAX,
})

const validateHealthDetailAccess = (request, response, next) => {
  const suppliedToken = String(request.headers['x-health-token'] || request.query.token || '').trim()
  if (
    (HEALTH_DETAIL_TOKEN && suppliedToken === HEALTH_DETAIL_TOKEN) ||
    request.sessionUser?.systemRole === 'admin'
  ) {
    next()
    return
  }

  rejectRequest(response, 404, 'Not found', request.requestId)
}

if (parseBooleanEnv(process.env.SERVER_TRUST_PROXY, false)) {
  app.set('trust proxy', 1)
}

app.use(requestIdMiddleware)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: [
          "'self'",
          'https://accounts.google.com',
          'https://oauth2.googleapis.com',
          'https://www.googleapis.com',
          'https://www.gstatic.com',
          ...allowedOrigins,
        ],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", 'https://accounts.google.com', 'https://www.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
)
app.use(
  cors((request, callback) => {
    callback(null, {
      origin(origin, originCallback) {
        if (!origin) {
          originCallback(null, true)
          return
        }

        if (request.path === '/api/auth/google/redirect') {
          originCallback(null, true)
          return
        }

        if (!isProduction && allowedOrigins.length === 0) {
          originCallback(null, true)
          return
        }

        if (allowedOrigins.includes(origin)) {
          originCallback(null, true)
          return
        }

        originCallback(new Error('CORS origin not allowed'))
      },
      credentials: true,
    })
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(loadSessionUser)
app.use(csrfOriginProtection)

app.get('/api/health', (_request, response) => {
  const payload = buildHealthPayload()
  response.status(payload.ok ? 200 : 503).json(payload)
})

app.get(
  '/api/health/details',
  validateRequest(z.object({ token: z.string().trim().optional() }).strict(), 'query'),
  validateHealthDetailAccess,
  (_request, response) => {
    const payload = buildDetailedHealthPayload()
    response.status(payload.ok ? 200 : 503).json(payload)
  },
)

const requireDemoEnabled = (_request, response, next) => {
  if (!DEMO_ENABLED) {
    response.status(404).json({ message: 'Not found' })
    return
  }

  next()
}

const loadDemoPortfolioSnapshot = async () => {
  const [deposits, masterData] = await Promise.all([
    Deposit.find({ ownerUserId: DEMO_OWNER_ID }).lean(),
    getMasterData(DEMO_OWNER_ID, { createIfMissing: false }),
  ])
  const normalizedMasterData = normalizeMasterData(masterData)
  const normalizedDeposits = deposits.map((deposit) =>
    canonicalizeDepositAgainstMasterData(normalizeDepositDoc(deposit), normalizedMasterData),
  )

  return {
    portfolio: {
      ownerUserId: DEMO_OWNER_ID,
      label: DEMO_PORTFOLIO_LABEL,
      mode: 'demo',
    },
    deposits: normalizedDeposits,
    masterData: normalizedMasterData,
  }
}

app.get('/api/demo/portfolio', demoRateLimiter, requireDemoEnabled, async (_request, response) => {
  response.json(await loadDemoPortfolioSnapshot())
})

app.get(
  '/api/demo/tax-estimation',
  demoRateLimiter,
  requireDemoEnabled,
  validateRequest(z.object({ fy: z.string().trim().min(1).max(12).optional() }).strict(), 'query'),
  async (request, response) => {
    const fy = parseFinancialYearLabel(String(request.query.fy || ''))
    const snapshot = await loadDemoPortfolioSnapshot()
    const activeDemoDeposits = snapshot.deposits.filter((deposit) => !deposit.isDeleted)
    const summary = generateOwnerWiseFYTaxSummary(
      activeDemoDeposits.map((deposit) => buildTaxEstimationInvestmentInput(deposit)),
      fy,
      snapshot.masterData.owners || [],
    )

    response.json(summary)
  },
)

app.get('/api/auth/session', async (request, response) => {
  if (!request.sessionUser) {
    response.json({ authenticated: false })
    return
  }

  response.json(await buildSessionResponse(request.sessionUser))
})

app.post('/api/auth/google', authRateLimiter, validateRequest(googleAuthBodySchema), async (request, response) => {
  const normalizedUser = await authenticateGoogleCredential(request.body?.credential)
  const { token } = await createSession(normalizedUser.id)
  setSessionCookie(response, token)
  response.json(await buildSessionResponse(normalizedUser))
})

app.post(
  '/api/auth/google/redirect',
  authRateLimiter,
  validateRequest(googleRedirectAuthBodySchema),
  async (request, response) => {
    const redirectUrl = getSafeAuthRedirectUrl(request)
    const bodyCsrfToken = String(request.body?.g_csrf_token || '').trim()
    const cookieCsrfToken = String(parseCookies(request).g_csrf_token || '').trim()

    if (!bodyCsrfToken || !cookieCsrfToken || bodyCsrfToken !== cookieCsrfToken) {
      response.redirect(303, redirectUrl)
      return
    }

    const normalizedUser = await authenticateGoogleCredential(request.body?.credential)
    const { token } = await createSession(normalizedUser.id)
    setSessionCookie(response, token)
    response.redirect(303, redirectUrl)
  },
)

app.post('/api/auth/logout', writeRateLimiter, async (request, response) => {
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

app.post('/api/shares', writeRateLimiter, requireAuth, requireUserRole, validateRequest(shareCreateBodySchema), async (request, response) => {
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

  await writeAdminAuditLog({
    actor: request.sessionUser,
    action: 'share.create',
    targetType: 'portfolioShare',
    targetRecordId: String(savedShare._id),
    targetOwnerUserId: request.sessionUser.id,
    metadata: {
      guestUserId: String(guestUser._id),
      permission: 'read',
      status: 'active',
    },
  })

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

app.delete('/api/shares/:id', writeRateLimiter, requireAuth, requireUserRole, validateRequest(idParamSchema, 'params'), async (request, response) => {
  const deleted = await PortfolioShare.findOneAndDelete({
    _id: request.params.id,
    ownerUserId: request.sessionUser.id,
  }).lean()

  if (!deleted) {
    response.status(404).json({ message: 'Share not found' })
    return
  }

  await writeAdminAuditLog({
    actor: request.sessionUser,
    action: 'share.delete',
    targetType: 'portfolioShare',
    targetRecordId: String(deleted._id),
    targetOwnerUserId: request.sessionUser.id,
    metadata: {
      guestUserId: String(deleted.guestUserId),
      permission: deleted.permission,
      status: deleted.status,
    },
  })

  response.json({ ok: true })
})

app.post(
  '/api/investment-import',
  importRateLimiter,
  requireAuth,
  validateRequest(importQuerySchema, 'query'),
  resolvePortfolioContext,
  requirePortfolioWriteAccess,
  importUpload.single('file'),
  async (request, response) => {
    if (!request.file?.buffer) {
      response.status(400).json({ message: 'Upload an .xlsx file in the "file" field.' })
      return
    }

    if (!request.file.originalname?.toLowerCase().endsWith('.xlsx')) {
      response.status(400).json({ message: 'Only .xlsx files are supported.' })
      return
    }

    const dryRun = String(request.query.dryRun || 'true').trim().toLowerCase() !== 'false'
    let rows

    try {
      rows = parseImportWorkbook(request.file.buffer).rows
    } catch (error) {
      response.status(400).json({ message: error.message })
      return
    }
    const existingDeposits = (
      await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
    ).map(normalizeDepositDoc)
    const validation = validateAndNormalizeImportRows({
      rows,
      existingDeposits,
    })
    const masterData = await getMasterData(request.portfolioContext.ownerUserId, {
      createIfMissing: request.portfolioContext.isOwner || request.sessionUser.systemRole === 'admin',
    })
    const masterChanges = buildImportMasterChanges(validation.validRows, masterData)
    const rowErrors = [
      ...validation.errors.map((message) => ({
        rowNumber: null,
        messages: [message],
      })),
      ...validation.rows
        .filter((row) => row.errors.length > 0)
        .map((row) => ({
          rowNumber: row.rowNumber,
          messages: row.errors,
        })),
    ]

    const previewPayload = {
      dryRun,
      parsedRowCount: rows.length,
      validRowCount: validation.validRows.length,
      hasErrors: rowErrors.length > 0,
      rowErrors,
      previewRows: validation.rows.map((row) => ({
        rowNumber: row.rowNumber,
        errors: row.errors,
        investment: row.normalized,
      })),
      masterChanges,
    }

    if (dryRun) {
      response.json(previewPayload)
      return
    }

    if (rowErrors.length > 0) {
      response.status(422).json(previewPayload)
      return
    }

    const highestSrNo = existingDeposits.reduce((max, deposit) => {
      const srNo = Number(deposit.srNo)
      return Number.isFinite(srNo) ? Math.max(max, srNo) : max
    }, 0)

    const session = await mongoose.startSession()

    try {
      let createdCount = 0

      await session.withTransaction(async () => {
        const nextMasterData = mergeMasterDataForImport(masterData, masterChanges)

        await MasterData.findOneAndUpdate(
          { ownerUserId: request.portfolioContext.ownerUserId },
          {
            ownerUserId: request.portfolioContext.ownerUserId,
            ...nextMasterData,
          },
          { new: true, upsert: true, setDefaultsOnInsert: true, session },
        ).lean()

        const investmentDocuments = validation.validRows.map((row, index) => ({
          id: `fd-${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${index}`,
          srNo: highestSrNo + index + 1,
          bankName: row.bankName,
          branchCity: row.branchCity,
          holderName: row.holderName,
          fundingSource: row.fundingSource,
          instrumentType: row.instrumentType,
          payoutMode: row.payoutMode,
          yearlyPayoutMonthDay: row.yearlyPayoutMonthDay,
          interestPayoutBeforeTds: row.interestPayoutBeforeTds,
          interestPayoutAfterTds: row.interestPayoutAfterTds,
          accountNumber: row.accountNumber,
          tenureYears: row.tenureYears,
          tenureMonths: row.tenureMonths,
          tenureDays: row.tenureDays,
          interestRate: row.interestRate,
          principalAmount: row.principalAmount,
          investmentDate: row.investmentDate,
          maturityDate: row.maturityDate,
          maturityBeforeTax: row.maturityBeforeTax,
          maturityAfterTax: row.maturityAfterTax,
          totalInterestEarned: row.totalInterestEarned,
          tdsPercent: row.tdsPercent,
          tdsAmount: row.tdsAmount,
          status: row.status,
          allocations: [],
          notes: row.notes,
          ownerUserId: request.portfolioContext.ownerUserId,
          createdByUserId: request.sessionUser.id,
          updatedByUserId: request.sessionUser.id,
          isDeleted: false,
        }))

        const created = await Deposit.create(investmentDocuments, { session, ordered: true })
        createdCount = created.length

        if (request.sessionUser.systemRole === 'admin') {
          await writeAdminAuditLog({
            actor: request.sessionUser,
            action: 'admin.masterData.bulkCreate',
            targetType: 'masterData',
            targetRecordId: request.portfolioContext.ownerUserId,
            targetOwnerUserId: request.portfolioContext.ownerUserId,
            after: nextMasterData,
            metadata: {
              createdValues: masterChanges,
            },
            session,
          })

          await writeAdminAuditLog({
            actor: request.sessionUser,
            action: 'admin.investment.bulkImport',
            targetType: 'investment',
            targetRecordId: '',
            targetOwnerUserId: request.portfolioContext.ownerUserId,
            metadata: {
              importedCount: created.length,
              createdValues: masterChanges,
              fileName: request.file.originalname,
            },
            session,
          })
        }
      })

      response.json({
        importedCount: createdCount,
        masterChanges,
        message: `${createdCount} investments imported successfully.`,
      })
    } finally {
      await session.endSession()
    }
  },
)

app.get('/api/deposits', requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
  const [deposits, masterData] = await Promise.all([
    Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
    getMasterData(request.portfolioContext.ownerUserId, {
      createIfMissing: request.portfolioContext.isOwner,
    }),
  ])
  response.json(
    deposits.map((deposit) =>
      canonicalizeDepositAgainstMasterData(normalizeDepositDoc(deposit), masterData),
    ),
  )
})

app.get('/api/master-data', requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
  response.json(
    await getMasterData(request.portfolioContext.ownerUserId, {
      createIfMissing: request.portfolioContext.isOwner,
    }),
  )
})

app.get('/api/tax-estimation', requireAuth, validateRequest(taxQuerySchema, 'query'), resolvePortfolioContext, async (request, response) => {
  const fy = parseFinancialYearLabel(String(request.query.fy || ''))
  const [deposits, masterData] = await Promise.all([
    Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId, isDeleted: { $ne: true } }).lean(),
    getMasterData(request.portfolioContext.ownerUserId, {
      createIfMissing: request.portfolioContext.isOwner,
    }),
  ])

  const summary = generateOwnerWiseFYTaxSummary(
    deposits.map((deposit) => buildTaxEstimationInvestmentInput(normalizeDepositDoc(deposit))),
    fy,
    masterData.owners || [],
  )

  response.json(summary)
})

app.put(
  '/api/master-data',
  writeRateLimiter,
  requireAuth,
  validateRequest(ownerScopedQuerySchema, 'query'),
  resolvePortfolioContext,
  requirePortfolioWriteAccess,
  validateRequest(masterDataBodySchema),
  async (request, response) => {
    const normalized = normalizeMasterData(request.body || {})
    const previous = await MasterData.findOne({
      ownerUserId: request.portfolioContext.ownerUserId,
    }).lean()
    const previousNormalized = previous ? normalizeMasterData(previous) : emptyMasterData
    const deposits = await Deposit.find({
      ownerUserId: request.portfolioContext.ownerUserId,
      isDeleted: { $ne: true },
    }).lean()
    const referenceViolations = findMasterReferenceViolations(
      deposits,
      previousNormalized,
      normalized,
    )

    if (referenceViolations.length > 0) {
      response.status(400).json({
        error: `Cannot delete referenced master data. ${referenceViolations.join(' ')}`,
      })
      return
    }

    const ownerRenameMap = buildMasterRenameMap(previousNormalized.owners || [], normalized.owners || [])
    const institutionRenameMap = buildMasterRenameMap(
      previousNormalized.institutions || [],
      normalized.institutions || [],
    )
    const instrumentTypeRenameMap = buildMasterRenameMap(
      previousNormalized.instrumentTypes || [],
      normalized.instrumentTypes || [],
    )
    const branchRenameEffects = buildBranchRenameEffects(
      previousNormalized.institutions || [],
      normalized.institutions || [],
    )
    const updated = await MasterData.findOneAndUpdate(
      { ownerUserId: request.portfolioContext.ownerUserId },
      {
        ownerUserId: request.portfolioContext.ownerUserId,
        ...normalized,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()
    const updatedNormalized = normalizeMasterData(updated)
    const renamedDepositCount = await propagateMasterRenames(
      request.portfolioContext.ownerUserId,
      {
        ownerRenameMap,
        institutionRenameMap,
        instrumentTypeRenameMap,
        branchRenameEffects,
      },
    )
    const reconciledDepositCount = await reconcileDepositsWithMasterData(
      request.portfolioContext.ownerUserId,
      updatedNormalized,
    )

    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: previous ? 'admin.masterData.update' : 'admin.masterData.create',
      targetType: 'masterData',
      targetRecordId: String(updated._id),
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      before: previous ? previousNormalized : null,
      after: updatedNormalized,
      metadata:
        renamedDepositCount > 0 || reconciledDepositCount > 0
          ? {
              renamedDepositCount,
              reconciledDepositCount,
              ownerRenameMap,
              institutionRenameMap,
              instrumentTypeRenameMap,
              branchRenameEffects,
            }
          : undefined,
    })

    response.json({
      ...updatedNormalized,
      renameEffects: {
        owners: ownerRenameMap,
        institutions: institutionRenameMap,
        instrumentTypes: instrumentTypeRenameMap,
        branches: branchRenameEffects,
        renamedDepositCount,
        reconciledDepositCount,
      },
    })
  },
)

app.post('/api/deposits', writeRateLimiter, requireAuth, validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(depositWriteBodySchema), async (request, response) => {
  const depositPayload = sanitizeDepositWritePayload(request.body)
  const created = await Deposit.create({
    ...depositPayload,
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

app.put('/api/deposits/:id', writeRateLimiter, requireAuth, validateRequest(idParamSchema, 'params'), validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, validateRequest(depositWriteBodySchema), async (request, response) => {
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
      ...sanitizeDepositWritePayload(request.body),
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

app.post('/api/deposits/:id/archive', writeRateLimiter, requireAuth, validateRequest(idParamSchema, 'params'), validateRequest(ownerScopedQuerySchema, 'query'), resolvePortfolioContext, requirePortfolioWriteAccess, async (request, response) => {
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
  backupRestoreRateLimiter,
  requireAuth,
  validateRequest(idParamSchema, 'params'),
  validateRequest(ownerScopedQuerySchema, 'query'),
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
  validateRequest(ownerScopedQuerySchema, 'query'),
  resolvePortfolioContext,
  requireAdmin,
  async (request, response) => {
    const deposits = await Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean()
    await writeAdminAuditLog({
      actor: request.sessionUser,
      action: 'admin.exportData.download',
      targetType: 'portfolioExport',
      targetRecordId: request.portfolioContext.ownerUserId,
      targetOwnerUserId: request.portfolioContext.ownerUserId,
      metadata: {
        depositCount: deposits.length,
      },
    })
    response.json({
      deposits: deposits.map(normalizeDepositDoc),
    })
  },
)

app.get(
  '/api/data-backup/export',
  requireAuth,
  validateRequest(ownerScopedQuerySchema, 'query'),
  resolvePortfolioContext,
  requirePortfolioWriteAccess,
  async (request, response) => {
    const [deposits, masterData] = await Promise.all([
      Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
      getMasterData(request.portfolioContext.ownerUserId, { createIfMissing: true }),
    ])

    const workbookBuffer = buildBackupWorkbookBuffer({
      portfolioLabel: request.portfolioContext.ownerDisplayName || 'portfolio',
      ownerUserId: request.portfolioContext.ownerUserId,
      deposits,
      masterData,
    })

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${buildBackupFilename(request.portfolioContext.ownerDisplayName || 'portfolio')}"`,
    )
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response.send(workbookBuffer)
  },
)

app.post(
  '/api/data-backup/preview',
  importRateLimiter,
  requireAuth,
  validateRequest(ownerScopedQuerySchema, 'query'),
  resolvePortfolioContext,
  requirePortfolioWriteAccess,
  importUpload.single('file'),
  async (request, response) => {
    if (!request.file) {
      response.status(400).json({ message: 'Choose a backup file first.' })
      return
    }

    if (!request.file.originalname?.toLowerCase().endsWith('.xlsx')) {
      response.status(400).json({ message: 'Only .xlsx backup files are supported.' })
      return
    }

    try {
      const parsed = parseBackupWorkbook(request.file.buffer)
      const validation = validateBackupSnapshot(parsed)
      response.json({
        fileName: request.file.originalname,
        ...validation,
      })
    } catch (error) {
      response.status(400).json({
        message: error.message,
      })
    }
  },
)

app.post(
  '/api/data-backup/restore',
  backupRestoreRateLimiter,
  requireAuth,
  validateRequest(ownerScopedQuerySchema, 'query'),
  resolvePortfolioContext,
  requirePortfolioWriteAccess,
  importUpload.single('file'),
  async (request, response) => {
    if (!request.file) {
      response.status(400).json({ message: 'Choose a backup file first.' })
      return
    }

    if (!request.file.originalname?.toLowerCase().endsWith('.xlsx')) {
      response.status(400).json({ message: 'Only .xlsx backup files are supported.' })
      return
    }

    let validation
    try {
      validation = validateBackupSnapshot(parseBackupWorkbook(request.file.buffer))
    } catch (error) {
      response.status(400).json({
        message: error.message,
      })
      return
    }

    if (validation.hasErrors) {
      response.status(400).json({
        message: 'Backup file has validation issues. Review the preview before restoring.',
        ...validation,
      })
      return
    }

    const currentState = await Promise.all([
      Deposit.find({ ownerUserId: request.portfolioContext.ownerUserId }).lean(),
      getMasterData(request.portfolioContext.ownerUserId, { createIfMissing: true }),
    ])

    const previousDeposits = currentState[0].map(normalizeDepositDoc)
    const previousMasterData = normalizeMasterData(currentState[1])
    const session = await mongoose.startSession()

    try {
      await session.startTransaction()

      await Deposit.deleteMany({ ownerUserId: request.portfolioContext.ownerUserId }, { session })

      const restoredDeposits = validation.snapshot.deposits.map((deposit) => {
        const snapshot = sanitizeRestoredDepositPayload(deposit)

        return {
          ...snapshot,
          ownerUserId: request.portfolioContext.ownerUserId,
          createdByUserId: String(snapshot.createdByUserId || request.sessionUser.id),
          updatedByUserId: String(snapshot.updatedByUserId || request.sessionUser.id),
        }
      })

      if (restoredDeposits.length > 0) {
        await Deposit.collection.insertMany(restoredDeposits, { session })
      }

      await MasterData.findOneAndUpdate(
        { ownerUserId: request.portfolioContext.ownerUserId },
        {
          ownerUserId: request.portfolioContext.ownerUserId,
          ...validation.snapshot.masterData,
        },
        {
          session,
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )

      await writeAdminAuditLog({
        actor: request.sessionUser,
        action: 'admin.backup.restore',
        targetType: 'portfolioBackup',
        targetRecordId: request.portfolioContext.ownerUserId,
        targetOwnerUserId: request.portfolioContext.ownerUserId,
        before: {
          depositCount: previousDeposits.length,
          masterData: previousMasterData,
        },
        after: {
          depositCount: restoredDeposits.length,
          masterData: validation.snapshot.masterData,
        },
        metadata: {
          fileName: request.file.originalname,
          summary: validation.summary,
        },
        session,
      })

      await session.commitTransaction()
    } finally {
      await session.endSession()
    }

    response.json({
      message: 'Backup restored successfully.',
      summary: validation.summary,
    })
  },
)

// Express recognizes error middleware only when all 4 parameters are present.
// eslint-disable-next-line no-unused-vars
app.use((error, request, response, _next) => {
  const requestId = request.requestId || crypto.randomUUID()
  const isValidationError = error instanceof ZodError
  const isCorsError = error?.message === 'CORS origin not allowed'
  const statusCode = isValidationError ? 400 : isCorsError ? 403 : Number(error?.statusCode || 500)
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500

  console.error('Request failed', {
    requestId,
    method: request.method,
    path: request.originalUrl,
    statusCode: safeStatusCode,
    message: error?.message,
    stack: error?.stack,
  })

  if (isValidationError) {
    response.status(400).json({
      message: 'Request validation failed',
      requestId,
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  response.status(safeStatusCode).json({
    message: safeStatusCode === 403 ? 'Request is not allowed' : 'Unexpected server error',
    requestId,
  })
})

const start = async () => {
  await connectDatabase()
  app.listen(PORT, () => {
    console.log(`FD tracker API listening on http://localhost:${PORT}`)
  })
}

if (process.env.NODE_ENV !== 'test' && process.env.SERVER_DISABLE_START !== 'true') {
  start().catch((error) => {
    console.error('Failed to start server', error)
    process.exit(1)
  })
}

export default app
