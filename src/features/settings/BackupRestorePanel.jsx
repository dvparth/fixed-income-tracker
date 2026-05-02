import { useMemo, useRef, useState } from 'react'
import { requestJson } from '../deposits/depositModel.js'
import { requestGoogleAccessToken } from '../auth/googleIdentity.js'

const buildOwnerScopedPath = (path, ownerUserId) => {
  const params = new URLSearchParams()
  if (ownerUserId) {
    params.set('ownerUserId', ownerUserId)
  }

  const query = params.toString()
  return query ? `${path}?${query}` : path
}

const getApiUrl = (path) => {
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
  return apiBaseUrl && path.startsWith('/') ? `${apiBaseUrl}${path}` : path
}

const parseDownloadFilename = (contentDisposition, fallback) => {
  const filenameMatch =
    /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
      String(contentDisposition || ''),
    )

  const candidate = filenameMatch?.[1] || filenameMatch?.[2] || filenameMatch?.[3] || ''
  if (!candidate) {
    return fallback
  }

  try {
    return decodeURIComponent(candidate)
  } catch {
    return candidate
  }
}

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GOOGLE_DRIVE_APP_FOLDER_NAME = 'YieldFlow Backups'

const escapeDriveQueryValue = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function BackupRestorePanel({
  ownerUserId,
  portfolioLabel,
  isReadOnly = false,
  onRestoreSuccess,
}) {
  const fileInputRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewResult, setPreviewResult] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [backupDestination, setBackupDestination] = useState('local')
  const [driveLink, setDriveLink] = useState('')

  const canRestore = Boolean(selectedFile && previewResult && !previewResult.hasErrors && confirmReplace && !isReadOnly)
  const previewSummary = previewResult?.summary || null
  const previewRows = useMemo(() => previewResult?.previewRows || [], [previewResult])
  const canUseDrive = Boolean(googleClientId)

  const downloadBackupFile = async (prefix = 'yieldflow-backup') => {
    const response = await fetch(getApiUrl(buildOwnerScopedPath('/api/data-backup/export', ownerUserId)), {
      credentials: 'include',
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new Error(errorBody?.message || `Request failed with status ${response.status}`)
    }

    const blob = await response.blob()
    const filename = parseDownloadFilename(
      response.headers.get('content-disposition'),
      `${prefix}.xlsx`,
    )
    triggerDownload(blob, filename)
    return { blob, filename }
  }

  const driveApiRequest = async ({ accessToken, url, method = 'GET', headers = {}, body }) => {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
      body,
    })

    const result = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(result?.error?.message || 'Google Drive request failed.')
    }

    return result
  }

  const findOrCreateDriveFolder = async ({ accessToken }) => {
    const query = encodeURIComponent(
      `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapeDriveQueryValue(GOOGLE_DRIVE_APP_FOLDER_NAME)}'`,
    )

    const search = await driveApiRequest({
      accessToken,
      url: `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&pageSize=10`,
    })

    if (Array.isArray(search.files) && search.files.length > 0) {
      return search.files[0]
    }

    return driveApiRequest({
      accessToken,
      url: 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: GOOGLE_DRIVE_APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
  }

  const findExistingDriveBackupFile = async ({ accessToken, folderId, filename }) => {
    const query = encodeURIComponent(
      `'${folderId}' in parents and trashed=false and name='${escapeDriveQueryValue(filename)}'`,
    )

    const search = await driveApiRequest({
      accessToken,
      url: `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,modifiedTime)&pageSize=10`,
    })

    return Array.isArray(search.files) && search.files.length > 0 ? search.files[0] : null
  }

  const uploadDriveMultipart = async ({ accessToken, url, metadata, blob, method }) => {
    const boundary = `yieldflow-${Date.now()}`
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
        blob,
        `\r\n--${boundary}--`,
      ],
      {
        type: `multipart/related; boundary=${boundary}`,
      },
    )

    return driveApiRequest({
      accessToken,
      url,
      method,
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
  }

  const saveBackupToGoogleDrive = async ({ blob, filename }) => {
    if (!canUseDrive) {
      throw new Error('Google Drive save is unavailable because Google sign-in is not configured.')
    }

    const accessToken = await requestGoogleAccessToken({
      clientId: googleClientId,
      scope: GOOGLE_DRIVE_SCOPE,
      prompt: 'consent',
    })

    const folder = await findOrCreateDriveFolder({ accessToken })
    const existingFile = await findExistingDriveBackupFile({
      accessToken,
      folderId: folder.id,
      filename,
    })

    if (existingFile) {
      const updated = await uploadDriveMultipart({
        accessToken,
        url: `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart&fields=id,name,webViewLink,modifiedTime`,
        method: 'PATCH',
        metadata: {
          name: filename,
        },
        blob,
      })

      return {
        ...updated,
        folder,
        mode: 'updated',
      }
    }

    const created = await uploadDriveMultipart({
      accessToken,
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime',
      method: 'POST',
      metadata: {
        name: filename,
        parents: [folder.id],
      },
      blob,
    })

    return {
      ...created,
      folder,
      mode: 'created',
    }
  }

  const handleDownloadBackup = async () => {
    try {
      setIsDownloading(true)
      setFeedback(null)
      setDriveLink('')
      const backupFile = await downloadBackupFile('yieldflow-backup')

      if (backupDestination === 'drive') {
        const driveFile = await saveBackupToGoogleDrive(backupFile)
        setDriveLink(String(driveFile?.webViewLink || '').trim())
        setFeedback({
          type: 'success',
          message:
            driveFile.mode === 'updated'
              ? 'Backup updated in Google Drive. Drive version history will keep older versions.'
              : 'Backup saved to Google Drive in the YieldFlow Backups folder.',
        })
      } else {
        setFeedback({
          type: 'success',
          message: 'Backup downloaded successfully.',
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const uploadFile = async (path) => {
    if (!selectedFile) {
      setFeedback({
        type: 'error',
        message: 'Choose a backup file first.',
      })
      return null
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    return requestJson(buildOwnerScopedPath(path, ownerUserId), {
      method: 'POST',
      body: formData,
    })
  }

  const handlePreview = async () => {
    try {
      setIsPreviewing(true)
      setPreviewResult(null)
      setConfirmReplace(false)
      setFeedback(null)
      const result = await uploadFile('/api/data-backup/preview')
      setPreviewResult(result)
      setFeedback({
        type: result.hasErrors ? 'error' : 'success',
        message: result.hasErrors
          ? 'Restore preview found issues. Fix the file before continuing.'
          : 'Backup file is ready to restore.',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleRestore = async () => {
    try {
      setIsRestoring(true)
      setFeedback(null)
      await downloadBackupFile('yieldflow-pre-restore-backup')
      const result = await uploadFile('/api/data-backup/restore')
      setFeedback({
        type: 'success',
        message: 'Backup restored successfully. A backup of your previous data was downloaded first.',
      })
      setPreviewResult(null)
      setSelectedFile(null)
      setConfirmReplace(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await onRestoreSuccess?.(result)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="backup-panel">
      <div className="backup-actions-row">
        <div className="backup-action-copy">
          <strong>Backup</strong>
          <p>Save a full Excel snapshot of {portfolioLabel} to this device or keep one managed copy in Google Drive.</p>
        </div>
        <div className="backup-destination-shell">
          <label className="field">
            <span>Save backup to</span>
            <select
              value={backupDestination}
              onChange={(event) => {
                setBackupDestination(event.target.value)
                setDriveLink('')
              }}
              disabled={isReadOnly}
            >
              <option value="local">This device</option>
              <option value="drive" disabled={!canUseDrive}>
                Google Drive
              </option>
            </select>
          </label>
          {backupDestination === 'drive' && (
            <div className="backup-drive-note">
              <strong>YieldFlow Backups</strong>
              <small>
                The app will create this folder in Google Drive if it does not exist, then keep
                one backup file per portfolio updated there so Drive can maintain version history.
              </small>
            </div>
          )}
          <button
            type="button"
            className="secondary-btn compact"
            onClick={handleDownloadBackup}
            disabled={isDownloading || isReadOnly}
          >
            {isDownloading
              ? backupDestination === 'drive'
                ? 'Saving backup...'
                : 'Preparing backup...'
              : backupDestination === 'drive'
                ? 'Save to Google Drive'
                : 'Download Backup'}
          </button>
        </div>
      </div>

      <div className="backup-restore-shell">
        <div className="backup-action-copy">
          <strong>Restore from Backup</strong>
          <p>Upload a backup file, review what will be restored, then confirm replacement.</p>
        </div>

        <div className="backup-restore-actions">
          <label className="field">
            <span>Backup file</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] || null)
                setPreviewResult(null)
                setConfirmReplace(false)
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
            {isPreviewing ? 'Checking backup...' : 'Preview restore'}
          </button>
        </div>

        {feedback && (
          <div className={feedback.type === 'error' ? 'status-banner error' : 'status-banner'}>
            {feedback.message}
            {driveLink ? (
              <>
                {' '}
                <a href={driveLink} target="_blank" rel="noreferrer">
                  View file
                </a>
              </>
            ) : null}
          </div>
        )}

        {previewResult && (
          <div className="backup-preview">
            <div className="editor-summary">
              <div className="editor-summary-card">
                <span>Investments</span>
                <strong>{previewSummary?.investmentCount || 0}</strong>
                <small>Records that will replace the current portfolio data.</small>
              </div>
              <div className="editor-summary-card">
                <span>Reference data</span>
                <strong>{(previewSummary?.ownerCount || 0) + (previewSummary?.institutionCount || 0) + (previewSummary?.instrumentTypeCount || 0)}</strong>
                <small>Owners, institutions, and instrument types in this backup.</small>
              </div>
              <div className="editor-summary-card">
                <span>Validation</span>
                <strong>{previewResult.hasErrors ? 'Needs fixes' : 'Ready'}</strong>
                <small>
                  {previewResult.hasErrors
                    ? `${previewResult.rowErrors.length + previewResult.errors.length} issue(s) need attention`
                    : 'No issues found'}
                </small>
              </div>
            </div>

            <div className="backup-preview-metrics">
              <span>Owners: {previewSummary?.ownerCount || 0}</span>
              <span>Institutions: {previewSummary?.institutionCount || 0}</span>
              <span>Branches: {previewSummary?.branchCount || 0}</span>
              <span>Instrument types: {previewSummary?.instrumentTypeCount || 0}</span>
              <span>Archived investments: {previewSummary?.archivedInvestmentCount || 0}</span>
            </div>

            {previewResult.errors.length > 0 && (
              <div className="import-error-list">
                <h4>Backup issues</h4>
                {previewResult.errors.map((message, index) => (
                  <div key={`${message}-${index}`} className="inline-action-card">
                    <div>
                      <strong>Backup file</strong>
                      <p>{message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {previewResult.rowErrors.length > 0 && (
              <div className="import-error-list">
                <h4>Items to fix before restore</h4>
                {previewResult.rowErrors.map((entry, index) => (
                  <div key={`${entry.rowNumber || 'row'}-${index}`} className="inline-action-card">
                    <div>
                      <strong>{entry.rowNumber ? `Investment row ${entry.rowNumber}` : 'Backup file'}</strong>
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
                    <th>Institution</th>
                    <th>Instrument</th>
                    <th>Principal</th>
                    <th>Status</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.investment.holderName}</td>
                      <td>{row.investment.bankName}</td>
                      <td>{row.investment.instrumentType}</td>
                      <td>{row.investment.principalAmount}</td>
                      <td>{row.investment.status}</td>
                      <td>{row.errors.length > 0 ? row.errors.join(' ') : 'Ready to restore'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="backup-warning-card">
              <strong>This will replace all your existing data.</strong>
              <p>
                Deposits and reference data for {portfolioLabel} will be overwritten. A backup of
                your current data will be downloaded automatically before restore starts.
              </p>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  onChange={(event) => setConfirmReplace(event.target.checked)}
                  disabled={previewResult.hasErrors || isReadOnly}
                />
                <span>I understand this will replace the current portfolio data.</span>
              </label>
              <div className="backup-confirm-actions">
                <button
                  type="button"
                  className="primary-btn compact-btn"
                  onClick={handleRestore}
                  disabled={!canRestore || isRestoring}
                >
                  {isRestoring ? 'Restoring...' : 'Restore backup'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
