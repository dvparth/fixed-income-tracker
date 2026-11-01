export function PrivacyPolicyView({ themeClass, appHomeUrl, authorLinkedinUrl }) {
  return (
    <div className={`shell ${themeClass}`}>
      <section className="privacy-shell">
        <article className="panel privacy-card">
          <div className="privacy-head">
            <p className="eyebrow">YieldFlow</p>
            <h1>Privacy Policy</h1>
            <p className="privacy-updated">Last updated: 03 May 2026</p>
          </div>

          <div className="privacy-body">
            <section className="privacy-section">
              <h2>What YieldFlow does</h2>
              <p>
                YieldFlow is a financial lifecycle management tool used to track deposits,
                interest receipts, maturity cash, reinvestment decisions, and backup snapshots for
                personal portfolios.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Information used by the application</h2>
              <p>YieldFlow may store the information you enter for managing your portfolio, including:</p>
              <ul className="privacy-list">
                <li>deposit and investment records</li>
                <li>owners, institutions, branches, and instrument types</li>
                <li>cashflow allocations, maturity usage, and notes</li>
                <li>backup files you explicitly download or restore</li>
              </ul>
            </section>

            <section className="privacy-section">
              <h2>Google sign-in</h2>
              <p>
                When you sign in with Google, YieldFlow uses your Google identity for
                authentication. This may include your name, email address, and profile picture so
                the application can recognize your account and portfolio access.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Google Drive backup access</h2>
              <p>
                If you choose the Google Drive backup option, YieldFlow requests permission only
                to create or update backup files that the application manages in your Google Drive.
                Google Drive access is used only when you explicitly select the Drive backup
                feature.
              </p>
            </section>

            <section className="privacy-section">
              <h2>How data is used</h2>
              <p>YieldFlow uses your data only to provide portfolio management capabilities such as:</p>
              <ul className="privacy-list">
                <li>cashflow visibility and interest tracking</li>
                <li>maturity and reinvestment planning</li>
                <li>backup and restore operations</li>
              </ul>
            </section>

            <section className="privacy-section">
              <h2>Data sharing</h2>
              <p>
                YieldFlow does not use your Google Drive access unless you explicitly request a
                backup save to Drive. The application does not use portfolio data for advertising.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Data retention and deletion</h2>
              <p>
                Portfolio records and backup snapshots are retained only to operate the product
                features you use. You can delete portfolio entries in the application and remove
                backup files from your Google Drive at any time. Deleting a local browser profile,
                exported backup file, or Drive backup may permanently remove access to that data.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Security and risk notice</h2>
              <p>
                YieldFlow applies reasonable technical safeguards for authentication and authorized
                access workflows; however, no system can guarantee absolute security against every
                threat. You should protect your Google account, keep independent copies of critical
                records, and promptly revoke access if you suspect unauthorized use.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Policy updates</h2>
              <p>
                This policy may be updated as features or legal requirements change. Material
                updates will be reflected by the "Last updated" date shown on this page.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Contact</h2>
              <p>
                For questions about this policy or data usage, contact Parth Dave at{' '}
                <a href="mailto:parthdave.1984@gmail.com">parthdave.1984@gmail.com</a>.
              </p>
            </section>
          </div>

          <div className="privacy-footer">
            <a className="secondary-btn compact" href={appHomeUrl}>
              Back to YieldFlow
            </a>
            <a
              className="secondary-btn compact ghost-btn"
              href={authorLinkedinUrl}
              target="_blank"
              rel="noreferrer"
            >
              View LinkedIn
            </a>
          </div>
        </article>
      </section>
    </div>
  )
}

export function TermsOfServiceView({ themeClass, appHomeUrl, authorLinkedinUrl }) {
  return (
    <div className={`shell ${themeClass}`}>
      <section className="privacy-shell">
        <article className="panel privacy-card">
          <div className="privacy-head">
            <p className="eyebrow">YieldFlow</p>
            <h1>Terms of Service</h1>
            <p className="privacy-updated">Last updated: 03 May 2026</p>
          </div>

          <div className="privacy-body">
            <section className="privacy-section">
              <h2>Use of YieldFlow</h2>
              <p>
                YieldFlow is a financial lifecycle management application designed to help users
                track deposits, interest receipts, maturity cash, reinvestment activity, and
                portfolio backups. By using the service, you agree to use it only for lawful and
                authorized purposes.
              </p>
            </section>

            <section className="privacy-section">
              <h2>User responsibility</h2>
              <p>
                You are responsible for the accuracy of the financial data you enter into YieldFlow,
                including investment details, maturity values, payout values, tax-related inputs,
                and backup files restored into the application.
              </p>
            </section>

            <section className="privacy-section">
              <h2>No financial advice</h2>
              <p>
                YieldFlow is a tracking and management tool. It does not provide financial,
                investment, tax, or legal advice. Any planning, summaries, or estimates shown in
                the application should be reviewed independently before making financial decisions.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Google services</h2>
              <p>
                If you use Google sign-in or Google Drive backup features, you agree to the
                permissions requested for those features. Google Drive access is used only for the
                backup workflow you explicitly initiate.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Availability and changes</h2>
              <p>
                Features, data formats, and workflows may evolve over time. Backup and restore
                should be used as a safety mechanism, but users should maintain appropriate care for
                their own records and validation processes.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Disclaimer of warranties</h2>
              <p>
                YieldFlow is provided "as is" and "as available." To the maximum extent permitted
                by law, no express or implied warranties are made, including warranties of
                merchantability, fitness for a particular purpose, non-infringement, accuracy,
                availability, or error-free operation.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Limitation of liability</h2>
              <p>
                To the extent permitted by law, YieldFlow and its operator are not liable for any
                indirect, incidental, special, consequential, exemplary, or punitive damages, or
                for loss of profits, revenue, data, goodwill, or business interruption arising from
                use of (or inability to use) the service.
              </p>
            </section>

            <section className="privacy-section">
              <h2>User safeguards and duty to verify</h2>
              <p>
                You are solely responsible for maintaining independent records, verifying all
                calculations and maturity outcomes, and obtaining professional advice before acting
                on any financial or tax information.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Indemnity</h2>
              <p>
                You agree to indemnify and hold harmless the service operator from claims,
                liabilities, damages, losses, and expenses arising from your misuse of the service,
                violation of these terms, or violation of applicable law.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Changes to terms</h2>
              <p>
                These terms may be updated from time to time. Continued use of YieldFlow after
                updates are published constitutes acceptance of the revised terms.
              </p>
            </section>

            <section className="privacy-section">
              <h2>Contact</h2>
              <p>
                For questions about these terms, contact Parth Dave at{' '}
                <a href="mailto:parthdave.1984@gmail.com">parthdave.1984@gmail.com</a>.
              </p>
            </section>
          </div>

          <div className="privacy-footer">
            <a className="secondary-btn compact" href={appHomeUrl}>
              Back to YieldFlow
            </a>
            <a
              className="secondary-btn compact ghost-btn"
              href={authorLinkedinUrl}
              target="_blank"
              rel="noreferrer"
            >
              View LinkedIn
            </a>
          </div>
        </article>
      </section>
    </div>
  )
}
