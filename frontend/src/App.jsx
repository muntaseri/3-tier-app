import { useCallback, useEffect, useState } from "react";

const money = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
});

function App() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: "", description: "", price: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadProducts = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/products");
      if (!response.ok) {
        throw new Error(`Could not load products (HTTP ${response.status}).`);
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The catalogue returned an unexpected response.");
      }
      setProducts(await response.json());
    } catch (requestError) {
      setLoadError(requestError.message || "The catalogue is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function addProduct(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const result = isJson ? await response.json() : null;
      if (!isJson && !response.ok) {
        throw new Error(`Could not add this product (HTTP ${response.status}).`);
      }
      if (!isJson) throw new Error("The server returned an unexpected response.");
      if (!response.ok) throw new Error(result.error || "Could not add this product.");
      setProducts((current) => [result, ...current]);
      setForm({ name: "", description: "", price: "" });
    } catch (requestError) {
      setError(requestError.message || "The product could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ShopLite home">
          <span className="brand-mark">s</span>
          <span>shoplite</span>
        </a>
        <span className="topbar-note">A little shop for everyday</span>
        <span className="cart-count" aria-label={`${products.length} products`}>
          {products.length} items
        </span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">THE GOOD STUFF, ALL IN ONE PLACE</p>
          <h1>Find your next<br /><span>everyday favourite.</span></h1>
          <p className="hero-description">
            Thoughtful picks, fair prices, and a little joy in every delivery.
          </p>
          <a className="shop-link" href="#catalogue">Explore the catalogue <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="art-card art-card-back">GOOD<br />THINGS</div>
          <div className="art-card art-card-front">
            <span className="art-sparkle">✳</span>
            <span>made for<br />your day</span>
          </div>
          <span className="art-caption">CURATED WITH CARE · DHAKA</span>
        </div>
      </section>

      <section className="catalogue-section" id="catalogue">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE SHOP</p>
            <h2>Our catalogue <span className="product-total">({products.length})</span></h2>
          </div>
          <p className="section-caption">Good things, ready to find a home.</p>
        </div>

        {error && <div className="notice error-notice" role="alert">{error}</div>}

        {loading ? (
          <div className="empty-state" aria-live="polite">Loading the good stuff…</div>
        ) : loadError ? (
          <div className="empty-state" role="alert">
            <span className="empty-icon" aria-hidden="true">!</span>
            <h3>Catalogue unavailable</h3>
            <p>{loadError}</p>
            <button
              className="retry-button"
              type="button"
              onClick={() => {
                setLoading(true);
                loadProducts();
              }}
            >
              Try again
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✳</span>
            <h3>A fresh start</h3>
            <p>No products just yet. Add the first item to the catalogue.</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className={`product-card color-${index % 4}`} key={product.id}>
                <div className="product-visual" aria-hidden="true">
                  <span>{product.name.slice(0, 1).toUpperCase()}</span>
                  <span className="visual-spark">✳</span>
                  <span className="visual-label">SHOPLITE<br />SELECT</span>
                </div>
                <div className="product-info">
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.description || "A lovely addition to your day."}</p>
                  </div>
                  <strong>{money.format(Number(product.price))}</strong>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="add-section">
        <div className="add-copy">
          <p className="eyebrow">GROW THE SHOP</p>
          <h2>Have something<br />good to share?</h2>
          <p>Add a product and make it part of the ShopLite collection.</p>
        </div>
        <form className="product-form" onSubmit={addProduct}>
          <label>
            Product name
            <input
              name="name"
              value={form.name}
              onChange={updateField}
              maxLength={120}
              placeholder="e.g. Handwoven tote"
              required
            />
          </label>
          <label>
            Short description <span className="optional">(optional)</span>
            <input
              name="description"
              value={form.description}
              onChange={updateField}
              maxLength={1000}
              placeholder="What makes it special?"
            />
          </label>
          <label>
            Price <span className="currency-hint">BDT</span>
            <input
              name="price"
              type="number"
              value={form.price}
              onChange={updateField}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              required
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Adding product…" : "Add to catalogue"} <span aria-hidden="true">↗</span>
          </button>
        </form>
      </section>

      <footer className="footer">
        <a className="brand footer-brand" href="/">
          <span className="brand-mark">s</span><span>shoplite</span>
        </a>
        <span>Little finds. Big everyday energy.</span>
        <span>Made with care in Dhaka <span aria-hidden="true">♥</span></span>
      </footer>
    </main>
  );
}

export default App;
