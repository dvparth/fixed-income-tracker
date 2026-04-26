import * as XLSX from 'xlsx'
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

export const downloadInvestmentImportTemplate = () => {
  const workbook = XLSX.utils.book_new()
  const investmentsSheet = XLSX.utils.aoa_to_sheet([
    INVESTMENT_IMPORT_COLUMNS,
    SAMPLE_IMPORT_ROW,
  ])
  const instructionsSheet = XLSX.utils.aoa_to_sheet(INVESTMENT_IMPORT_INSTRUCTIONS)

  XLSX.utils.book_append_sheet(workbook, investmentsSheet, INVESTMENT_IMPORT_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')
  XLSX.writeFileXLSX(workbook, 'yieldflow-investment-import-template.xlsx')
}
