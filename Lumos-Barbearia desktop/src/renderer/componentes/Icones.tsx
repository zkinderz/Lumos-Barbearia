import type { SVGProps } from 'react'

/** Ícones próprios (inline SVG): sem dependência de CDN, funcionam offline no desktop. */
type P = SVGProps<SVGSVGElement> & { size?: number }

const base = ({ size = 17, ...p }: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p
})

export const Icone = {
  tesoura: (p: P) => <svg {...base(p)}><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M20 4 8.6 15.4M8 12l-2 2 12 6" /></svg>,
  painel: (p: P) => <svg {...base(p)}><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 7h6V4h-6z" /></svg>,
  agenda: (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>,
  pessoas: (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a3 3 0 1 0-1.6-5.5M18 20a6 6 0 0 0-2-4.2" /></svg>,
  etiqueta: (p: P) => <svg {...base(p)}><path d="M20.6 12.2 12 20.8a2 2 0 0 1-2.8 0L3.2 14a2 2 0 0 1-.6-1.6l.5-6.3A2 2 0 0 1 5.1 4.1l6.3-.5A2 2 0 0 1 13 3.2l7.4 7.4a2 2 0 0 1 .2 1.6z" /><circle cx="8" cy="8" r="1.3" /></svg>,
  ajustes: (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></svg>,
  buscar: (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>,
  mais: (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>,
  check: (p: P) => <svg {...base(p)}><path d="m4 12.5 5 5L20 6.5" /></svg>,
  x: (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  relogio: (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></svg>,
  telefone: (p: P) => <svg {...base(p)}><path d="M5.5 3h3l1.7 4.2-2.1 1.6a13 13 0 0 0 5.6 5.6l1.6-2.1L19.5 16v3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3 7.1 2 2 0 0 1 5 5z" /></svg>,
  dinheiro: (p: P) => <svg {...base(p)}><path d="M12 3v18M16 7.5C16 5.6 14.2 4.5 12 4.5S8 5.6 8 7.5s1.8 2.7 4 3.3 4 1.5 4 3.7-1.8 3-4 3-4-1.1-4-3" /></svg>,
  nuvem: (p: P) => <svg {...base(p)}><path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.6-1.3A4 4 0 0 0 7 18z" /></svg>,
  alerta: (p: P) => <svg {...base(p)}><path d="M12 4.5 21 19H3z" /><path d="M12 10v4M12 16.5v.4" /></svg>,
  baixar: (p: P) => <svg {...base(p)}><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16" /></svg>,
  seta: (p: P) => <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>,
  raio: (p: P) => <svg {...base(p)}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg>
}
