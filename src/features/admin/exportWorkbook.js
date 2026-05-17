import {
  TODAY,
  formatTenure,
  generateInterestEvents,
  getEffectivePayoutMode,
  getFundingAllocations,
  getMaturitySourceEventId,
  getPayoutModeLabel,
  getPostTdsAmount,
} from '../deposits/depositModel.js'

const escapeXml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const normalizeCell = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { type: 'Number', value: value }
  }

  if (typeof value === 'boolean') {
    return { type: 'String', value: value ? 'Yes' : 'No' }
  }

  return { type: 'String', value: value ?? '' }
}

const buildRowXml = (row) =>
  `<Row>${row
    .map((cell) => {
      const normalized = normalizeCell(cell)
      return `<Cell><Data ss:Type="${normalized.type}">${escapeXml(normalized.value)}</Data></Cell>`
    })
    .join('')}</Row>`

const buildWorksheetXml = (name, rows) =>
  `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows.map(buildRowXml).join('')}</Table></Worksheet>`

const toCompactDateStamp = (date = new Date()) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}${month}${day}`
}

const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const buildAllocationMap = (deposits) => {
  const map = new Map()

  deposits.forEach((deposit) => {
    getFundingAllocations(deposit).forEach((allocation) => {
      const eventId = allocation.eventId
      const current = map.get(eventId) ?? []
      map.set(eventId, [...current, { deposit, amount: Number(allocation.amount || 0) }])
    })
  })

  return map
}

const buildInvestmentExportRows = ({ deposits, allocationMap }) => {
  const header = [
    'Sr No',
    'Investment ID',
    'Status',
    'Holder',
    'Funded By',
    'Bank / Issuer',
    'Branch',
    'Account / Certificate',
    'Instrument Type',
    'Payout Mode Code',
    'Payout Mode',
    'Investment Date',
    'Maturity Date',
    'Closure Date',
    'Tenure (Display)',
    'Tenure Years',
    'Tenure Months',
    'Tenure Days',
    'Interest Rate %',
    'Principal Amount',
    'Maturity Before TDS',
    'Amount Received At Maturity',
    'Total Interest Earned',
    'TDS Amount',
    'TDS %',
    'Periodic Interest Before TDS',
    'Periodic Interest After TDS',
    'Yearly Payout MM-DD',
    'Funding Allocation Count',
    'Linked Funding Amount',
    'Funding Allocation Details',
    'Post-TDS Maturity Pool',
    'Maturity Reinvested',
    'Maturity Still Free',
    'Interest Event Count',
    'Interest Received Till Date',
    'Interest Reinvested',
    'Interest Not Reused',
    'Interest Expected In Future',
    'Notes',
    'Created At',
    'Updated At',
  ]

  const body = deposits.map((deposit) => {
    const allocations = getFundingAllocations(deposit)
    const linkedFundingAmount = allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
    const postTdsMaturityAmount = getPostTdsAmount(deposit)
    const maturityAllocations = allocationMap.get(getMaturitySourceEventId(deposit.id)) ?? []
    const maturityReinvested = maturityAllocations.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    const maturityStillFree =
      postTdsMaturityAmount === null ? '' : Math.max(Number(postTdsMaturityAmount || 0) - maturityReinvested, 0)

    const interestEvents = generateInterestEvents(deposit)
    const dueInterestEvents = interestEvents.filter((event) => new Date(event.date) <= TODAY)
    const futureInterestEvents = interestEvents.filter((event) => new Date(event.date) > TODAY)
    const interestReceivedTillDate = dueInterestEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0)
    const interestReinvested = dueInterestEvents.reduce((sum, event) => {
      const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
        (childSum, entry) => childSum + Number(entry.amount || 0),
        0,
      )
      return sum + Math.min(allocated, Number(event.amount || 0))
    }, 0)
    const interestNotReused = dueInterestEvents.reduce((sum, event) => {
      const allocated = (allocationMap.get(event.eventId) ?? []).reduce(
        (childSum, entry) => childSum + Number(entry.amount || 0),
        0,
      )
      return sum + Math.max(Number(event.amount || 0) - allocated, 0)
    }, 0)
    const interestExpectedInFuture = futureInterestEvents.reduce(
      (sum, event) => sum + Number(event.amount || 0),
      0,
    )

    return [
      Number(deposit.srNo || 0),
      deposit.id,
      deposit.status,
      deposit.holderName,
      deposit.fundingSource,
      deposit.bankName,
      deposit.branchCity,
      deposit.accountNumber,
      deposit.instrumentType,
      getEffectivePayoutMode(deposit),
      getPayoutModeLabel(deposit),
      deposit.investmentDate,
      deposit.maturityDate,
      deposit.closureDate || '',
      formatTenure(deposit),
      Number(deposit.tenureYears || 0),
      Number(deposit.tenureMonths || 0),
      Number(deposit.tenureDays || 0),
      Number(deposit.interestRate || 0),
      Number(deposit.principalAmount || 0),
      Number(deposit.maturityBeforeTax || 0),
      deposit.maturityAfterTax === '' || deposit.maturityAfterTax === null || deposit.maturityAfterTax === undefined
        ? ''
        : Number(deposit.maturityAfterTax),
      Number(deposit.totalInterestEarned || 0),
      Number(deposit.tdsAmount || 0),
      Number(deposit.tdsPercent || 0),
      deposit.interestPayoutBeforeTds === '' || deposit.interestPayoutBeforeTds === null || deposit.interestPayoutBeforeTds === undefined
        ? ''
        : Number(deposit.interestPayoutBeforeTds),
      deposit.interestPayoutAfterTds === '' || deposit.interestPayoutAfterTds === null || deposit.interestPayoutAfterTds === undefined
        ? ''
        : Number(deposit.interestPayoutAfterTds),
      deposit.yearlyPayoutMonthDay || '',
      allocations.length,
      linkedFundingAmount,
      allocations.map((allocation) => `${allocation.eventId}=${allocation.amount}`).join(' | '),
      postTdsMaturityAmount === null ? '' : Number(postTdsMaturityAmount),
      maturityReinvested,
      maturityStillFree,
      interestEvents.length,
      interestReceivedTillDate,
      interestReinvested,
      interestNotReused,
      interestExpectedInFuture,
      deposit.notes || '',
      deposit.createdAt || '',
      deposit.updatedAt || '',
    ]
  })

  return [header, ...body]
}

const buildSummaryRows = (deposits) => {
  const totalCount = deposits.length
  const openCount = deposits.filter((deposit) => deposit.status === 'Open').length
  const closedCount = deposits.filter((deposit) => deposit.status === 'Closed').length
  const totalPrincipal = deposits.reduce((sum, deposit) => sum + Number(deposit.principalAmount || 0), 0)
  const totalMaturityBeforeTds = deposits.reduce((sum, deposit) => sum + Number(deposit.maturityBeforeTax || 0), 0)
  const totalMaturityAfterTds = deposits.reduce((sum, deposit) => {
    const value = deposit.maturityAfterTax
    return value === '' || value === null || value === undefined ? sum : sum + Number(value)
  }, 0)
  const totalInterestEarned = deposits.reduce((sum, deposit) => sum + Number(deposit.totalInterestEarned || 0), 0)
  const totalTdsAmount = deposits.reduce((sum, deposit) => sum + Number(deposit.tdsAmount || 0), 0)

  return [
    ['Exported At', new Date().toISOString()],
    ['Investment Count', totalCount],
    ['Open Investments', openCount],
    ['Closed Investments', closedCount],
    ['Total Principal', totalPrincipal],
    ['Total Maturity Before TDS', totalMaturityBeforeTds],
    ['Total Amount Received At Maturity', totalMaturityAfterTds],
    ['Total Interest Earned', totalInterestEarned],
    ['Total TDS Amount', totalTdsAmount],
  ]
}

export const downloadInvestmentsWorkbook = ({ deposits }) => {
  const allocationMap = buildAllocationMap(deposits)
  const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  ${buildWorksheetXml('Investments', buildInvestmentExportRows({ deposits, allocationMap }))}
  ${buildWorksheetXml('Summary', buildSummaryRows(deposits))}
</Workbook>`

  const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  downloadBlob(`yieldflow-investments-${toCompactDateStamp()}.xls`, blob)
}
