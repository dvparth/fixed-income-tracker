export const filterSavingsByFinancialYear = (savings, financialYear) => {
  const startYear = Number(String(financialYear || '').split('-')[0])
  if (!Number.isFinite(startYear)) return savings
  return savings.filter((item) => {
    const [year, month] = String(item.salaryMonth || '').split('-').map(Number)
    return year === startYear ? month >= 4 : year === startYear + 1 && month <= 3
  })
}

export const summarizeSavings = (savings) => savings.reduce((totals, item) => ({
  savings: totals.savings + Number(item.amount || 0),
  invested: totals.invested + Number(item.investedAmount || 0),
  unavailable: totals.unavailable + Number(item.unavailableAmount || 0),
  remaining: totals.remaining + Number(item.remainingAmount || 0),
}), { savings: 0, invested: 0, unavailable: 0, remaining: 0 })

export const summarizeInvestmentSalaryFunding = (savings, editingId, principalAmount) => {
  const amount = Number(principalAmount || 0)
  if (!editingId) return { total: 0, outsideAmount: amount, links: [] }

  const links = savings.flatMap((saving) =>
    (saving.investmentAllocations || [])
      .filter((link) => link.investmentId === editingId)
      .map((link) => ({ salaryMonth: saving.salaryMonth, amount: Number(link.amount || 0) })),
  )
  const total = links.reduce((sum, link) => sum + link.amount, 0)
  return { total, outsideAmount: Math.max(amount - total, 0), links }
}