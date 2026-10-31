import { useMemo, useState } from 'react'
import { formatCurrency, requestJson } from '../deposits/depositModel.js'
import { filterSavingsByFinancialYear, summarizeSavings } from './salarySavingsModel.js'

const emptyDraft = () => ({ salaryMonth: '', amount: '', unavailable: [], investmentAllocations: [], notes: '' })
const createLineId = () =>
  globalThis.crypto?.randomUUID?.() || `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function SalarySavingsView({ savings, investments, ownerUserId, isReadOnly, onSaved, selectedFinancialYear, financialYearOptions, onFinancialYearChange }) {
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [investmentSearches, setInvestmentSearches] = useState({})
  const scopedSavings = useMemo(
    () => filterSavingsByFinancialYear(savings, selectedFinancialYear),
    [savings, selectedFinancialYear],
  )
  const totals = useMemo(() => summarizeSavings(scopedSavings), [scopedSavings])
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const edit = (item) => {
    setEditingId(item.id)
    setDraft({ salaryMonth: item.salaryMonth, amount: String(item.amount), unavailable: item.unavailable || [], investmentAllocations: item.investmentAllocations || [], notes: item.notes || '' })
    setInvestmentSearches({})
    setError('')
  }
  const addUnavailable = () => set('unavailable', [...draft.unavailable, { id: `new-${Date.now()}`, amount: '', reason: '' }])
  const addInvestment = () => set('investmentAllocations', [...draft.investmentAllocations, { id: `new-${createLineId()}`, investmentId: '', amount: '' }])
  const updateLine = (key, index, field, value) => set(key, draft[key].map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line))
  const removeLine = (key, index) => set(key, draft[key].filter((_, lineIndex) => lineIndex !== index))
  const getVisibleInvestments = (line) => {
    const query = String(investmentSearches[line.id] || '').trim().toLowerCase()
    const matches = !query ? investments : investments.filter((investment) =>
      [investment.bankName, investment.accountNumber, investment.instrumentType, investment.holderName, investment.id]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    )
    const selected = investments.find((investment) => investment.id === line.investmentId)
    return selected && !matches.some((investment) => investment.id === selected.id)
      ? [selected, ...matches]
      : matches
  }
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const payload = {
      ...draft,
      amount: Number(draft.amount),
      unavailable: draft.unavailable.map(({ id, amount, reason }) => ({ id: id.startsWith('new-') ? undefined : id, amount: Number(amount), reason: String(reason).trim() })),
      investmentAllocations: draft.investmentAllocations.map(({ id, investmentId, amount }) => ({ id: id.startsWith('new-') ? undefined : id, investmentId, amount: Number(amount) })),
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.salaryMonth) || !Number.isFinite(payload.amount) || payload.amount <= 0) {
      setError('Choose a valid month and target amount.')
      return
    }
    if (payload.unavailable.some((item) => !Number.isFinite(item.amount) || item.amount <= 0 || !item.reason)) {
      setError('Every unavailable amount needs a positive value and short reason.')
      return
    }
    if (payload.investmentAllocations.some((item) => !item.investmentId || !Number.isFinite(item.amount) || item.amount <= 0)) {
      setError('Every investment link needs an investment and amount.')
      return
    }
    try {
      setSaving(true)
      await requestJson(`/api/salary-savings${editingId ? `/${editingId}` : ''}?ownerUserId=${encodeURIComponent(ownerUserId)}`, {
        method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload),
      })
      setDraft(emptyDraft()); setEditingId(''); setInvestmentSearches({}); await onSaved()
    } catch (submitError) { setError(submitError.message) } finally { setSaving(false) }
  }
  return <section className="salary-savings-view">
    <article className="panel salary-overview"><div className="section-head"><div><h2>Salary investment targets</h2><p>Track each month’s investment target, actual investments, shortfall, and still-available balance.</p></div><label className="field fy-select"><span>Financial year</span><select value={selectedFinancialYear} onChange={(event) => onFinancialYearChange(event.target.value)}>{financialYearOptions.map((label) => <option key={label} value={label}>FY {label}</option>)}</select></label></div></article>
    <div className="panel salary-summary-strip">
      {[['Target', totals.savings], ['Invested', totals.invested], ['Unavailable', totals.unavailable], ['Available to invest', totals.remaining]].map(([label, amount]) => <span key={label}><small>{label}</small><strong>{formatCurrency(amount)}</strong></span>)}
    </div>
    {!isReadOnly && <form className="panel salary-form" onSubmit={submit}>
      <div className="section-head"><div><h3>{editingId ? 'Edit monthly target' : 'Add monthly target'}</h3><p>Backdated months are supported. A month can have one investment target.</p></div>{editingId && <button className="secondary-btn compact" type="button" onClick={() => { setEditingId(''); setDraft(emptyDraft()); setInvestmentSearches({}); setError('') }}>Cancel</button>}</div>
      <div className="settings-grid"><label className="field"><span>Salary month</span><input type="month" value={draft.salaryMonth} onChange={(e) => set('salaryMonth', e.target.value)} required /></label><label className="field"><span>Target amount</span><input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(e) => set('amount', e.target.value)} required /></label></div>
      <label className="field"><span>Notes (optional)</span><input value={draft.notes} maxLength="500" onChange={(e) => set('notes', e.target.value)} /></label>
      <div className="salary-lines"><div className="section-head"><div><h3>Investments funded</h3><p>Add one row for each investment funded from this salary month.</p></div><button className="secondary-btn compact" type="button" onClick={addInvestment}>{draft.investmentAllocations.length ? 'Add another investment' : 'Link investment'}</button></div>{draft.investmentAllocations.length > 0 && <>{draft.investmentAllocations.map((line, index) => <div className="salary-line" key={line.id}><label className="field salary-investment-search"><span>Search investment {index + 1}</span><input type="search" placeholder="Bank, account, holder, type, or ID" value={investmentSearches[line.id] || ''} onChange={(event) => setInvestmentSearches((current) => ({ ...current, [line.id]: event.target.value }))} /></label><label className="field"><span>Investment {index + 1}</span><select value={line.investmentId} onChange={(e) => updateLine('investmentAllocations', index, 'investmentId', e.target.value)}><option value="">Choose investment</option>{getVisibleInvestments(line).map((investment) => <option key={investment.id} value={investment.id}>{investment.bankName || 'Investment'} · {investment.accountNumber || investment.id} · {String(investment.status || 'Open').toLowerCase() === 'closed' ? 'Closed' : 'Active'}</option>)}</select></label><label className="field"><span>Amount</span><input className="amount-input" type="number" min="0.01" step="0.01" placeholder="0.00" value={line.amount} onChange={(e) => updateLine('investmentAllocations', index, 'amount', e.target.value)} /></label><button type="button" className="secondary-btn compact" onClick={() => removeLine('investmentAllocations', index)}>Remove</button></div>)}</>}</div>
      <div className="salary-lines"><div className="section-head"><div><h3>Unavailable target amount</h3><p>Record any portion of the target that cannot be invested, with a short reason.</p></div><button className="secondary-btn compact" type="button" onClick={addUnavailable}>Mark unavailable</button></div>{draft.unavailable.map((line, index) => <div className="salary-line" key={line.id}><input placeholder="Short reason, e.g. medical expense" value={line.reason} onChange={(e) => updateLine('unavailable', index, 'reason', e.target.value)} /><input type="number" min="0.01" step="0.01" placeholder="Amount" value={line.amount} onChange={(e) => updateLine('unavailable', index, 'amount', e.target.value)} /><button type="button" className="secondary-btn compact" onClick={() => removeLine('unavailable', index)}>Remove</button></div>)}</div>
      {error && <p className="field-error">{error}</p>}<button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save target'}</button>
    </form>}
    <div className="salary-records">{scopedSavings.length === 0 ? <div className="panel empty-state"><p>No investment targets recorded for this financial year.</p></div> : scopedSavings.map((item) => <article className="panel salary-record" key={item.id}><div className="section-head"><div><h3>{new Date(`${item.salaryMonth}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3><p>{item.id}</p></div>{!isReadOnly && <button type="button" className="secondary-btn compact" onClick={() => edit(item)}>Edit</button>}</div><div className="salary-amounts"><span>Target <strong>{formatCurrency(item.amount)}</strong></span><span>Invested <strong>{formatCurrency(item.investedAmount)}</strong></span><span>Unavailable <strong>{formatCurrency(item.unavailableAmount)}</strong></span><span>Available to invest <strong>{formatCurrency(item.remainingAmount)}</strong></span></div>{item.investmentAllocations?.length > 0 && <p><strong>Invested in:</strong> {item.investmentAllocations.map((line) => `${line.investmentLabel} (${formatCurrency(line.amount)})`).join(', ')}</p>}{item.unavailable?.length > 0 && <p><strong>Unavailable:</strong> {item.unavailable.map((line) => `${line.reason} (${formatCurrency(line.amount)})`).join(', ')}</p>}{item.notes && <p>{item.notes}</p>}</article>)}</div>
  </section>
}
