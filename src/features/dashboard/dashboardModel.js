export const summarizeActiveInvestmentsByIssuer = (deposits) => {
  const groupedInvestments = deposits.reduce((groups, deposit) => {
    if (deposit.status !== 'Open') {
      return groups
    }

    const issuerName = String(deposit.bankName || '').trim() || 'Unknown issuer'
    const issuer = groups.get(issuerName) ?? {
      issuerName,
      investmentCount: 0,
      principalAmount: 0,
    }

    issuer.investmentCount += 1
    issuer.principalAmount += Number(deposit.principalAmount || 0)
    groups.set(issuerName, issuer)
    return groups
  }, new Map())

  return Array.from(groupedInvestments.values()).sort(
    (left, right) =>
      right.principalAmount - left.principalAmount || left.issuerName.localeCompare(right.issuerName),
  )
}