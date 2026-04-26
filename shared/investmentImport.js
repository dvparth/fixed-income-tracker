export const INVESTMENT_IMPORT_SHEET_NAME = 'Investments'

export const INVESTMENT_IMPORT_COLUMNS = [
  'Holder',
  'Bank or Issuer',
  'Account or Certificate No',
  'Instrument Type',
  'Principal Amount',
  'Investment Date',
  'Maturity Date',
  'Status',
  'Funding Source',
  'Branch City',
  'Payout Mode',
  'Interest Paid Before TDS',
  'Amount Received Each Payout',
  'Interest Rate %',
  'Amount at Maturity Before TDS',
  'Amount Received at Maturity',
  'Interest Payment Date',
  'Notes',
]

export const INVESTMENT_IMPORT_REQUIRED_COLUMNS = [
  'Holder',
  'Bank or Issuer',
  'Account or Certificate No',
  'Instrument Type',
  'Principal Amount',
  'Investment Date',
  'Maturity Date',
  'Status',
]

export const INVESTMENT_IMPORT_INSTRUCTIONS = [
  ['Field', 'Rule'],
  ['Holder', 'Required. Owner name for the investment.'],
  ['Bank or Issuer', 'Required. Bank, post office, or bond issuer name.'],
  ['Account or Certificate No', 'Required. Must be unique for the same holder/bank/date combination.'],
  ['Instrument Type', 'Required. Existing or new instrument type.'],
  ['Principal Amount', 'Required. Numeric amount invested.'],
  ['Investment Date', 'Required. Excel date or yyyy-mm-dd.'],
  ['Maturity Date', 'Required. Must be on or after Investment Date.'],
  ['Status', 'Required. Open or Closed.'],
  ['Funding Source', 'Optional. Defaults to Holder when blank.'],
  ['Branch City', 'Optional. Branch location or city.'],
  ['Payout Mode', 'Optional. Use on-maturity, quarterly-fy, or yearly-fixed. Blank defaults to on-maturity.'],
  ['Interest Paid Before TDS', 'Optional. Numeric.'],
  ['Amount Received Each Payout', 'Required for periodic payout products such as quarterly-fy or yearly-fixed.'],
  ['Interest Rate %', 'Optional. Numeric percentage.'],
  ['Amount at Maturity Before TDS', 'Optional. Numeric.'],
  ['Amount Received at Maturity', 'Required when Status is Closed.'],
  ['Interest Payment Date', 'Required for yearly-fixed payout mode. Use MM-DD.'],
  ['Notes', 'Optional free text.'],
]

