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

export const summarizeUpcomingInterestEvents = (events) => {
  const groupedEvents = events.reduce((groups, event) => {
    const current = groups.get(event.depositId) ?? {
      depositId: event.depositId,
      bankName: event.bankName,
      holderName: event.holderName,
      accountNumber: event.accountNumber,
      futureAmount: 0,
      receiptCount: 0,
      nextPaymentDate: event.date,
    }

    current.futureAmount += Number(event.amount || 0)
    current.receiptCount += 1
    if (new Date(event.date) < new Date(current.nextPaymentDate)) {
      current.nextPaymentDate = event.date
    }
    groups.set(event.depositId, current)
    return groups
  }, new Map())

  return Array.from(groupedEvents.values()).sort(
    (left, right) => new Date(left.nextPaymentDate) - new Date(right.nextPaymentDate),
  )
}