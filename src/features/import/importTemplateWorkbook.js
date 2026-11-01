import {
  INVESTMENT_IMPORT_COLUMNS,
  INVESTMENT_IMPORT_INSTRUCTIONS,
  INVESTMENT_IMPORT_SHEET_NAME,
} from '../../../shared/investmentImport.js'

const SAMPLE_IMPORT_ROW = [
  'Parth Dave',
  'State Bank of India',
  'SBI-FD-1001',
  'FD',
  100000,
  '2026-04-01',
  '2027-04-01',
  'Open',
  'Parth Dave',
  'Ahmedabad',
  'on-maturity',
  '',
  '',
  7.1,
  107100,
  '',
  '',
  'Sample row. Replace with your real investment values.',
]

export const downloadInvestmentImportTemplate = async () => {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const investmentsSheet = workbook.addWorksheet(INVESTMENT_IMPORT_SHEET_NAME)
  investmentsSheet.addRows([
    INVESTMENT_IMPORT_COLUMNS,
    SAMPLE_IMPORT_ROW,
  ])
  const instructionsSheet = workbook.addWorksheet('Instructions')
  instructionsSheet.addRows(INVESTMENT_IMPORT_INSTRUCTIONS)

  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'yieldflow-investment-import-template.xlsx'
  link.click()
  URL.revokeObjectURL(url)
}
