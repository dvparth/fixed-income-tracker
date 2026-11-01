export const createRequestSchemas = ({ z }) => {
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
  
  const salaryUnavailableSchema = z.object({
      id: z.string().trim().min(1).max(120).optional(),
      amount: z.number().positive(),
      reason: z.string().trim().min(1).max(240),
    }).strict()
  
  const salaryInvestmentAllocationSchema = z.object({
      id: z.string().trim().min(1).max(120).optional(),
      investmentId: z.string().trim().min(1).max(240),
      amount: z.number().positive(),
    }).strict()
  
  const salarySavingBodySchema = z.object({
      salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      amount: z.number().positive(),
      unavailable: z.array(salaryUnavailableSchema).optional(),
      investmentAllocations: z.array(salaryInvestmentAllocationSchema).optional(),
      notes: optionalTextField,
    }).strict()
  
  const backupTimestampField = z.union([z.string(), z.date()]).optional()
  
  const salarySavingBackupSchema = salarySavingBodySchema.extend({
      id: z.string().trim().min(1).max(240),
      ownerUserId: optionalTextField,
      createdByUserId: optionalTextField,
      updatedByUserId: optionalTextField,
      createdAt: backupTimestampField,
      updatedAt: backupTimestampField,
      _id: z.any().optional(),
      __v: z.any().optional(),
    }).strict()
  
  const cashSettlementSchema = z.object({
      eventId: z.string().trim().min(1).max(260),
      amount: z.number().positive(),
      settledAt: optionalTextField,
    }).strict()
  
  const interestPayoutOverrideSchema = z.object({
      key: z.enum(['first', 'final']),
      grossAmount: numericFormField.optional(),
      netAmount: numericFormField.optional(),
    }).strict()
  
  const depositWriteBodySchema = z.object({
      id: z.string().trim().min(1).max(240).optional(),
      parentInvestmentId: optionalTextField,
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
      interestPayoutSchedule: optionalTextField,
      interestPayoutOverrides: z.array(interestPayoutOverrideSchema).optional(),
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
      createdAt: backupTimestampField,
      updatedAt: backupTimestampField,
      _id: z.any().optional(),
      __v: z.any().optional(),
    }).strict()
  
  const investmentRenewalAllocationSchema = z.object({
      salarySavingId: z.string().trim().min(1).max(240),
      amount: z.number().nonnegative(),
    }).strict()
  
  const investmentRenewalBodySchema = z.object({
      closedInvestment: depositWriteBodySchema,
      successorInvestment: depositWriteBodySchema,
      salaryAllocations: z.array(investmentRenewalAllocationSchema).optional(),
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

  return {
    optionalTextField,
    numericFormField,
    booleanField,
    idParamSchema,
    ownerScopedQuerySchema,
    taxQuerySchema,
    importQuerySchema,
    googleAuthBodySchema,
    googleRedirectAuthBodySchema,
    shareCreateBodySchema,
    allocationSchema,
    salaryUnavailableSchema,
    salaryInvestmentAllocationSchema,
    salarySavingBodySchema,
    backupTimestampField,
    salarySavingBackupSchema,
    cashSettlementSchema,
    interestPayoutOverrideSchema,
    depositWriteBodySchema,
    investmentRenewalAllocationSchema,
    investmentRenewalBodySchema,
    namedMasterItemSchema,
    ownerMasterSchema,
    institutionMasterSchema,
    masterDataBodySchema,
    validateRequest,
    sanitizeDepositWritePayload,
    sanitizeRestoredDepositPayload,
  }
}
