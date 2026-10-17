import { useRef } from "react";
import { buildWhatsAppUrl, openAssignedWhatsApp, trackAdvisorWhatsApp } from "./whatsapp";
import "./whatsapp-advisor.css";

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3C8.8 3 3 8.6 3 15.5c0 2.4.7 4.7 2 6.7L3.8 29l7-1.8c1.6.8 3.4 1.2 5.2 1.2 7.2 0 13-5.6 13-12.5S23.2 3 16 3Zm0 22.9c-1.7 0-3.3-.4-4.7-1.2l-.4-.2-4.1 1.1.8-4-.3-.4c-1.1-1.7-1.7-3.6-1.7-5.6 0-5.6 4.7-10.1 10.4-10.1s10.4 4.5 10.4 10.1S21.7 25.9 16 25.9Zm5.7-7.6c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.8.2-.2.3-.9 1-.1.2-.2.2-.4.3-.7.1-2-.9-3.3-2.1-4.1-4-.1-.3 0-.5.1-.7.1-.1.3-.4.5-.5.2-.2.2-.3.3-.5.1-.2.1-.4 0-.6-.1-.2-.8-1.8-1.1-2.4-.3-.6-.5-.5-.8-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.6 5.7 5 .8.3 1.5.5 2 .7.8.2 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" />
    </svg>
  );
}

export default function WhatsAppAdvisorLink({ screen, className = "", label = "Hablar con un asesor" }) {
  const assigningRef = useRef(false);

  async function handleClick(event) {
    event.preventDefault();
    if (assigningRef.current) return;
    assigningRef.current = true;
    try {
      const assignment = await openAssignedWhatsApp();
      trackAdvisorWhatsApp(screen, assignment.advisorLine, assignment.fallback);
    } finally {
      assigningRef.current = false;
    }
  }

  return (
    <a
      className={`whatsapp-advisor-cta${className ? ` ${className}` : ""}`}
      href={buildWhatsAppUrl()}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      <WhatsAppIcon />
      <span>{label}</span>
    </a>
  );
}
