export default function Login({ error }) {
  return <main className="login-shell">
    <section className="login-card" aria-labelledby="login-title">
      <p className="eyebrow">CLASSROOM JEOPARDY</p>
      <h1 id="login-title">Welcome</h1>
      <p>Sign in with your school Microsoft account to open the game board.</p>
      {error && <p className="login-error">{error}</p>}
      <a className="microsoft-login" href="/api/auth/login">Sign in with Microsoft</a>
    </section>
  </main>
}
