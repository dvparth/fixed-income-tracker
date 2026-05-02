export default function PortfolioAccessPanel({
  isOwnerPortfolio,
  activePortfolioLabel,
  shareEmail,
  setShareEmail,
  onCreateShare,
  onDeleteShare,
  ownedShares,
  sharedWithMe,
  isSubmittingShare,
  shareFeedback,
}) {
  return (
    <section className="settings-section settings-section-accent">
      <div className="section-head">
        <div>
          <h2>{isOwnerPortfolio ? 'Access' : 'Shared access'}</h2>
          <p>
            {isOwnerPortfolio
              ? `Control who can view ${activePortfolioLabel} and what they are allowed to do.`
              : `You are viewing ${activePortfolioLabel} with limited access.`}
          </p>
        </div>
      </div>

      {shareFeedback && (
        <div className={shareFeedback.type === 'error' ? 'status-banner error' : 'status-banner'}>
          {shareFeedback.message}
        </div>
      )}

      {isOwnerPortfolio ? (
        <>
          <div className="share-permission-note">
            <strong>Invited users can</strong>
            <p>View deposits, cashflows, timelines, and FY interest summaries.</p>
            <strong>They cannot</strong>
            <p>Edit deposits, change masters, archive records, or use admin actions.</p>
          </div>

          <form className="share-form" onSubmit={onCreateShare}>
            <label className="field">
              <span>Invite with Google email</span>
              <input
                type="email"
                value={shareEmail}
                onChange={(event) => setShareEmail(event.target.value)}
                placeholder="person@example.com"
                autoComplete="off"
              />
              <small className="field-help">
                Access is read-only. The invited user will see this portfolio in their portfolio switcher.
              </small>
            </label>
            <button type="submit" className="primary-btn" disabled={isSubmittingShare}>
              {isSubmittingShare ? 'Sending invite...' : 'Invite viewer'}
            </button>
          </form>

          <div className="share-list">
            <div className="section-head">
              <div>
                <h2>People with access</h2>
                <p>These people can review the portfolio but cannot make changes.</p>
              </div>
            </div>

            {ownedShares.length > 0 ? (
              ownedShares.map((share) => (
                <div key={share.id} className="share-row">
                  <div>
                    <strong>{share.guestDisplayName || share.guestEmail}</strong>
                    <p>{share.guestEmail}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn compact"
                    onClick={() => onDeleteShare(share.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state-card masters-empty-state">
                <div className="empty-state-icon masters-empty-icon" aria-hidden="true">A</div>
                <p className="lineage-empty">No viewers added yet.</p>
                <p className="masters-empty-copy">
                  Invite a family member or advisor when you want them to review this portfolio without editing it.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="share-list">
          <p className="inline-warning">
            You can review deposits, maturities, payouts, and FY summaries here. Editing, archiving,
            admin export, and master-data changes are disabled.
          </p>
        </div>
      )}

      {sharedWithMe.length > 0 && (
        <div className="share-list">
          <div className="section-head">
            <div>
              <h2>Shared with you</h2>
              <p>Use the portfolio selector in Settings to switch into one of these shared books.</p>
            </div>
          </div>

          {sharedWithMe.map((share) => (
            <div key={share.id} className="share-row readonly">
              <div>
                <strong>{share.ownerDisplayName}</strong>
                <p>{share.ownerEmail || 'Read-only portfolio access'}</p>
              </div>
              <span className="pill open">Read only</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
