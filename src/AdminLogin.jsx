import { useState } from "react";
import { signInAdmin } from "./adminAuth";
import logo from "./assets/5EBEC563-AD5B-47FB-AFE9-482289C13B90.jpg";

export default function AdminLogin({ onAuthenticated, onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await signInAdmin(email, password);

      if (!result?.session || !result?.admin) {
        throw new Error("No fue posible validar la sesión administrativa.");
      }

      onAuthenticated(result.admin);
    } catch (signInError) {
      const message =
        signInError?.status === 403
          ? "Esta cuenta no tiene permisos de administrador."
          : signInError?.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : signInError?.status === 401
              ? "La sesión no es válida. Verifica tus datos e intenta nuevamente."
            : signInError?.message || "No fue posible iniciar sesión.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login-overlay" onClick={submitting ? undefined : onClose}>
      <style>{`
        .admin-login-overlay, .admin-login-overlay * { box-sizing: border-box; }
        .admin-login-overlay {
          position: fixed;
          inset: 0;
          z-index: 2800;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(47, 41, 39, .62);
          font-family: Arial, sans-serif;
        }
        .admin-login-card {
          width: min(390px, 100%);
          padding: 24px;
          border: 1px solid #eadbd3;
          border-radius: 20px;
          background: #fffdfb;
          color: #2f2927;
          box-shadow: 0 22px 60px rgba(34, 28, 26, .26);
        }
        .admin-login-header {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-bottom: 20px;
        }
        .admin-login-logo {
          width: 50px;
          height: 50px;
          border-radius: 13px;
          object-fit: cover;
        }
        .admin-login-header h2 {
          margin: 0 0 4px;
          font-size: 21px;
        }
        .admin-login-header p {
          margin: 0;
          color: #776a65;
          font-size: 13px;
        }
        .admin-login-close {
          align-self: flex-start;
          margin-left: auto;
          border: 0;
          background: transparent;
          color: #776a65;
          font-size: 25px;
          cursor: pointer;
        }
        .admin-login-form {
          display: grid;
          gap: 13px;
        }
        .admin-login-form label {
          display: grid;
          gap: 6px;
          color: #554a46;
          font-size: 13px;
          font-weight: 700;
        }
        .admin-login-form input {
          width: 100%;
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid #dfd2cb;
          border-radius: 11px;
          background: #fff;
          color: #2f2927;
          font: inherit;
        }
        .admin-login-form input:focus {
          border-color: #a77b6a;
          outline: 2px solid rgba(167, 123, 106, .16);
        }
        .admin-login-error {
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff0ef;
          color: #9a312c;
          font-size: 13px;
        }
        .admin-login-submit {
          min-height: 44px;
          border: 0;
          border-radius: 12px;
          background: #2f2927;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .admin-login-submit:disabled {
          cursor: wait;
          opacity: .65;
        }
      `}</style>

      <div className="admin-login-card" onClick={(event) => event.stopPropagation()}>
        <div className="admin-login-header">
          <img className="admin-login-logo" src={logo} alt="V&A Style" />
          <div>
            <h2>Administración</h2>
            <p>Acceso seguro para el equipo V&A Style</p>
          </div>
          <button
            type="button"
            className="admin-login-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar acceso administrativo"
          >
            ×
          </button>
        </div>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            Correo
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="admin-login-error" role="alert">{error}</p>}

          <button type="submit" className="admin-login-submit" disabled={submitting}>
            {submitting ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
