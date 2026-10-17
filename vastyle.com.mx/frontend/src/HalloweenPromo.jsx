import { useEffect, useRef, useState } from "react";
import "./halloween-promo.css";

const DEFAULT_TEXTS = {
  eyebrow: "HALLOWEEN · EDICIÓN ESPECIAL",
  heading: "Tenemos una sorpresa de Halloween para tu negocio",
  instruction: "Toca el regalo y descubre tu sorpresa.",
  opened: "¡ABRISTE TU REGALO DE BIENVENIDA!",
  benefit: "ENVÍO GRATIS",
  gift: "REGALO SORPRESA",
  description: "En tu primer pedido en V&A Style.",
  button: "QUIERO APROVECHARLO",
  terms: "En zonas extendidas, únicamente se aplica el costo adicional de cobertura.",
  footer: "UN DETALLE PARA TI. UN IMPULSO PARA TU NEGOCIO.",
};

export default function HalloweenPromo({ open, texts = {}, onClose, onClaim }) {
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const closeRef = useRef(null);
  const giftRef = useRef(null);
  const claimRef = useRef(null);
  const timerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const openingRef = useRef(false);
  const openedRef = useRef(opened);
  const copy = { ...DEFAULT_TEXTS, ...texts };

  useEffect(() => { openedRef.current = opened; }, [opened]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const first = closeRef.current;
      const last = openedRef.current ? claimRef.current : giftRef.current;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timerRef.current);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  if (!open) return null;

  function openGift() {
    if (openingRef.current || opened) return;
    openingRef.current = true;
    setOpening(true);
    timerRef.current = window.setTimeout(() => {
      openingRef.current = false;
      setOpening(false);
      setOpened(true);
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 1900);
      window.setTimeout(() => claimRef.current?.focus(), 30);
    }, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 800);
  }

  return (
    <div className="halloween-backdrop">
      <section className={`halloween-promo${opening ? " is-opening" : ""}${opened ? " is-opened" : ""}`} role="dialog" aria-modal="true" aria-labelledby="halloween-title">
        <span className="halloween-web halloween-web--left" aria-hidden="true" />
        <span className="halloween-web halloween-web--right" aria-hidden="true" />
        <span className="halloween-moon" aria-hidden="true" />
        <span className="halloween-specks" aria-hidden="true" />
        <button ref={closeRef} className="halloween-close" type="button" aria-label="Cerrar promoción" onClick={onClose}>×</button>
        <div className="halloween-brand">V&amp;A STYLE</div>
        <div className="halloween-eyebrow">{copy.eyebrow}</div>
        {!opened && <div className="halloween-intro"><h2 id="halloween-title">{copy.heading}</h2><p>{copy.instruction}</p></div>}
        <button ref={giftRef} type="button" className="halloween-gift" aria-label={opened ? "Regalo abierto" : "Abrir regalo de Halloween"} disabled={opening || opened} onClick={openGift}>
          <span className="halloween-halo" />
          <span className="halloween-spark halloween-spark--one">✦</span><span className="halloween-spark halloween-spark--two">✧</span><span className="halloween-spark halloween-spark--three">✦</span>
          <span className="halloween-box"><span className="halloween-ribbon" /><span className="halloween-seal">V&amp;A</span><span className="halloween-pumpkin"><i /><b /></span></span>
          <span className="halloween-lid"><i className="halloween-loop halloween-loop--left" /><i className="halloween-loop halloween-loop--right" /><i className="halloween-knot" /><i className="halloween-lid-ribbon" /></span>
          <span className="halloween-shadow" />
        </button>
        {!opened && <div className="halloween-open-hint">TOCA PARA ABRIR <span>↑</span></div>}
        {opened && <div className="halloween-reveal" aria-live="polite">
          <div className="halloween-unlocked">{copy.opened}</div>
          <h2 id="halloween-title">{copy.benefit}<span>+</span>{copy.gift}</h2>
          <p>{copy.description}</p>
          <button ref={claimRef} type="button" className="halloween-claim" onClick={onClaim}>{copy.button}<span aria-hidden="true">→</span></button>
          <p className="halloween-terms">{copy.terms}</p>
        </div>}
        {!opened && <div className="halloween-spacer" />}
        <div className="halloween-footer">{copy.footer}</div>
        {confetti && <div className="halloween-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ "--dx": `${Math.cos(index * 2.4) * (110 + index % 7 * 20)}px`, "--dy": `${-150 + (index % 12) * 44}px`, "--turn": `${index * 53}deg`, "--particle": ["#ff922f", "#ba8bff", "#ee374f"][index % 3], animationDelay: `${index % 6 * 0.035}s` }} />)}</div>}
      </section>
    </div>
  );
}
