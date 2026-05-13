'use client';

import { useEffect, useRef, useState, useContext } from "react";
import { Sun, MoonStar, Menu, X, LogIn, LayoutDashboard, Volume2, VolumeX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TiLocationArrow } from "react-icons/ti";
import Link from "next/link";
import { NAV_ITEMS } from "./constants";
import { cn } from "@/lib/utils";
import { ThemeContext } from "@/app/providers/ThemeProvider";
import { onAuthChange, type AuthUser } from "@/lib/auth-client";
import { fetchWithAuth } from "@/lib/api-client";

function getClientOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

function dashboardUrlForRole(role: "admin" | "user"): string {
  const origin = getClientOrigin();
  return `${origin}${role === "admin" ? "/admin" : "/user"}`;
}

export function Navbar() {
  const navContainerRef = useRef<HTMLDivElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const wasAudioPlayingRef = useRef(false);
  const theme = useContext(ThemeContext);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isIndicatorActive, setIsIndicatorActive] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [isResolvingDashboard, setIsResolvingDashboard] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    fetch("/api/audio")
      .then((res) => res.ok ? res.json() : { files: [] })
      .then((data: { files?: string[] }) => {
        const files = data?.files ?? [];
        if (files.length > 0) {
          setAudioFiles(files);
        }
      })
      .catch(() => { });
  }, []);

  const audioSrc = audioFiles[currentTrackIndex] ?? null;

  const toggleAudioIndicator = () => {
    setIsAudioPlaying((p) => !p);
    setIsIndicatorActive((p) => !p);
  };

  const handleTrackEnded = () => {
    if (audioFiles.length === 0) return;
    setCurrentTrackIndex((prev) => (prev + 1) % audioFiles.length);
  };

  useEffect(() => {
    setMounted(true);

    const unsub = onAuthChange(async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        return;
      }
      try {
        const res = await fetchWithAuth('/api/user/bootstrap');
        const data = (await res.json().catch(() => ({}))) as any;
        setRole(data?.me?.role === 'admin' ? 'admin' : 'user');
      } catch {
        setRole('user');
      }
    });

    return () => unsub();
  }, []);



  useEffect(() => {
    if (isAudioPlaying) void audioElementRef.current?.play();
    else audioElementRef.current?.pause();
  }, [isAudioPlaying, audioSrc]);

  useEffect(() => {
    const handlePauseAudio = () => {
      if (isAudioPlaying) {
        wasAudioPlayingRef.current = true;
        setIsAudioPlaying(false);
        setIsIndicatorActive(false);
      }
    };
    const handleResumeAudio = () => {
      if (wasAudioPlayingRef.current) {
        wasAudioPlayingRef.current = false;
        setIsAudioPlaying(true);
        setIsIndicatorActive(true);
      }
    };
    window.addEventListener('pause-navbar-audio', handlePauseAudio);
    window.addEventListener('resume-navbar-audio', handleResumeAudio);
    return () => {
      window.removeEventListener('pause-navbar-audio', handlePauseAudio);
      window.removeEventListener('resume-navbar-audio', handleResumeAudio);
    };
  }, [isAudioPlaying]);

  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio) return;
    audio.addEventListener("ended", handleTrackEnded);
    return () => audio.removeEventListener("ended", handleTrackEnded);
  }, [audioFiles]);

  useEffect(() => {
    if (isAudioPlaying && audioElementRef.current) {
      audioElementRef.current.play().catch(() => { });
    }
  }, [currentTrackIndex, isAudioPlaying]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 5);
      
      // Hitung section yang sedang aktif (scroll-spy)
      const sections = document.querySelectorAll("section[id]");
      let current = "";
      
      sections.forEach((section) => {
        const sectionTop = section.getBoundingClientRect().top;
        if (sectionTop <= 350) {
          current = section.getAttribute("id") || "";
        }
      });
      
      setActiveSection(current);
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Trigger sekali saat mount
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  const handleDashboardClick = async () => {
    if (!user) {
      window.location.assign("/login");
      return;
    }

    if (isResolvingDashboard) return;
    setIsResolvingDashboard(true);
    try {
      let resolvedRole: 'admin' | 'user' = role ?? 'user';
      if (!role) {
        try {
          const res = await fetchWithAuth('/api/user/bootstrap');
          const data = (await res.json().catch(() => ({}))) as any;
          resolvedRole = data?.me?.role === 'admin' ? 'admin' : 'user';
        } catch {
          resolvedRole = 'user';
        }
      }
      if (resolvedRole) setRole(resolvedRole);
      window.location.assign(dashboardUrlForRole(resolvedRole === "admin" ? "admin" : "user"));
    } finally {
      setIsResolvingDashboard(false);
    }
  };

  return (
    <>
      <header
        ref={navContainerRef}
        className={cn(
          "fixed left-4 right-4 top-4 z-[60] h-14 transition-all duration-300 ease-out sm:h-16 rounded-full border border-transparent",
          isScrolled && !isMenuOpen && "floating-nav",
          isMenuOpen && "border-transparent shadow-none !bg-white dark:!bg-[#0a0c37]"
        )}
      >
        <div className="absolute top-1/2 w-full -translate-y-1/2 z-50">
          <nav className="flex size-full items-center justify-between px-4 sm:p-4">
            <div className="flex items-center gap-4 sm:gap-7">
              <a
                href="#hero"
                className={cn(
                  "transition hover:opacity-100 flex items-center",
                  theme?.isDark && "drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]"
                )}
              >
                <img src="/img/logo.webp" alt="Logo" className="w-8 sm:w-10 animate-logo-pulse shrink-0" loading="lazy" />
                <span
                  className={cn(
                    "nav-logo-text font-black text-[9px] xs:text-[10px] md:text-sm tracking-widest uppercase transition-all duration-500 whitespace-nowrap overflow-visible p-1",
                    "opacity-100 w-[70px] xs:w-[110px] md:w-[170px] ml-1.5 xs:ml-2 md:ml-3"
                  )}
                >
                  FRESHCREATIVE.ID
                </span>
              </a>
            </div>

            <div className="flex h-full items-center">
              <div className="hidden lg:flex items-center gap-4 mr-4">
                {NAV_ITEMS.map(({ label, href }) => {
                  const isActive = activeSection === href.replace('#', '');
                  return (
                    <a 
                      key={href} 
                      href={href} 
                      className={cn(
                        "nav-hover-btn !ms-0 text-[13px] uppercase tracking-wider transition-all duration-300",
                        isActive 
                          ? "!font-black !text-lime-600 dark:!text-lime-400 !opacity-100 after:!scale-x-100 after:!origin-bottom-left after:!bg-lime-600 dark:after:!bg-lime-400" 
                          : "font-bold opacity-75 hover:opacity-100"
                      )}
                    >
                      {label}
                    </a>
                  );
                })}
              </div>

              <div className="flex items-center gap-0.5 xs:gap-1 sm:gap-4">
                {!user ? (
                  <Link
                    href="/login"
                    className="hidden lg:inline-flex items-center justify-center gap-2 w-[150px] py-2 bg-yellow-300 text-black font-black text-[13px] uppercase tracking-wide border-2 border-black rounded-full shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#5cecff] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] dark:hover:shadow-[2px_2px_0_0_#ff61c6] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all duration-200"
                  >
                    <LogIn size={14} />
                    <span className="font-general text-[13px] uppercase">Login</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleDashboardClick}
                    disabled={isResolvingDashboard}
                    className="hidden lg:inline-flex items-center justify-center gap-2 w-[150px] py-2 bg-yellow-300 text-black font-black text-[13px] uppercase tracking-wide border-2 border-black rounded-full shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#5cecff] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] dark:hover:shadow-[2px_2px_0_0_#ff61c6] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all duration-200 disabled:opacity-70 disabled:pointer-events-none"
                  >
                    <LayoutDashboard size={14} />
                    <span className="font-general text-[13px] uppercase">Dashboard</span>
                  </button>
                )}
                <button
                  onClick={theme?.toggleTheme}
                  className="md:ml-2 flex items-center justify-center p-1.5 xs:p-2 text-slate-800 dark:text-white transition hover:opacity-100 active:scale-90 rounded-none w-8 h-8 xs:w-10 xs:h-10 overflow-hidden"
                  title="Toggle Theme"
                >
                  <AnimatePresence mode="wait">
                    {mounted &&
                      (theme?.isDark ? (
                        <motion.div
                          key="sun"
                          initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center justify-center"
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            className="sm:size-[20px]"
                            aria-hidden
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="4" fill="currentColor" />
                            <path d="M12 2v2" />
                            <path d="M12 20v2" />
                            <path d="M4.93 4.93l1.41 1.41" />
                            <path d="M17.66 17.66l1.41 1.41" />
                            <path d="M2 12h2" />
                            <path d="M20 12h2" />
                            <path d="M4.93 19.07l1.41-1.41" />
                            <path d="M17.66 6.34l1.41-1.41" />
                          </svg>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="moon"
                          initial={{ opacity: 0, scale: 0.5, rotate: 90 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.5, rotate: -90 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center justify-center"
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            className="sm:size-[20px]"
                            aria-hidden
                            fill="white"
                            stroke="black"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
                          </svg>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </button>

                <button
                  onClick={toggleAudioIndicator}
                  className="flex items-center space-x-0.5 xs:space-x-1 p-1.5 xs:p-2 text-slate-800 dark:text-white transition hover:opacity-100 active:scale-90 rounded-none"
                  title="Play Audio"
                >
                  {audioSrc && (
                    <audio
                      ref={audioElementRef}
                      src={audioSrc}
                      className="hidden"
                      preload="none"
                    />
                  )}
                  {Array(4)
                    .fill("")
                    .map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "indicator-line",
                          isIndicatorActive && "active"
                        )}
                        style={{
                          animationDelay: `${(i + 1) * 0.1}s`,
                          height: isIndicatorActive ? undefined : ['12px', '6px', '10px', '8px'][i]
                        }}
                      />
                    ))}
                </button>
              </div>

              {/* Mobile Menu Toggle Button */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="lg:hidden ml-1 flex items-center p-1.5 xs:p-2 text-slate-800 dark:text-white transition hover:opacity-100 rounded-none"
                aria-label="Toggle Menu"
              >
                {isMenuOpen ? (
                  <X
                    size={24}
                    strokeWidth={2.5}
                    className={cn(
                      "transition-all duration-300",
                      !theme?.isDark ? "text-white [filter:drop-shadow(1px_0_0_#000)_drop-shadow(-1px_0_0_#000)_drop-shadow(0_1px_0_#000)_drop-shadow(0_-1px_0_#000)]" : "text-white"
                    )}
                  />
                ) : (
                  <Menu
                    size={24}
                    strokeWidth={2.5}
                    className={cn(
                      "transition-all duration-300",
                      !theme?.isDark ? "text-white [filter:drop-shadow(1px_0_0_#000)_drop-shadow(-1px_0_0_#000)_drop-shadow(0_1px_0_#000)_drop-shadow(0_-1px_0_#000)]" : "text-white"
                    )}
                  />
                )}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Menu Overlay - outside header to avoid pill containing block */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 bg-white dark:bg-[#0a0c37] lg:hidden flex flex-col items-center justify-center gap-4 pb-12 z-[55] transition-colors duration-300"
          >
            {NAV_ITEMS.map(({ label, href }) => {
              const isActive = activeSection === href.replace('#', '');
              return (
                <a
                  key={href}
                  href={href}
                  className={cn(
                    "text-xs transition-colors py-1.5 uppercase tracking-widest w-full text-center",
                    isActive ? "text-lime-500 font-extrabold" : "font-bold text-slate-900 dark:text-white hover:text-lime-500"
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {label}
                </a>
              );
            })}
            <div className="w-full px-8 mt-4">
              {!user ? (
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 px-7 py-4 bg-yellow-300 text-black font-black text-sm uppercase tracking-wide border-2 border-black rounded-full shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#5cecff] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all duration-200 w-full"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <LogIn size={18} />
                  Login
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    await handleDashboardClick();
                  }}
                  disabled={isResolvingDashboard}
                  className="flex items-center justify-center gap-3 px-7 py-4 bg-yellow-300 text-black font-black text-sm uppercase tracking-wide border-2 border-black rounded-full shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#5cecff] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all duration-200 w-full disabled:opacity-70 disabled:pointer-events-none"
                >
                  <LayoutDashboard size={18} />
                  Dashboard
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}







