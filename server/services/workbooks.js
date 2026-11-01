export const createWorkbookServices = (dependencies) => {
  const {
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
    canonicalizeDepositAgainstMasterData,
    createMasterId,
    depositWriteBodySchema,
    normalizeDepositDoc,
    normalizeMasterData,
    normalizeText,
    salarySavingBackupSchema
  } = dependencies

  const getWorksheetRows = (worksheet) => {
    const headers = worksheet.getRow(1).values.slice(1).map((value) => String(value ?? '').trim())
    const rows = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }

      const record = {}
      headers.forEach((header, index) => {
        if (!header) {
          return
        }

        let value = row.getCell(index + 1).value
        if (value && typeof value === 'object' && !(value instanceof Date)) {
          if ('result' in value) {
            value = value.result
          } else if ('text' in value) {
            value = value.text
          } else if ('richText' in value) {
            value = value.richText.map((item) => item.text).join('')
          }
        }
        record[header] = value ?? ''
      })

      if (Object.values(record).some((value) => value !== '')) {
        rows.push(record)
      }
    })

    return rows
  }

  const parseImportWorkbook = async (buffer) => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const worksheet = workbook.getWorksheet(INVESTMENT_IMPORT_SHEET_NAME)
    if (!worksheet) {
      throw new Error(`Workbook must contain a sheet named "${INVESTMENT_IMPORT_SHEET_NAME}"`)
    }

    return { worksheet, rows: getWorksheetRows(worksheet) }
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

  const addWorkbookRows = (workbook, sheetName, rows) => {
    const worksheet = workbook.addWorksheet(sheetName)
    const headers = Object.keys(rows[0] || {})
    if (headers.length) {
      worksheet.addRow(headers)
      rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header] ?? '')))
    }
    return worksheet
  }

  const buildBackupWorkbookBuffer = async ({ portfolioLabel, ownerUserId, deposits, masterData, salarySavings = [] }) => {
    const workbook = new ExcelJS.Workbook()
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
      { Field: 'Backup type', Value: BACKUP_TYPE },
      { Field: 'Workbook version', Value: BACKUP_WORKBOOK_VERSION },
      { Field: 'Exported at', Value: exportedAt },
      { Field: 'Portfolio label', Value: portfolioLabel },
      { Field: 'Portfolio owner user ID', Value: ownerUserId },
      { Field: 'Investment count', Value: normalizedDeposits.length },
      { Field: 'Salary savings count', Value: salarySavings.length },
      { Field: 'Owner count', Value: (normalizedMasterData.owners || []).length },
      { Field: 'Institution count', Value: (normalizedMasterData.institutions || []).length },
      {
        Field: 'Branch count',
        Value: (normalizedMasterData.institutions || []).reduce(
          (sum, institution) => sum + (institution.branches || []).length,
          0,
        ),
      },
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

    addWorkbookRows(workbook, BACKUP_SHEETS.metadata, metadataRows)
    addWorkbookRows(workbook, BACKUP_SHEETS.owners, ownerRows)
    addWorkbookRows(workbook, BACKUP_SHEETS.institutions, institutionRows)
    addWorkbookRows(workbook, BACKUP_SHEETS.branches, branchRows)
    addWorkbookRows(workbook, BACKUP_SHEETS.instrumentTypes, instrumentRows)
    addWorkbookRows(workbook, BACKUP_SHEETS.deposits, depositRows)
    addWorkbookRows(workbook, BACKUP_SHEETS.salarySavings, salarySavings.map((saving) => {
        const snapshot = { ...saving }
        delete snapshot._id
        delete snapshot.__v
        return {
          'Salary savings ID': saving.id,
          'Salary month': saving.salaryMonth,
          Amount: saving.amount,
          [BACKUP_SALARY_SAVINGS_JSON_COLUMN]: JSON.stringify(snapshot),
        }
      }))

    return Buffer.from(await workbook.xlsx.writeBuffer())
  }

  const getBackupSheetRows = (workbook, sheetName) => {
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet) {
      throw new Error(`Backup file must contain a sheet named "${sheetName}"`)
    }

    return getWorksheetRows(worksheet)
  }

  const parseDelimitedList = (value) =>
    String(value || '')
      .split('|')
      .map((entry) => entry.trim())
      .filter(Boolean)

  const parseBackupWorkbook = async (buffer) => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const metadataRows = getBackupSheetRows(workbook, BACKUP_SHEETS.metadata)
    const ownerRows = getBackupSheetRows(workbook, BACKUP_SHEETS.owners)
    const institutionRows = getBackupSheetRows(workbook, BACKUP_SHEETS.institutions)
    const branchRows = getBackupSheetRows(workbook, BACKUP_SHEETS.branches)
    const instrumentRows = getBackupSheetRows(workbook, BACKUP_SHEETS.instrumentTypes)
    const depositRows = getBackupSheetRows(workbook, BACKUP_SHEETS.deposits)
    const salarySavingsSheetPresent = Boolean(workbook.getWorksheet(BACKUP_SHEETS.salarySavings))
    const salaryRows = salarySavingsSheetPresent
      ? getWorksheetRows(workbook.getWorksheet(BACKUP_SHEETS.salarySavings))
      : []

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
    const salarySavings = salaryRows.map((row, index) => {
      const payloadText = String(row[BACKUP_SALARY_SAVINGS_JSON_COLUMN] || '').trim()
      if (!payloadText) {
        return { rowNumber: index + 2, parseError: 'Missing full salary savings record data.', payload: null }
      }
      try {
        return { rowNumber: index + 2, parseError: '', payload: JSON.parse(payloadText) }
      } catch (error) {
        return {
          rowNumber: index + 2,
          parseError: `Could not read salary savings record data: ${error.message}`,
          payload: null,
        }
      }
    })

    return {
      metadataRows,
      masterData,
      deposits,
      salarySavings,
      salarySavingsSheetPresent,
      recordCounts: {
        investmentCount: depositRows.length,
        salarySavingsCount: salaryRows.length,
        ownerCount: ownerRows.length,
        institutionCount: institutionRows.length,
        branchCount: branchRows.length,
        instrumentTypeCount: instrumentRows.length,
      },
    }
  }

  const isValidBackupDate = (value) => {
    const date = String(value || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false
    }
    const parsed = new Date(`${date}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  }

  const isValidBackupTimestamp = (value) =>
    value === '' ||
    value === null ||
    value === undefined ||
    (value instanceof Date && Number.isFinite(value.getTime())) ||
    (typeof value === 'string' && Number.isFinite(new Date(value).getTime()))

  const validateBackupSnapshot = ({
    metadataRows = [],
    masterData,
    deposits,
    salarySavings = [],
    salarySavingsSheetPresent = true,
    recordCounts,
    existingSalarySavings = [],
  }) => {
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

    const metadata = new Map()
    metadataRows.forEach((row) => {
      const field = normalizeText(row.Field)
      if (metadata.has(field)) {
        errors.push(`Backup metadata contains duplicate "${String(row.Field || '').trim()}" entries.`)
      }
      metadata.set(field, String(row.Value || '').trim())
    })
    const backupType = metadata.get(normalizeText('Backup type')) || ''
    const backupVersion = metadata.get(normalizeText('Workbook version')) || ''
    const metadataValue = (field) => metadata.get(normalizeText(field))
    const sourcePortfolio = {
      label: metadataValue('Portfolio label') || '',
      ownerUserId: metadataValue('Portfolio owner user ID') || '',
    }
    const isSupportedVersion = SUPPORTED_BACKUP_WORKBOOK_VERSIONS.includes(backupVersion)

    if (normalizeText(backupType) !== normalizeText(BACKUP_TYPE)) {
      errors.push('Backup type is missing or not recognized.')
    }
    if (!backupVersion) {
      errors.push('Backup workbook version is missing.')
    } else if (!isSupportedVersion) {
      errors.push(`Backup version ${backupVersion} is not supported.`)
    }
    if (isSupportedVersion && backupVersion !== '1' && !salarySavingsSheetPresent) {
      errors.push(`Version ${backupVersion} backups must contain a Salary Savings sheet.`)
    }

    const countFields = [
      ['investmentCount', 'Investment count'],
      ['ownerCount', 'Owner count'],
      ['institutionCount', 'Institution count'],
      ['branchCount', 'Branch count'],
      ['instrumentTypeCount', 'Instrument type count'],
      ['salarySavingsCount', 'Salary savings count'],
    ]
    const requiredCountFields = backupVersion !== '1'
      ? countFields
      : countFields.filter(([key]) => key !== 'salarySavingsCount' && key !== 'branchCount')
    if (isSupportedVersion) {
      requiredCountFields.forEach(([, field]) => {
        if (metadataValue(field) === undefined) {
          errors.push(`Backup metadata is missing the "${field}" value.`)
        }
      })
      countFields.forEach(([key, field]) => {
        const value = metadataValue(field)
        if (value === undefined) {
          return
        }
        const expected = Number(value)
        const actual = Number(recordCounts?.[key])
        if (!Number.isInteger(expected) || expected < 0) {
          errors.push(`Backup metadata "${field}" must be a non-negative integer.`)
        } else if (!Number.isInteger(actual) || actual < 0) {
          errors.push(`Could not verify the "${field}" value against the workbook sheets.`)
        } else if (Number.isInteger(actual) && actual !== expected) {
          errors.push(`Backup metadata "${field}" is ${expected}, but the workbook contains ${actual}.`)
        }
      })
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

      if (payload) {
        const parsedPayload = depositWriteBodySchema.safeParse(payload)
        if (!parsedPayload.success) {
          payloadErrors.push(
            `Investment record contains unsupported or invalid fields: ${parsedPayload.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          )
        }
        if (!isValidBackupTimestamp(payload.createdAt) || !isValidBackupTimestamp(payload.updatedAt)) {
          payloadErrors.push('Investment timestamps must be valid date-time values.')
        }
      }

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

    const knownDepositIds = new Set(
      parsedDeposits
        .filter((deposit) => deposit.errors.length === 0 && deposit.payload)
        .map((deposit) => deposit.investment.id)
        .filter(Boolean),
    )

    parsedDeposits.forEach((deposit) => {
      if (!deposit.payload) {
        return
      }

      const referenceErrors = []
      const parentInvestmentId = String(deposit.payload.parentInvestmentId || '').trim()
      if (parentInvestmentId) {
        if (parentInvestmentId === deposit.payload.id) {
          referenceErrors.push('Investment cannot be its own parent.')
        } else if (!knownDepositIds.has(parentInvestmentId)) {
          referenceErrors.push(`Parent investment "${parentInvestmentId}" is not present as a valid investment in this backup.`)
        } else {
          const parent = parsedDeposits.find((entry) => entry.payload?.id === parentInvestmentId)?.payload
          if (String(parent?.status || '').toLowerCase() !== 'closed') {
            referenceErrors.push(`Parent investment "${parentInvestmentId}" must be closed.`)
          }
        }
      }
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

    const parentByInvestment = new Map(
      parsedDeposits
        .filter((entry) => entry.errors.length === 0 && entry.payload?.parentInvestmentId)
        .map((entry) => [entry.payload.id, entry.payload.parentInvestmentId]),
    )
    parsedDeposits.forEach((deposit) => {
      if (deposit.errors.length > 0 || !deposit.payload) return
      const visited = new Set([deposit.payload.id])
      let parentId = parentByInvestment.get(deposit.payload.id)
      while (parentId) {
        if (visited.has(parentId)) {
          const message = 'Investment parent links cannot contain a cycle.'
          const existing = rowErrors.find((entry) => entry.rowNumber === deposit.rowNumber)
          if (existing) existing.messages.push(message)
          else rowErrors.push({ rowNumber: deposit.rowNumber, messages: [message] })
          deposit.errors.push(message)
          break
        }
        visited.add(parentId)
        parentId = parentByInvestment.get(parentId)
      }
    })

    const validDepositsById = new Map(
      parsedDeposits
        .filter((entry) => entry.errors.length === 0 && entry.payload)
        .map((entry) => [entry.payload.id, entry.payload]),
    )
    const salaryEntries = salarySavingsSheetPresent
      ? salarySavings
      : existingSalarySavings.map((payload, index) => ({ rowNumber: index + 2, payload }))
    const preservedExistingSalarySavingsCount = salarySavingsSheetPresent ? 0 : salaryEntries.length
    const warnings = !salarySavingsSheetPresent && backupVersion === '1'
      ? ['This version 1 backup has no Salary Savings sheet. Existing salary savings will be preserved and validated against the restored investments.']
      : []
    const validatedSalarySavings = []
    const salarySavingsErrors = []
    const salarySavingIds = new Set()
    const salaryMonths = new Set()

    salaryEntries.forEach((entry, index) => {
      const rowNumber = Number(entry?.rowNumber) || index + 2
      const payload = entry && Object.prototype.hasOwnProperty.call(entry, 'payload')
        ? entry.payload
        : entry
      const rowMessages = []

      if (entry?.parseError) {
        rowMessages.push(entry.parseError)
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        rowMessages.push('Salary savings record data must be a JSON object.')
      } else {
        const parsedPayload = salarySavingBackupSchema.safeParse(payload)
        if (!parsedPayload.success) {
          rowMessages.push(
            `Salary savings record contains unsupported or invalid fields: ${parsedPayload.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          )
        }
      }

      const id = String(payload?.id || '').trim()
      const salaryMonth = String(payload?.salaryMonth || '').trim()
      const amount = payload?.amount
      const unavailable = payload?.unavailable ?? []
      const investmentAllocations = payload?.investmentAllocations ?? []

      if (!id) {
        rowMessages.push('Salary savings ID is missing.')
      } else if (salarySavingIds.has(id)) {
        rowMessages.push(`Salary savings ID "${id}" appears more than once.`)
      } else {
        salarySavingIds.add(id)
      }

      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(salaryMonth)) {
        rowMessages.push('Salary month must use YYYY-MM format.')
      } else if (salaryMonths.has(salaryMonth)) {
        rowMessages.push(`Salary month "${salaryMonth}" appears more than once.`)
      } else {
        salaryMonths.add(salaryMonth)
      }

      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        rowMessages.push('Salary target must be a positive number.')
      }
      if (!isValidBackupTimestamp(payload?.createdAt) || !isValidBackupTimestamp(payload?.updatedAt)) {
        rowMessages.push('Salary savings timestamps must be valid date-time values.')
      }
      if (!Array.isArray(unavailable)) {
        rowMessages.push('Unavailable amounts must be a list.')
      }
      if (!Array.isArray(investmentAllocations)) {
        rowMessages.push('Investment allocations must be a list.')
      }

      const safeUnavailable = Array.isArray(unavailable) ? unavailable : []
      const safeAllocations = Array.isArray(investmentAllocations) ? investmentAllocations : []
      safeUnavailable.forEach((item) => {
        if (
          !item || typeof item.amount !== 'number' || !Number.isFinite(item.amount) ||
          item.amount <= 0 || !String(item.reason || '').trim()
        ) {
          rowMessages.push('Unavailable amounts need a positive value and reason.')
        }
      })

      safeAllocations.forEach((item) => {
        const investmentId = String(item?.investmentId || '').trim()
        if (!item || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
          rowMessages.push('Investment allocations need a positive amount.')
        }
        if (!investmentId || !validDepositsById.has(investmentId)) {
          rowMessages.push(`Investment "${investmentId || '(missing)'}" is not present as a valid investment in this backup.`)
        } else if (validDepositsById.get(investmentId).isDeleted) {
          rowMessages.push(`Investment "${investmentId}" is archived and cannot be linked to salary savings.`)
        }
      })

      const activeSalaryAllocations = safeAllocations.filter((item) =>
        String(validDepositsById.get(item?.investmentId)?.status || '').toLowerCase() !== 'closed',
      )
      const allocatedAmount = [...safeUnavailable, ...activeSalaryAllocations].reduce(
        (sum, item) => sum + (typeof item?.amount === 'number' ? item.amount : 0),
        0,
      )
      if (typeof amount === 'number' && Number.isFinite(amount) && allocatedAmount > amount + 0.0001) {
        rowMessages.push('Invested and unavailable amounts cannot exceed the monthly savings amount.')
      }

      if (rowMessages.length > 0) {
        salarySavingsErrors.push(`Salary savings row ${rowNumber}: ${rowMessages.join(' ')}`)
      } else {
        validatedSalarySavings.push(payload)
      }
    })

    const linkedByInvestment = new Map()
    validatedSalarySavings.forEach((saving) => {
      ;(saving.investmentAllocations || []).forEach((allocation) => {
        const investmentId = allocation.investmentId
        const link = linkedByInvestment.get(investmentId) || { amount: 0 }
        link.amount += allocation.amount
        linkedByInvestment.set(investmentId, link)
      })
    })
    linkedByInvestment.forEach((link, investmentId) => {
      const investment = validDepositsById.get(investmentId)
      if (investment && link.amount > Number(investment.principalAmount || 0) + 0.0001) {
        salarySavingsErrors.push(
          `Salary savings links for investment "${investmentId}" exceed its principal amount (${link.amount} linked, ${investment.principalAmount} principal).`,
        )
      }
    })
    errors.push(...salarySavingsErrors)

    return {
      hasErrors: errors.length > 0 || rowErrors.length > 0,
      errors,
      rowErrors,
      warnings,
      sourcePortfolio,
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
        salarySavingsCount: validatedSalarySavings.length,
        preservedExistingSalarySavingsCount,
      },
      snapshot: {
        masterData,
        deposits: parsedDeposits.filter((entry) => entry.errors.length === 0).map((entry) => entry.payload),
        salarySavings: validatedSalarySavings,
      },
    }
  }

  const getBackupSourceStatus = (sourcePortfolio, destinationOwnerUserId) => {
    if (!sourcePortfolio?.ownerUserId) {
      return 'unknown'
    }
    return sourcePortfolio.ownerUserId === destinationOwnerUserId ? 'match' : 'different'
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

  return {
    getWorksheetRows,
    parseImportWorkbook,
    mergeMasterDataForImport,
    toBackupDateStamp,
    sanitizeBackupFilenamePart,
    buildBackupFilename,
    roundBackupNumber,
    sanitizeDepositForBackupExport,
    addWorkbookRows,
    buildBackupWorkbookBuffer,
    getBackupSheetRows,
    parseDelimitedList,
    parseBackupWorkbook,
    isValidBackupDate,
    isValidBackupTimestamp,
    validateBackupSnapshot,
    getBackupSourceStatus,
    buildMasterRenameMap,
    buildDeletedMasterItems,
    buildBranchRenameEffects,
    findMasterReferenceViolations,
    toRenameEntries,
    propagateMasterRenames,
    reconcileDepositsWithMasterData,
    buildImportMasterChanges,
  }
}
