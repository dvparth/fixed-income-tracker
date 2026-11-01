const normalizeTimelineDate = (value) => String(value || '').trim().slice(0, 10)

const isValidTimelineDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())

const createTimelineItem = (item) => {
  const date = normalizeTimelineDate(item.date)
  return isValidTimelineDate(date) ? { ...item, date } : null
}

export const buildDepositTimelineItems = ({
  deposit,
  effectiveMaturityDate,
  interestEvents = [],
  reinvestmentSummary,
  sourceEvents = [],
  formatCurrency,
}) => {
  if (!deposit) {
    return []
  }

  const timeline = []
  const fundingSources = sourceEvents.map((event) => (
    `${event.bankName || 'Investment'} ${event.type === 'Interest' ? 'interest' : 'maturity'} cash ` +
    `${formatCurrency(event.allocatedAmount)} received ${event.date}`
  ))

  const invested = createTimelineItem({
    key: `investment-${deposit.id}`,
    kind: 'Invested',
    date: deposit.investmentDate,
    amount: Number(deposit.principalAmount || 0),
    status: 'Investment started',
    detail: fundingSources.length > 0
      ? `Funded from ${fundingSources.join('; ')}.`
      : 'Investment opened with the recorded principal amount.',
  })
  if (invested) timeline.push(invested)

  interestEvents.forEach((event) => {
    const interest = createTimelineItem({
      key: event.eventId,
      kind: 'Interest',
      date: event.date,
      amount: Number(event.amount || 0),
      status: event.isDue ? 'Received' : 'Upcoming',
      detail: `Before TDS ${formatCurrency(event.grossAmount)} · After TDS ${formatCurrency(event.amount)}.`,
    })
    if (interest) timeline.push(interest)

    const allocations = Array.isArray(event.allocations) ? event.allocations : []
    allocations.forEach((allocation) => {
      const child = allocation.deposit
      const reinvestment = createTimelineItem({
        key: `interest-reinvestment-${event.eventId}-${child.id}`,
        kind: 'Reinvested',
        date: child.investmentDate || event.date,
        amount: Number(allocation.amount || 0),
        status: 'Used for another investment',
        detail: `Interest cash was used to fund ${child.bankName || 'another investment'}.`,
        relatedDepositId: child.id,
        relatedDepositLabel: child.accountNumber || child.id,
      })
      if (reinvestment) timeline.push(reinvestment)
    })

    const settlements = Array.isArray(event.settlements) ? event.settlements : []
    settlements.forEach((settlement, index) => {
      const settled = createTimelineItem({
        key: `interest-settlement-${event.eventId}-${index}`,
        kind: 'Settled',
        date: settlement.settledAt || event.date,
        amount: Number(settlement.amount || 0),
        status: 'Settled outside YieldFlow',
        detail: 'Interest cash was recorded as used outside YieldFlow.',
      })
      if (settled) timeline.push(settled)
    })
  })

  const maturityDate = normalizeTimelineDate(effectiveMaturityDate)
  const isEarlyClosure =
    deposit.status === 'Closed' &&
    Boolean(deposit.closureDate) &&
    normalizeTimelineDate(deposit.closureDate) !== normalizeTimelineDate(deposit.maturityDate)
  const maturity = createTimelineItem({
    key: `maturity-${deposit.id}`,
    kind: isEarlyClosure ? 'Closed early' : 'Maturity',
    date: maturityDate,
    amount: Number(
      deposit.maturityAfterTax ||
      deposit.maturityBeforeTax ||
      deposit.principalAmount ||
      0,
    ),
    status: reinvestmentSummary?.isRealized ? 'Cash received' : 'Expected',
    detail: reinvestmentSummary?.isRealized
      ? `${formatCurrency(reinvestmentSummary.uninvestedAmount)} remains available after reinvestment and settlements.`
      : 'Maturity cash has not been received yet.',
  })
  if (maturity) timeline.push(maturity)

  reinvestmentSummary?.children?.forEach((allocation) => {
    const child = allocation.deposit
    const reinvestment = createTimelineItem({
      key: `maturity-reinvestment-${deposit.id}-${child.id}`,
      kind: 'Reinvested',
      date: child.investmentDate || maturityDate,
      amount: Number(allocation.amount || 0),
      status: 'Used for another investment',
      detail: `Maturity cash was used to fund ${child.bankName || 'another investment'}.`,
      relatedDepositId: child.id,
      relatedDepositLabel: child.accountNumber || child.id,
    })
    if (reinvestment) timeline.push(reinvestment)
  })

  reinvestmentSummary?.settlements?.forEach((settlement, index) => {
    const settled = createTimelineItem({
      key: `maturity-settlement-${deposit.id}-${index}`,
      kind: 'Settled',
      date: settlement.settledAt || maturityDate,
      amount: Number(settlement.amount || 0),
      status: 'Settled outside YieldFlow',
      detail: 'Maturity cash was recorded as used outside YieldFlow.',
    })
    if (settled) timeline.push(settled)
  })

  return timeline.sort((left, right) => left.date.localeCompare(right.date))
}
