export function DarkAmbientRays() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden dark:block"
    >
      <div className="absolute inset-y-0 left-0 w-[min(42vw,520px)] bg-gradient-to-r from-white/[0.045] via-white/[0.015] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[min(28vw,320px)] bg-gradient-to-l from-white/[0.03] via-white/[0.01] to-transparent" />
      <div className="absolute left-0 top-14 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute left-1/4 top-0 h-[min(42vh,360px)] w-[min(56vw,720px)] -translate-x-1/4 rounded-full bg-primary/[0.035] blur-3xl" />
    </div>
  );
}