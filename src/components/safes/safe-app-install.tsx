"use client";

import { useEffect, useState } from "react";

import styles from "./safe-app-install.module.css";

export function SafeAppInstall() {
  const [appUrl, setAppUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setAppUrl(`${window.location.origin}/safe-app`);
  }, []);

  async function copyAppUrl() {
    if (!appUrl) return;
    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <section className={styles.layout}>
      <div className={styles.intro}>
        <p className="eyebrow">Optional Safe integration</p>
        <h1>Review transactions before anyone signs.</h1>
        <p>
          Add Safe Inspector as a custom app in Safe Global. Safe Global
          supplies the Safe you currently have selected, so there is no second
          account selector and no wallet connection on this page.
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.linkBlock}>
          <span>Safe Inspector app link</span>
          <code>{appUrl || "Preparing app link…"}</code>
          <div className={styles.actions}>
            <button
              className="button"
              disabled={!appUrl}
              onClick={copyAppUrl}
              type="button"
            >
              {copied ? "Copied" : "Copy app link"}
            </button>
            <a
              className="button button-secondary"
              href="https://app.safe.global/"
              rel="noreferrer"
              target="_blank"
            >
              Open Safe Global
            </a>
          </div>
        </div>

        <ol className={styles.steps}>
          <li>
            <span>01</span>
            <div>
              <strong>Select the Safe</strong>
              <p>In Safe Global, choose the Safe account you want to use.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Add the custom app</strong>
              <p>
                Open Apps → My custom apps → Add custom Safe App, then paste the
                link above.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Open Safe Inspector</strong>
              <p>
                The app reads the Safe selected in Safe Global and displays its
                address, network, owners, and signing policy before accepting a
                transaction request.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <aside className={styles.note}>
        <strong>One reusable link</strong>
        <p>
          Use the same Safe Inspector URL for every Safe. The account selected
          in Safe Global is always authoritative; your personal watchlist does
          not choose or override it.
        </p>
      </aside>
    </section>
  );
}
