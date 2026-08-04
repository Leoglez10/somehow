import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Heart,
  LockKeyhole,
  MessagesSquare,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

const steps = [
  {
    icon: CalendarDays,
    title: "Comparte cuándo puedes",
    description:
      "Marca tus momentos libres. Tus amigos no ven qué tienes en la agenda, solo cuándo estás disponible.",
  },
  {
    icon: UsersRound,
    title: "Encuentren coincidencias",
    description:
      "Somewhen reúne la disponibilidad del grupo y muestra únicamente los días y horarios que funcionan para todos.",
  },
  {
    icon: MessagesSquare,
    title: "Propongan y decidan",
    description:
      "Elijan actividad, lugar y horario. El plan se confirma únicamente cuando cada persona acepta la misma propuesta.",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="landing-main">
      <nav className="topbar landing-topbar" aria-label="Navegación principal">
        <Link className="brand" href="/" aria-current="page" aria-label="Inicio de Somewhen">
          <span className="brand-mark" aria-hidden="true">
            <Heart size={16} fill="currentColor" />
          </span>
          somewhen
        </Link>
        <div className="landing-nav-links">
          <a className="topbar-link landing-info-link" href="#como-funciona">Cómo funciona</a>
          <a className="topbar-cta" href="/app">
            Abrir la app
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </nav>

      <section className="hero landing-hero" aria-labelledby="landing-heading">
        <div className="hero-copy">
          <p className="eyebrow">Tiempo para las personas que quieres</p>
          <h1 id="landing-heading">Hacer planes debería sentirse como algo entre amigos.</h1>
          <p className="hero-lede">
            Encuentren cuándo pueden todos, armen una propuesta y confirmen el
            plan sin exponer sus calendarios personales.
          </p>
          <div className="landing-hero-actions">
            <a className="landing-primary-cta" href="/app">
              Crear un plan
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="text-link" href="#como-funciona">Ver cómo funciona</a>
          </div>
        </div>

        <aside className="week-card" aria-labelledby="your-week-title">
          <div className="card-kicker">
            <span>UNA SEMANA EN COMÚN</span>
            <CalendarDays size={18} aria-hidden="true" />
          </div>
          <h2 id="your-week-title">Hay tiempo para volver a verse.</h2>
          <div className="availability-number">
            <strong>9</strong>
            <span>momentos libres<br />esta semana</span>
          </div>
          <div className="mini-days" aria-label="Ejemplo de disponibilidad de lunes a domingo">
            {[1, 3, 2, 4, 1, 5, 3].map((level, index) => (
              <div className="mini-day" key={index}>
                <span className={`mini-bar mini-bar-${level}`} aria-hidden="true" />
                <small>{["L", "M", "X", "J", "V", "S", "D"][index]}</small>
              </div>
            ))}
          </div>
          <p className="privacy-note">
            <LockKeyhole size={15} aria-hidden="true" />
            Solo se comparte tu disponibilidad, nunca lo que te mantiene ocupado.
          </p>
        </aside>
      </section>

      <section className="landing-explanation" id="como-funciona" aria-labelledby="how-heading">
        <header className="landing-section-heading">
          <p className="eyebrow">Así funciona</p>
          <h2 id="how-heading">Del “hay que vernos” a un plan aceptado por todos.</h2>
          <p>Un recorrido claro para organizarse sin conversaciones interminables.</p>
        </header>

        <ol className="landing-step-list">
          {steps.map(({ icon: Icon, title, description }, index) => (
            <li key={title}>
              <div className="landing-step-icon" aria-hidden="true"><Icon size={22} /></div>
              <span className="landing-step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-privacy" aria-labelledby="privacy-heading">
        <div className="landing-privacy-icon" aria-hidden="true">
          <LockKeyhole size={28} />
        </div>
        <div>
          <p className="eyebrow">Privacidad desde el inicio</p>
          <h2 id="privacy-heading">Tus compromisos siguen siendo tuyos.</h2>
        </div>
        <div className="landing-privacy-copy">
          <p>
            El grupo solo conoce las coincidencias de disponibilidad. No necesita
            ver reuniones, citas ni detalles de tu calendario personal.
          </p>
          <p className="landing-assurance">
            <Check size={17} aria-hidden="true" />
            La propuesta queda sin confirmar hasta que todos aceptan.
          </p>
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="start-heading">
        <CalendarCheck2 size={30} aria-hidden="true" />
        <div>
          <p className="eyebrow">Cuando quieran verse</p>
          <h2 id="start-heading">Empiecen por encontrar un momento.</h2>
        </div>
        <a className="landing-primary-cta" href="/app">
          Ir a la app
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </section>

      <footer>
        <span className="brand footer-brand"><Heart size={14} fill="currentColor" aria-hidden="true" /> somewhen</span>
        <a className="footer-link" href="/app">Abrir la app</a>
      </footer>
    </main>
  );
}
