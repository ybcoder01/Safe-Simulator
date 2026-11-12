import Link from "next/link";

const protections = [
  [
    "No signing surface",
    "The app cannot propose, sign, or execute a transaction.",
  ],
  [
    "Independent evidence",
    "Calldata, events, traces, and state diffs are reconciled.",
  ],
  [
    "Unknown stays unknown",
    "Unmapped storage and unverified code are never silently ignored.",
  ],
] as const;

const safeWorkflowSteps = [
  [
    "Copy the app link",
    "Safe Inspector uses one reusable custom-app URL for every Safe.",
  ],
  [
    "Add it in Safe Global",
    "Select a Safe, then paste the link under Apps → My custom apps.",
  ],
  [
    "Review before signing",
    "Connect the transaction source and review its target, protocol, permissions, and recipients.",
  ],
] as const;

const transactionRows = [
  {
    action: "Swap 24,000 USDC → WETH",
    meta: "Nonce 188 · 2 of 3 signed",
    verdict: "Known",
    tone: "known",
  },
  {
    action: "Approve vault to spend USDT",
    meta: "Nonce 189 · 1 of 3 signed",
    verdict: "Review",
    tone: "review",
  },
  {
    action: "Transfer 8.4 WETH",
    meta: "Nonce 187 · Executed 14m ago",
    verdict: "Trusted",
    tone: "trusted",
  },
] as const;

export default function HomePage() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <Link className="brand" href="/" aria-label="Safe Inspector home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <div className="nav-meta">
          <span className="read-only-pill">
            <i aria-hidden="true" /> Read-only by design
          </span>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Transaction intelligence for Safe accounts</p>
          <h1>
            Understand every action <em>before</em> it becomes final.
          </h1>
          <p className="hero-lede">
            Import a Safe, inspect its history, and see exactly what pending
            transactions change—without exposing a signing path.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/safes">
              Inspect a transaction <span aria-hidden="true">→</span>
            </Link>
            <Link className="button button-secondary" href="/use-with-safe">
              Use with Safe
            </Link>
          </div>
          <p className="assurance">
            <span aria-hidden="true">◇</span> Public-chain reads only · No
            wallet signature required
          </p>
        </div>

        <div
          className="hero-visual"
          aria-label="Preview of a Safe transaction dashboard"
        >
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="app-frame">
            <div className="frame-top">
              <div className="frame-dots">
                <i />
                <i />
                <i />
              </div>
              <span>safe.eth</span>
              <span className="live">
                <i /> synced
              </span>
            </div>
            <div className="safe-header">
              <div className="safe-avatar">0×</div>
              <div>
                <small>Treasury Safe</small>
                <strong>0x71C8…9a2F</strong>
              </div>
              <span className="chain">Ethereum</span>
            </div>
            <div className="metric-grid">
              <div>
                <span>Total balance</span>
                <strong>$4.82M</strong>
                <small>+1.8% this week</small>
              </div>
              <div>
                <span>Policy</span>
                <strong>2 of 3</strong>
                <small>v1.4.1 · no guard</small>
              </div>
            </div>
            <div className="queue-title">
              <span>Pending actions</span>
              <b>2 need attention</b>
            </div>
            <div className="transaction-list">
              {transactionRows.map((row) => (
                <div className="tx-row" key={row.meta}>
                  <span className="tx-icon" aria-hidden="true">
                    ↗
                  </span>
                  <div>
                    <strong>{row.action}</strong>
                    <small>{row.meta}</small>
                  </div>
                  <span className={`verdict ${row.tone}`}>{row.verdict}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="safe-workflow shell" id="safe-integration">
        <div className="safe-workflow-heading">
          <div>
            <p className="eyebrow">Optional Safe integration</p>
            <h2>Review transactions before anyone signs.</h2>
          </div>
          <p>
            Add Safe Inspector as a custom app using one link. Safe Global
            supplies the Safe you currently have selected, and Safe Inspector
            reviews the proposed transaction before confirmation.
          </p>
        </div>
        <div className="safe-workflow-grid">
          {safeWorkflowSteps.map(([title, body], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="safe-workflow-cta">
          <Link className="button" href="/use-with-safe">
            Get Safe app link <span aria-hidden="true">→</span>
          </Link>
          <p>
            Safe Inspector never receives a private key and cannot sign a
            transaction.
          </p>
        </div>
        </section>

      <section className="proof shell" id="how-it-works">
        <div className="section-intro">
          <p className="eyebrow">Built for consequential decisions</p>
          <h2>Evidence, not reassurance.</h2>
          <p>
            When analysis is incomplete, Safe Inspector says so. A comforting
            guess is the most dangerous possible result.
          </p>
        </div>
        <div className="protection-grid">
          {protections.map(([title, body], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="safe-workflow shell" aria-labelledby="explore-title">
        <div className="safe-workflow-heading">
          <div>
            <p className="eyebrow">Explore</p>
            <h2 id="explore-title">See the analysis in action.</h2>
          </div>
          <p>
            Open a completed transaction report or explore controlled attack
            scenarios after you understand the main review workflow.
          </p>
        </div>
        <div className="safe-workflow-cta">
          <Link
            className="button"
            href="/safe/50/0x7ae1ef2979b0de85d7dea7f6a5582417d4a98c55/tx/0x0856c4f2890b3828981c29e6e09f4e475c6439ae2045837bcb38900b5249a633"
          >
            Try a live example <span aria-hidden="true">→</span>
          </Link>
          <Link
            className="button button-secondary"
            href="/demo/malicious-transaction"
          >
            Open attack lab
          </Link>
        </div>
      </section>
    </main>
  );
}
