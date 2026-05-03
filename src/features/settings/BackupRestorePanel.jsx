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

const GOOGLE_DRIVE_SCOPE =
  String(import.meta.env.VITE_GOOGLE_DRIVE_SCOPE || '').trim() ||
  'https://www.googleapis.com/auth/drive.file'
const GOOGLE_DRIVE_APP_FOLDER_NAME =
  String(import.meta.env.VITE_GOOGLE_DRIVE_BACKUP_FOLDER_NAME || '').trim() ||
  'YieldFlow Backups'
const GOOGLE_DRIVE_API_PAGE_SIZE = (() => {
  const number = Number(import.meta.env.VITE_GOOGLE_DRIVE_API_PAGE_SIZE)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 10
})()
const DEFAULT_BACKUP_DESTINATION =
  String(import.meta.env.VITE_DEFAULT_BACKUP_DESTINATION || '').trim() || 'local'

const escapeDriveQueryValue = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const sanitizeFilenamePart = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'portfolio'

const buildStableDriveBackupFilename = ({ ownerUserId, portfolioLabel }) =>
  `yieldflow-backup-${sanitizeFilenamePart(portfolioLabel)}-${String(ownerUserId || 'portfolio').trim().toLowerCase()}.xlsx`

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
  loginEmail = '',
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
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false)
  const [backupDestination, setBackupDestination] = useState(DEFAULT_BACKUP_DESTINATION)
  const [driveLink, setDriveLink] = useState('')

  const canRestore = Boolean(selectedFile && previewResult && !previewResult.hasErrors && confirmReplace && !isReadOnly)
  const previewSummary = previewResult?.summary || null
  const previewRows = useMemo(() => previewResult?.previewRows || [], [previewResult])
  const canUseDrive = Boolean(googleClientId)
  const isDriveDestination = backupDestination === 'drive'
  const backupDescription = isDriveDestination
    ? `Create a full snapshot of ${portfolioLabel} and keep one managed backup file in Google Drive. Google Drive can keep version history as that file is updated over time.`
    : `Create a full snapshot of ${portfolioLabel} and download it to this device as an Excel backup file.`

  const fetchBackupFile = async (fallbackFilename = 'yieldflow-backup.xlsx') => {
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
      fallbackFilename,
    )
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
      url: `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&pageSize=${GOOGLE_DRIVE_API_PAGE_SIZE}`,
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
      url: `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,modifiedTime)&pageSize=${GOOGLE_DRIVE_API_PAGE_SIZE}`,
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
      prompt: '',
      loginHint: loginEmail,
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

      if (backupDestination === 'drive') {
        const backupFile = await fetchBackupFile(
          buildStableDriveBackupFilename({ ownerUserId, portfolioLabel }),
        )
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
        const backupFile = await fetchBackupFile()
        triggerDownload(backupFile.blob, backupFile.filename)
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
          ? 'Some issues need to be fixed before this backup can be restored.'
          : 'Backup ready for review.',
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
    if (!canRestore || isRestoring) {
      return
    }

    try {
      setIsRestoring(true)
      setFeedback(null)
      const preRestoreBackupFile = await fetchBackupFile('yieldflow-pre-restore-backup.xlsx')
      triggerDownload(preRestoreBackupFile.blob, preRestoreBackupFile.filename)
      const result = await uploadFile('/api/data-backup/restore')
      setFeedback({
        type: 'success',
        message: 'Backup restored successfully. A backup of your previous data was downloaded first.',
      })
      setPreviewResult(null)
      setSelectedFile(null)
      setConfirmReplace(false)
      setIsRestoreConfirmOpen(false)
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
          <p>{backupDescription}</p>
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
          {isDriveDestination ? (
            <div className="backup-drive-note">
              <strong>YieldFlow Backups</strong>
              <small>
                The app will create this folder in Google Drive if it does not exist, then keep
                one managed backup file per portfolio updated there.
              </small>
            </div>
          ) : (
            <div className="backup-drive-note">
              <strong>Device download</strong>
              <small>Your backup will be downloaded to this device as an Excel file.</small>
            </div>
          )}
          <button
            type="button"
            className="secondary-btn compact"
            onClick={handleDownloadBackup}
            disabled={isDownloading || isReadOnly}
          >
            {isDownloading
              ? isDriveDestination
                ? 'Saving backup...'
                : 'Preparing backup...'
              : isDriveDestination
                ? 'Save Backup Now'
                : 'Download Backup'}
          </button>
        </div>
      </div>

      <div className="backup-restore-shell">
        <div className="backup-action-copy">
          <strong>Restore from Backup</strong>
          <p>Choose a backup file, review what it contains, then confirm before replacing your current data.</p>
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
            {isPreviewing ? 'Reviewing backup...' : 'Review Backup'}
          </button>
        </div>

        <div className="backup-restore-note">
          Restoring will overwrite your current data.
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
                <small>Investments included in this backup.</small>
              </div>
              <div className="editor-summary-card">
                <span>Reference data</span>
                <strong>{(previewSummary?.ownerCount || 0) + (previewSummary?.institutionCount || 0) + (previewSummary?.instrumentTypeCount || 0)}</strong>
                <small>Owners, institutions, branches, and instrument types included.</small>
              </div>
              <div className="editor-summary-card">
                <span>Review</span>
                <strong>{previewResult.hasErrors ? 'Needs attention' : 'Ready'}</strong>
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
                <h4>Issues in this backup</h4>
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
                <h4>Fix these items before restore</h4>
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
                  onClick={() => {
                    if (canRestore) {
                      setIsRestoreConfirmOpen(true)
                    }
                  }}
                  disabled={!canRestore || isRestoring}
                >
                  Continue to restore
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isRestoreConfirmOpen ? (
        <div
          className="about-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isRestoring) {
              setIsRestoreConfirmOpen(false)
            }
          }}
        >
          <section
            className="about-modal panel backup-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <div>
                <h2 id="restore-confirm-title">Restore Data</h2>
                <p>This will replace all your existing data with the selected backup.</p>
              </div>
            </div>
            <div className="backup-confirm-modal-copy">
              <div className="backup-warning-card">
                <strong>Your current data will be protected first.</strong>
                <p>
                  Before restore starts, YieldFlow will download a backup of your current data to
                  this device.
                </p>
              </div>
            </div>
            <div className="backup-confirm-modal-actions">
              <button
                type="button"
                className="secondary-btn compact ghost-btn"
                onClick={() => setIsRestoreConfirmOpen(false)}
                disabled={isRestoring}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn compact-btn"
                onClick={handleRestore}
                disabled={!canRestore || isRestoring}
              >
                {isRestoring ? 'Restoring...' : 'Restore Data'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
