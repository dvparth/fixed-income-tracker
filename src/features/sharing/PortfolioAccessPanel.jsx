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
    <article className="panel">
      <div className="section-head">
        <div>
          <h2>{isOwnerPortfolio ? 'Portfolio access' : 'Shared access'}</h2>
          <p>
            {isOwnerPortfolio
              ? `Grant read-only access to ${activePortfolioLabel}.`
              : `You are currently viewing ${activePortfolioLabel} in read-only mode.`}
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
          <form className="share-form" onSubmit={onCreateShare}>
            <label className="field">
              <span>Share with Google email</span>
              <input
                type="email"
                value={shareEmail}
                onChange={(event) => setShareEmail(event.target.value)}
                placeholder="person@example.com"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="primary-btn" disabled={isSubmittingShare}>
              {isSubmittingShare ? 'Sharing...' : 'Grant read-only access'}
            </button>
          </form>

          <div className="share-list">
            <div className="section-head">
              <div>
                <h2>People with access</h2>
                <p>These people can view this portfolio but cannot change deposits or masters.</p>
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
              <p className="lineage-empty">No guest access has been granted yet.</p>
            )}
          </div>
        </>
      ) : (
        <div className="share-list">
          <p className="inline-warning">
            This portfolio is shared with you. Editing, archiving, admin export, and master-data
            changes are disabled.
          </p>
        </div>
      )}

      {sharedWithMe.length > 0 && (
        <div className="share-list">
          <div className="section-head">
            <div>
              <h2>Shared with you</h2>
              <p>Switch portfolios from Settings to review these shared investment books.</p>
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
    </article>
  )
}
