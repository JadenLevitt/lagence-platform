import { Link } from "wouter";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-background flex flex-col font-sans selection:bg-black selection:text-white overflow-hidden">
      <header className="px-8 py-6 flex-none flex justify-between items-center bg-transparent relative z-50">
        <Link href="/" className="text-xl tracking-widest font-serif font-medium uppercase hover:opacity-70 transition-opacity">
          L'Agence
        </Link>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {children}
      </main>

      <footer className="px-8 py-4 flex-none text-center text-[10px] text-muted-foreground uppercase tracking-widest opacity-50">
        &copy; 2026 L'Agence / Private Platform
      </footer>
    </div>
  );
}
