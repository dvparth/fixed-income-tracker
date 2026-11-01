import crypto from 'node:crypto'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import helmet from 'helmet'
import mongoose from 'mongoose'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { z, ZodError } from 'zod'
import { DEFAULT_DEMO_OWNER_ID, DEMO_PORTFOLIO_LABEL } from '../shared/demoPortfolio.js'
import { generateOwnerWiseFYTaxSummary, parseFinancialYearLabel } from '../shared/fyTaxEngine.js'
import {
  INVESTMENT_IMPORT_REQUIRED_COLUMNS,
  INVESTMENT_IMPORT_SHEET_NAME,
} from '../shared/investmentImport.js'
import { emptyMasterData, normalizeMasterData } from '../shared/masterData.js'
import {
  BACKUP_DEPOSIT_JSON_COLUMN,
  BACKUP_SALARY_SAVINGS_JSON_COLUMN,
  BACKUP_SHEETS,
  BACKUP_TYPE,
  BACKUP_WORKBOOK_VERSION,
  SUPPORTED_BACKUP_WORKBOOK_VERSIONS,
} from '../shared/systemBackup.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerBackupRoutes } from './routes/backup.js'
import { registerInvestmentImportRoutes } from './routes/investmentImport.js'
import { registerInvestmentRoutes } from './routes/investments.js'
import { registerPortfolioRoutes } from './routes/portfolio.js'
import { registerSharingRoutes } from './routes/sharing.js'
import { registerSystemRoutes } from './routes/system.js'
import { createCoreServices } from './services/core.js'
import { createRequestSchemas } from './services/schemas.js'
import { createWorkbookServices } from './services/workbooks.js'
import {
  Deposit,
  MasterData,
  PortfolioShare,
  SalarySaving,
  YieldflowAuditLog,
  YieldflowSession,
  YieldflowUser,
} from './models/index.js'

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

const requestSchemas = createRequestSchemas({ z })
const coreServices = createCoreServices({
  schemas: requestSchemas,
  AUTH_RATE_LIMIT_MAX,
  BACKUP_RESTORE_RATE_LIMIT_MAX,
  CSRF_STRICT_ORIGIN,
  DEMO_RATE_LIMIT_MAX,
  Deposit,
  HEALTH_DETAIL_TOKEN,
  HIGH_RISK_ACTIONS,
  IMPORT_RATE_LIMIT_MAX,
  INVESTMENT_IMPORT_REQUIRED_COLUMNS,
  MasterData,
  PORT,
  PortfolioShare,
  RATE_LIMIT_WINDOW_MS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  SalarySaving,
  WRITE_RATE_LIMIT_MAX,
  YieldflowAuditLog,
  YieldflowSession,
  YieldflowUser,
  adminEmails,
  allowedOrigins,
  cookieSecure,
  crypto,
  emptyMasterData,
  googleClientId,
  ipKeyGenerator,
  isProduction,
  mongoUri,
  mongoose,
  normalizeMasterData,
  normalizedCookieSameSite,
  rateLimit,
  sessionSecret,
  z,
})
const {
  connectDatabase,
  csrfOriginProtection,
  loadSessionUser,
  requestIdMiddleware,
} = coreServices
const normalizeImportDate = coreServices.normalizeImportDate

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

const workbookServices = createWorkbookServices({
  BACKUP_DEPOSIT_JSON_COLUMN,
  BACKUP_PREVIEW_ROW_LIMIT,
  BACKUP_SALARY_SAVINGS_JSON_COLUMN,
  BACKUP_SHEETS,
  BACKUP_TYPE,
  BACKUP_WORKBOOK_VERSION,
  Deposit,
  ExcelJS,
  INVESTMENT_IMPORT_SHEET_NAME,
  SUPPORTED_BACKUP_WORKBOOK_VERSIONS,
  canonicalizeDepositAgainstMasterData: coreServices.canonicalizeDepositAgainstMasterData,
  createMasterId: coreServices.createMasterId,
  depositWriteBodySchema: coreServices.depositWriteBodySchema,
  normalizeDepositDoc: coreServices.normalizeDepositDoc,
  normalizeMasterData,
  normalizeText: coreServices.normalizeText,
  salarySavingBackupSchema: coreServices.salarySavingBackupSchema,
})
const {
  buildBackupWorkbookBuffer,
  parseBackupWorkbook,
  parseImportWorkbook,
  validateBackupSnapshot,
} = workbookServices

const routeDependencies = {
  ...coreServices,
  ...workbookServices,
  DEMO_ENABLED,
  DEMO_OWNER_ID,
  DEMO_PORTFOLIO_LABEL,
  Deposit,
  MasterData,
  PortfolioShare,
  SESSION_COOKIE_NAME,
  SalarySaving,
  YieldflowSession,
  YieldflowUser,
  crypto,
  emptyMasterData,
  generateOwnerWiseFYTaxSummary,
  importUpload,
  mongoose,
  normalizeMasterData,
  parseFinancialYearLabel,
  z,
}

registerSystemRoutes(app, routeDependencies)

registerAuthRoutes(app, routeDependencies)

registerSharingRoutes(app, routeDependencies)

registerInvestmentImportRoutes(app, routeDependencies)

registerPortfolioRoutes(app, routeDependencies)

registerInvestmentRoutes(app, routeDependencies)

registerAdminRoutes(app, routeDependencies)

registerBackupRoutes(app, routeDependencies)

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

export {
  buildBackupWorkbookBuffer,
  normalizeImportDate,
  parseBackupWorkbook,
  parseImportWorkbook,
  validateBackupSnapshot,
}
export default app
