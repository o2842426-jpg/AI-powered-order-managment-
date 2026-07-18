import { PRODUCT_LOGO_URL, PRODUCT_NAME } from "../lib/brand";
import "./PrivacyPolicyPage.css";

const LAST_UPDATED = "July 18, 2026";
const CONTACT_EMAIL = "privacy@shopiq.me";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "data-collection", label: "Data We Collect" },
  { id: "data-usage", label: "How We Use Data" },
  { id: "data-protection", label: "Data Protection" },
  { id: "third-party", label: "Third-Party Sharing" },
  { id: "retention", label: "Data Retention" },
  { id: "user-rights", label: "Your Rights & Deletion" },
  { id: "contact", label: "Contact Us" },
];

export function PrivacyPolicyPage() {
  return (
    <div className="privacy" dir="ltr" lang="en">
      <div className="privacy__glow" aria-hidden="true" />

      <header className="privacy__header">
        <div className="privacy__brand">
          <img
            src={PRODUCT_LOGO_URL}
            alt={`${PRODUCT_NAME} logo`}
            className="privacy__logo"
            width="40"
            height="40"
          />
          <span className="privacy__brand-name">{PRODUCT_NAME}</span>
        </div>
        <a className="privacy__home-link" href="/">
          Back to {PRODUCT_NAME}
        </a>
      </header>

      <main className="privacy__main">
        <div className="privacy__hero">
          <p className="privacy__eyebrow">Legal</p>
          <h1 className="privacy__title">Privacy Policy</h1>
          <p className="privacy__subtitle">
            {PRODUCT_NAME} is an AI-powered sales assistant that helps online
            stores manage customer conversations across Instagram and WhatsApp.
            This policy explains what data we collect, why we collect it, and the
            rights you have over your information.
          </p>
          <p className="privacy__updated">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="privacy__layout">
          <nav className="privacy__toc" aria-label="Table of contents">
            <p className="privacy__toc-title">On this page</p>
            <ul>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="privacy__content">
            <section id="overview" className="privacy__section">
              <h2>1. Overview</h2>
              <p>
                This Privacy Policy describes how {PRODUCT_NAME} (&quot;we&quot;,
                &quot;us&quot;, or &quot;our&quot;) collects, uses, stores, and
                protects information when store owners and their customers
                interact with our platform and connected messaging channels
                (Instagram Direct Messages and WhatsApp). By using {PRODUCT_NAME}
                , you agree to the practices described here.
              </p>
            </section>

            <section id="data-collection" className="privacy__section">
              <h2>2. Data We Collect</h2>
              <p>
                We only collect the data necessary to operate the AI sales
                assistant and the store owner dashboard:
              </p>
              <ul className="privacy__list">
                <li>
                  <strong>Instagram &amp; WhatsApp messages:</strong> The content
                  of messages exchanged between a store and its customers,
                  including text, product inquiries, and images sent within the
                  conversation. This is required for the AI to understand and
                  respond to customer requests.
                </li>
                <li>
                  <strong>Customer identity metadata:</strong> Public profile
                  information exposed by the messaging platform, such as the
                  Instagram username or display name and the platform-scoped user
                  ID (IGSID), used to identify the conversation.
                </li>
                <li>
                  <strong>Order details:</strong> Information customers provide to
                  complete a purchase, such as name, phone number, city, and
                  delivery address.
                </li>
                <li>
                  <strong>Store account data:</strong> Business details supplied
                  by the store owner (store name, products, pricing, inventory)
                  and authentication credentials.
                </li>
                <li>
                  <strong>Channel connection tokens:</strong> Encrypted access
                  tokens provided by Meta when a store owner connects an Instagram
                  or WhatsApp account, used solely to send and receive messages on
                  the store&apos;s behalf.
                </li>
              </ul>
            </section>

            <section id="data-usage" className="privacy__section">
              <h2>3. How We Use Data</h2>
              <p>We use the data we collect exclusively to:</p>
              <ul className="privacy__list">
                <li>
                  Generate accurate, real-time AI replies to customer messages on
                  behalf of the connected store.
                </li>
                <li>
                  Recognize returning customers and maintain the context of an
                  ongoing conversation.
                </li>
                <li>
                  Create and manage orders, and display them in the store
                  owner&apos;s dashboard.
                </li>
                <li>
                  Provide store owners with conversation history, analytics, and
                  the ability to take over a chat manually.
                </li>
                <li>
                  Maintain, secure, and improve the reliability of the service.
                </li>
              </ul>
              <p>
                We do <strong>not</strong> use customer messages to train
                third-party public AI models, and we do not use the data for
                advertising or profiling unrelated to the store&apos;s own sales.
              </p>
            </section>

            <section id="data-protection" className="privacy__section">
              <h2>4. Data Protection</h2>
              <p>
                We apply industry-standard safeguards to protect the data
                entrusted to us:
              </p>
              <ul className="privacy__list">
                <li>
                  All data in transit is encrypted using HTTPS/TLS.
                </li>
                <li>
                  Messaging access tokens are stored in encrypted form and are
                  never exposed to the client or to other stores.
                </li>
                <li>
                  Access to stored data is scoped per store, so one store can
                  never read another store&apos;s conversations or customers.
                </li>
                <li>
                  Access to production systems is restricted to authorized
                  personnel on a need-to-know basis.
                </li>
              </ul>
            </section>

            <section id="third-party" className="privacy__section">
              <h2>5. Third-Party Sharing</h2>
              <p className="privacy__callout">
                We do <strong>not</strong> sell, rent, or trade your personal
                data or your customers&apos; data to anyone. Ever.
              </p>
              <p>
                We share data only with the limited service providers required to
                deliver the product, and only to the extent necessary:
              </p>
              <ul className="privacy__list">
                <li>
                  <strong>Meta Platforms (Instagram &amp; WhatsApp):</strong> To
                  send and receive messages through their official APIs.
                </li>
                <li>
                  <strong>AI language model providers:</strong> Message content is
                  sent to a trusted AI provider strictly to generate a reply. It
                  is not used to build advertising profiles.
                </li>
                <li>
                  <strong>Payment processing:</strong> Subscription billing for
                  store owners is handled by a PCI-compliant payment processor. We
                  do not store full card numbers.
                </li>
              </ul>
              <p>
                We may disclose information if required by law or to protect the
                rights, safety, and security of our users and platform.
              </p>
            </section>

            <section id="retention" className="privacy__section">
              <h2>6. Data Retention</h2>
              <p>
                We retain conversation and order data for as long as the store
                account is active and the data is needed to provide the service.
                When data is no longer required, or upon a valid deletion request,
                it is deleted or irreversibly anonymized.
              </p>
            </section>

            <section id="user-rights" className="privacy__section">
              <h2>7. Your Rights &amp; Data Deletion</h2>
              <p>
                You have the right to access, correct, export, or delete your
                personal data. To exercise any of these rights:
              </p>
              <ol className="privacy__steps">
                <li>
                  Send a request to{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the
                  email associated with your account, or ask the store you
                  messaged to forward your request.
                </li>
                <li>
                  Include enough detail to identify your data (for example, your
                  Instagram username or the phone number used in the order).
                </li>
                <li>
                  We will verify the request and permanently delete the associated
                  personal data within <strong>30 days</strong>, and confirm once
                  it is complete.
                </li>
              </ol>
              <p>
                Store owners can also disconnect an Instagram or WhatsApp account
                at any time from the dashboard, which stops all further data
                collection for that channel.
              </p>
            </section>

            <section id="contact" className="privacy__section">
              <h2>8. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or how your
                data is handled, contact us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </p>
            </section>
          </article>
        </div>
      </main>

      <footer className="privacy__footer">
        <span>
          © {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
        </span>
        <a href="/">Return to home</a>
      </footer>
    </div>
  );
}

export default PrivacyPolicyPage;
