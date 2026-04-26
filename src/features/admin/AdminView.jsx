export default function AdminView({
  totalInvestments,
  onDownloadWorkbook,
  portfolioLabel,
  isDownloadingWorkbook,
}) {
  return (
    <section className="stack">
      <article className="panel">
        <div className="section-head">
          <div>
            <h2>Admin</h2>
            <p>
              Download the investment register for {portfolioLabel}, including derived values and
              funding lineage.
            </p>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={onDownloadWorkbook}
            disabled={isDownloadingWorkbook}
          >
            {isDownloadingWorkbook ? 'Preparing export...' : 'Download Excel'}
          </button>
        </div>

        <div className="editor-summary admin-summary">
          <div className="editor-summary-card">
            <span>Total investments</span>
            <strong>{totalInvestments}</strong>
            <small>Includes all records for this portfolio, regardless of financial year.</small>
          </div>
          <div className="editor-summary-card">
            <span>What is included</span>
            <strong>Raw + derived</strong>
            <small>Tenure, payout labels, maturity usage, interest reuse, funding details.</small>
          </div>
          <div className="editor-summary-card">
            <span>Format</span>
            <strong>Excel workbook</strong>
            <small>Downloads as an Excel-readable workbook with investments and summary sheets.</small>
          </div>
        </div>
      </article>
    </section>
  )
}
