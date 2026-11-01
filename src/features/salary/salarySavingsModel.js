export const filterSavingsByFinancialYear = (savings, financialYear) => {
  const startYear = Number(String(financialYear || '').split('-')[0])
  if (!Number.isFinite(startYear)) return savings
  return savings.filter((item) => {
    const [year, month] = String(item.salaryMonth || '').split('-').map(Number)
    return year === startYear ? month >= 4 : year === startYear + 1 && month <= 3
  })
}

export const createRenewedInvestmentAllocation = (savingId, investment, parentInvestment, amount) => ({
  id: `${investment.id}-${savingId}`,
  investmentId: investment.id,
  amount: Number(amount),
  investmentLabel: `${investment.bankName || 'Investment'} · ${investment.accountNumber || investment.id}`,
  investmentDate: investment.investmentDate || '',
  investmentStatus: investment.status || '',
  parentInvestmentId: investment.parentInvestmentId || '',
  parentInvestmentLabel: parentInvestment
    ? `${parentInvestment.bankName || 'Investment'} · ${parentInvestment.accountNumber || parentInvestment.id}`
    : '',
})

export const splitInvestmentAllocations = (saving, investments = []) => {
  const canResolveInvestments = investments.length > 0
  const investmentById = new Map(investments.map((investment) => [investment.id, investment]))
  const current = []
  const history = []

  ;(saving.investmentAllocations || []).forEach((allocation) => {
    const investment = investmentById.get(allocation.investmentId)
    const isHistorical = Boolean(
      allocation.isHistorical ||
      (canResolveInvestments && (!investment || String(investment.status || '').toLowerCase() === 'closed')),
    )
    const enrichedAllocation = { ...allocation, isHistorical }
    ;(isHistorical ? history : current).push(enrichedAllocation)
  })

  return { current, history }
}

export const summarizeSavings = (savings, investments = []) => savings.reduce((totals, item) => {
  const unavailable = Number(item.unavailableAmount ??
    (item.unavailable || []).reduce((sum, line) => sum + Number(line.amount || 0), 0))
  const hasAllocationDetails = Array.isArray(item.investmentAllocations)
  const invested = hasAllocationDetails
    ? splitInvestmentAllocations(item, investments).current.reduce(
        (sum, line) => sum + Number(line.amount || 0),
        0,
      )
    : Number(item.investedAmount || 0)
  const remaining = Math.max(Number(item.amount || 0) - unavailable - invested, 0)

  return {
    savings: totals.savings + Number(item.amount || 0),
    invested: totals.invested + invested,
    unavailable: totals.unavailable + unavailable,
    remaining: totals.remaining + remaining,
  }
}, { savings: 0, invested: 0, unavailable: 0, remaining: 0 })

export const summarizeInvestmentSalaryFunding = (savings, editingId, principalAmount, investments = []) => {
  const amount = Number(principalAmount || 0)
  if (!editingId) return { total: 0, outsideAmount: amount, links: [] }

  const links = savings.flatMap((saving) =>
    splitInvestmentAllocations(saving, investments).current
      .filter((link) => link.investmentId === editingId)
      .map((link) => ({ salaryMonth: saving.salaryMonth, amount: Number(link.amount || 0) })),
  )
  const total = links.reduce((sum, link) => sum + link.amount, 0)
  return { total, outsideAmount: Math.max(amount - total, 0), links }
}