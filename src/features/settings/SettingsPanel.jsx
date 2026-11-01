import BackupRestorePanel from './BackupRestorePanel.jsx'
import PortfolioAccessPanel from '../sharing/PortfolioAccessPanel.jsx'

export default function SettingsPanel({
  activePortfolioLabel,
  activePortfolioOwnerId,
  brokenAvatarUrl,
  canEditPortfolio,
  canUseAdmin,
  expandedSettingsSection,
  handleBackupRestoreSuccess,
  handleCreateShare,
  handleDeleteShare,
  isAdminUser,
  isDemoMode,
  isReadOnlyPortfolio,
  isSubmittingShare,
  openAdmin,
  sessionState,
  setActivePortfolioOwnerId,
  setActiveTab,
  setBrokenAvatarUrl,
  setIsSettingsOpen,
  setMastersReturnTarget,
  setShareEmail,
  setThemeClass,
  shareEmail,
  shareFeedback,
  sharesState,
  themeClass,
  toggleSettingsSection,
  visibleActiveTab,
}) {
  return (
    <section className="settings-panel panel">
          <div className="section-head">
            <div>
              <h2>Settings</h2>
              <p>Manage your account, sharing, backups, and other settings.</p>
            </div>
            <button
              type="button"
              className="secondary-btn compact ghost-btn"
              onClick={() => setIsSettingsOpen(false)}
              >
                Close
              </button>
          </div>

          <div className="settings-accordion">
            <section className="settings-accordion-item">
              <button
                type="button"
                className="settings-accordion-toggle"
                onClick={() => toggleSettingsSection('sharing')}
                aria-expanded={expandedSettingsSection === 'sharing'}
              >
                <div>
                  <strong>Portfolio sharing</strong>
                  <span>Choose who can view this portfolio and how sharing works.</span>
                </div>
                <span className="settings-accordion-indicator" aria-hidden="true">
                  {expandedSettingsSection === 'access' ? '−' : '+'}
                </span>
              </button>
              {expandedSettingsSection === 'sharing' ? (
                isDemoMode ? (
                  <section className="settings-section settings-section-subtle">
                    <div className="demo-locked-card">
                      <strong>Portfolio sharing is available after sign-in.</strong>
                      <p>Real portfolios can be shared read-only with another Google user.</p>
                      <a className="primary-btn compact" href="/">Sign in</a>
                    </div>
                  </section>
                ) : (
                  <PortfolioAccessPanel
                    isOwnerPortfolio={!isReadOnlyPortfolio}
                    activePortfolioLabel={activePortfolioLabel}
                    shareEmail={shareEmail}
                    setShareEmail={setShareEmail}
                    onCreateShare={handleCreateShare}
                    onDeleteShare={handleDeleteShare}
                    ownedShares={sharesState.ownerShares}
                    sharedWithMe={sharesState.sharedWithMe}
                    isSubmittingShare={isSubmittingShare}
                    shareFeedback={shareFeedback}
                    showHeader={false}
                  />
                  )
                ) : null}
              </section>

              <section className="settings-accordion-item">
                <button
                  type="button"
                  className="settings-accordion-toggle"
                  onClick={() => toggleSettingsSection('account')}
                  aria-expanded={expandedSettingsSection === 'account'}
                >
                  <div>
                    <strong>My account</strong>
                    <span>Your account details and the portfolio you are currently viewing.</span>
                  </div>
                  <span className="settings-accordion-indicator" aria-hidden="true">
                    {expandedSettingsSection === 'profile' ? '−' : '+'}
                  </span>
                </button>
                {expandedSettingsSection === 'account' ? (
                  <section className="settings-section">
                    {isDemoMode ? (
                      <div className="demo-locked-card">
                        <strong>Account settings are locked in demo mode.</strong>
                        <p>Sign in with Google to create your own private portfolio, manage account details, and keep saved data.</p>
                        <a className="primary-btn compact" href="/">Sign in</a>
                      </div>
                    ) : (
                    <>
                    <div className="settings-profile">
                      {sessionState.user?.photoUrl && sessionState.user.photoUrl !== brokenAvatarUrl ? (
                        <img
                          className="settings-avatar"
                          src={sessionState.user.photoUrl}
                          alt={sessionState.user.displayName}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenAvatarUrl(sessionState.user?.photoUrl || '__unknown__')}
                        />
                      ) : (
                        <div className="settings-avatar fallback-avatar" aria-hidden="true">
                          {String(sessionState.user?.displayName || sessionState.user?.email || 'Y')
                            .trim()
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                      )}
                      <div className="settings-profile-copy">
                        <strong>{sessionState.user?.displayName}</strong>
                        <span>{sessionState.user?.email}</span>
                      </div>
                    </div>

                    <div className="settings-grid">
                      <div className="field settings-static-field">
                        <span>Role</span>
                        <strong>{isAdminUser ? 'Admin' : 'User'}</strong>
                      </div>

                      <label className="field">
                        <span>Viewing portfolio</span>
                        <select
                          value={activePortfolioOwnerId}
                          onChange={(event) => setActivePortfolioOwnerId(event.target.value)}
                        >
                          {sessionState.accessiblePortfolios.map((portfolio) => (
                            <option key={portfolio.ownerUserId} value={portfolio.ownerUserId}>
                              {portfolio.accessType === 'owner'
                                ? 'My portfolio'
                                : `${portfolio.ownerDisplayName}${portfolio.accessType === 'admin' ? '' : ' (Shared)'}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    </>
                    )}
                  </section>
                ) : null}
              </section>

              <section className="settings-accordion-item">
                <button
                  type="button"
                  className="settings-accordion-toggle"
                  onClick={() => toggleSettingsSection('appearance')}
                  aria-expanded={expandedSettingsSection === 'appearance'}
                >
                  <div>
                    <strong>Appearance</strong>
                    <span>Theme and display choices for this session.</span>
                  </div>
                  <span className="settings-accordion-indicator" aria-hidden="true">
                    {expandedSettingsSection === 'preferences' ? '−' : '+'}
                  </span>
                </button>
                {expandedSettingsSection === 'appearance' ? (
                  <section className="settings-section settings-section-subtle">
                    <div className="settings-grid settings-grid-compact">
                      <label className="field">
                        <span>Theme</span>
                        <select value={themeClass} onChange={(event) => setThemeClass(event.target.value)}>
                          <option value="theme-midnight-navy">Midnight Navy</option>
                          <option value="theme-professional">Professional</option>
                          <option value="theme-cream">Cream</option>
                        </select>
                      </label>
                    </div>
                  </section>
                ) : null}
              </section>

              <section className="settings-accordion-item">
                <button
                  type="button"
                  className="settings-accordion-toggle"
                  onClick={() => toggleSettingsSection('advanced')}
                  aria-expanded={expandedSettingsSection === 'advanced'}
                >
                  <div>
                    <strong>Advanced</strong>
                    <span>Backup, restore, and other less frequently used tools.</span>
                  </div>
                  <span className="settings-accordion-indicator" aria-hidden="true">
                    {expandedSettingsSection === 'advanced' ? '−' : '+'}
                  </span>
                </button>
                {expandedSettingsSection === 'advanced' ? (
                  <section className="settings-section settings-section-subtle">
                    <div className="settings-subsection">
                      <div className="section-head">
                        <div>
                          <h2>Backup &amp; restore</h2>
                          <p>Protect your data with backups and restore only when needed.</p>
                        </div>
                      </div>
                      {canEditPortfolio ? (
                        isDemoMode ? (
                          <div className="demo-locked-card">
                            <strong>Backup and restore are disabled for the public demo.</strong>
                            <p>Signed-in portfolios can download Excel backups, use Google Drive backup, and restore reviewed backup files.</p>
                            <a className="primary-btn compact" href="/">Sign in</a>
                          </div>
                        ) : (
                          <BackupRestorePanel
                            ownerUserId={activePortfolioOwnerId}
                            portfolioLabel={activePortfolioLabel}
                            loginEmail={sessionState.user?.email || ''}
                            isReadOnly={isReadOnlyPortfolio}
                            onRestoreSuccess={handleBackupRestoreSuccess}
                          />
                        )
                      ) : (
                        <p className="settings-subsection-empty">
                          Backup and restore are available only when you can edit this portfolio.
                        </p>
                      )}
                    </div>

                    <div className="settings-subsection">
                      <div className="section-head">
                        <div>
                          <h2>System Configuration</h2>
                          <p>Reference data and admin tools used less often.</p>
                        </div>
                      </div>
                      <div className="settings-actions">
                        {canUseAdmin && (
                          <button type="button" className="secondary-btn compact" onClick={openAdmin}>
                            Open Admin
                          </button>
                        )}
                        {isDemoMode && (
                          <div className="demo-locked-card compact-demo-locked-card">
                            <strong>Admin tools are not part of the public demo.</strong>
                            <p>Production admins can export data and perform controlled high-risk actions.</p>
                          </div>
                        )}
                        {canEditPortfolio && (
                          <button
                            type="button"
                            className="secondary-btn compact"
                            onClick={() => {
                              setMastersReturnTarget(visibleActiveTab)
                              setActiveTab('masters')
                              setIsSettingsOpen(false)
                            }}
                          >
                            Open Masters
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}
              </section>
            </div>
          </section>
  )
}
