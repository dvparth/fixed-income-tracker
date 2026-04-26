import { useMemo, useRef, useState } from 'react'
import { requestJson } from '../deposits/depositModel.js'
import { downloadInvestmentImportTemplate } from './importTemplateWorkbook.js'

const buildOwnerScopedPath = (path, ownerUserId, dryRun) => {
  const params = new URLSearchParams()
  if (ownerUserId) {
    params.set('ownerUserId', ownerUserId)
  }
  if (dryRun !== undefined) {
    params.set('dryRun', String(dryRun))
  }

  const query = params.toString()
  return query ? `${path}?${query}` : path
}

const renderMasterChangeList = (title, values) => {
  if (!values || values.length === 0) {
    return null
  }

  return (
    <div className="import-master-change-block">
      <strong>{title}</strong>
      <p>{values.join(', ')}</p>
    </div>
  )
}

export default function BulkImportPanel({
  ownerUserId,
  portfolioLabel,
  onImportSuccess,
  isReadOnly = false,
}) {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewResult, setPreviewResult] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const hasRowErrors = Boolean(previewResult?.hasErrors)
  const canConfirm = Boolean(selectedFile && previewResult && !hasRowErrors && !isReadOnly)
  const branchChanges = useMemo(
    () =>
      (previewResult?.masterChanges?.branches || []).map(
        (entry) => `${entry.institutionName}: ${entry.branchName}`,
      ),
    [previewResult],
  )

  const uploadFile = async (dryRun) => {
    if (!selectedFile) {
      setFeedback({
        type: 'error',
        message: 'Choose a .xlsx file first.',
      })
      return null
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    return requestJson(buildOwnerScopedPath('/api/investment-import', ownerUserId, dryRun), {
      method: 'POST',
      body: formData,
    })
  }

  const handlePreview = async () => {
    try {
      setIsPreviewing(true)
      setFeedback(null)
      const preview = await uploadFile(true)
      setPreviewResult(preview)
      setFeedback({
        type: preview.hasErrors ? 'error' : 'success',
        message: preview.hasErrors
          ? 'Preview found validation issues. Fix the workbook and preview again.'
          : `Preview ready for ${preview.validRowCount} investments.`,
      })
    } catch (error) {
      setPreviewResult(null)
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleImport = async () => {
    try {
      setIsImporting(true)
      setFeedback(null)
      const result = await uploadFile(false)
      setFeedback({
        type: 'success',
        message: result.message,
      })
      setPreviewResult(null)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await onImportSuccess?.(result)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section className="import-panel">
      <div className="section-head">
        <div>
          <h3>Bulk upload</h3>
          <p>
            Upload an `.xlsx` workbook for {portfolioLabel}. The first version imports standalone
            investments only.
          </p>
        </div>
        <button type="button" className="secondary-btn compact" onClick={downloadInvestmentImportTemplate}>
          Download template
        </button>
      </div>

      <div className="import-actions">
        <label className="field">
          <span>Excel file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] || null)
              setPreviewResult(null)
              setFeedback(null)
            }}
            disabled={isReadOnly}
          />
        </label>
        <button
          type="button"
          className="secondary-btn compact"
          onClick={handlePreview}
          disabled={!selectedFile || isPreviewing || isReadOnly}
        >
          {isPreviewing ? 'Previewing...' : 'Preview import'}
        </button>
        <button
          type="button"
          className="primary-btn compact-btn"
          onClick={handleImport}
          disabled={!canConfirm || isImporting}
        >
          {isImporting ? 'Importing...' : 'Confirm import'}
        </button>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'status-banner error' : 'status-banner'}>
          {feedback.message}
        </div>
      )}

      {previewResult && (
        <div className="import-preview">
          <div className="editor-summary">
            <div className="editor-summary-card">
              <span>Rows parsed</span>
              <strong>{previewResult.parsedRowCount}</strong>
              <small>Total rows found in the workbook.</small>
            </div>
            <div className="editor-summary-card">
              <span>Rows valid</span>
              <strong>{previewResult.validRowCount}</strong>
              <small>Rows ready to import if you confirm.</small>
            </div>
            <div className="editor-summary-card">
              <span>Validation</span>
              <strong>{previewResult.hasErrors ? 'Needs fixes' : 'Ready'}</strong>
              <small>
                {previewResult.hasErrors
                  ? `${previewResult.rowErrors.length} row issue(s) found`
                  : 'No validation issues found'}
              </small>
            </div>
          </div>

          <div className="import-master-changes">
            {renderMasterChangeList('New owners', previewResult.masterChanges?.owners)}
            {renderMasterChangeList('New institutions', previewResult.masterChanges?.institutions)}
            {renderMasterChangeList('New branches', branchChanges)}
            {renderMasterChangeList('New instrument types', previewResult.masterChanges?.instrumentTypes)}
          </div>

          {previewResult.rowErrors.length > 0 && (
            <div className="import-error-list">
              <h4>Validation issues</h4>
              {previewResult.rowErrors.map((entry, index) => (
                <div key={`${entry.rowNumber || 'header'}-${index}`} className="inline-action-card">
                  <div>
                    <strong>{entry.rowNumber ? `Row ${entry.rowNumber}` : 'Workbook header'}</strong>
                    <p>{entry.messages.join(' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Holder</th>
                  <th>Bank or issuer</th>
                  <th>Account no.</th>
                  <th>Instrument</th>
                  <th>Principal</th>
                  <th>Investment date</th>
                  <th>Status</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {previewResult.previewRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.investment.holderName}</td>
                    <td>{row.investment.bankName}</td>
                    <td>{row.investment.accountNumber}</td>
                    <td>{row.investment.instrumentType}</td>
                    <td>{row.investment.principalAmount}</td>
                    <td>{row.investment.investmentDate}</td>
                    <td>{row.investment.status}</td>
                    <td>{row.errors.length > 0 ? row.errors.join(' ') : 'Ready to import'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

