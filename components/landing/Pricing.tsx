'use client';

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Book, BookOpen, Sparkles, Star, X, Loader2 } from "lucide-react";
import { TiLocationArrow } from "react-icons/ti";
import { motion, AnimatePresence } from "framer-motion";
import { apiUrl } from "@/lib/api-url";
import { AnimatedTitle } from "./AnimatedTitle";

type TabType = "digital" | "fisik";

type DigitalPackage = {
  id: string;
  name: string;
  pricePerStudent: number;
  minStudents: number;
  features: string[];
  flipbook_enabled: boolean;
  ai_labs_features: string[];
  is_popular: boolean;
};

const AI_FEATURE_LABELS: Record<string, string> = {
  tryon: "Try On",
  pose: "Pose",
  photogroup: "Photo Group",
  phototovideo: "Photo to Video",
  image_remove_bg: "Image Editor",
  flipbook_unlock: "Flipbook",
};

const COVER_OPTIONS = [
  { id: "standard", label: "Standard Hardcover", add: 0 },
  { id: "canvas", label: "Canvas", add: 150000 },
  { id: "premium", label: "Premium 3D Tunnel View", add: 400000 },
] as const;

const PACKAGING_OPTIONS = [
  { id: "none", label: "Tanpa Packaging", add: 0 },
  { id: "tas", label: "Tas Spunbond", add: 25000 },
  { id: "slop", label: "Slop Case Box", add: 35000 },
  { id: "amplop", label: "Amplop Box", add: 45000 },
  { id: "custom", label: "Custom Box", add: 0 },
] as const;

const FOTOGRAFER_OPTIONS = [
  { id: "tidak", label: "Tidak Perlu", add: 0 },
  { id: "basic", label: "Paket Basic (Rp 6.5jt)", add: 6500000 },
  { id: "pro", label: "Paket Pro (Rp 8.3jt)", add: 8300000 },
  { id: "sultan", label: "Paket Sultan (Rp 10.1jt)", add: 10100000 },
] as const;

function formatRupiah(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function normalizeWhatsappForDedupe(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  // International prefix 00xx -> xx
  if (digits.startsWith("00")) return digits.slice(2);
  // Indonesia local variants -> canonical 62xxxx
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return `62${digits}`;
  // Other countries keep digits as-is (e.g. +44 -> 44)
  return digits;
}

export function Pricing() {
  const router = useRouter();
  const [isLanjutLoading, setIsLanjutLoading] = useState(false);
  const [tab, setTab] = useState<TabType>("digital");
  const [digitalPackages, setDigitalPackages] = useState<DigitalPackage[]>([]);
  const [loadingDigital, setLoadingDigital] = useState(true);
  const [selectedDigitalId, setSelectedDigitalId] = useState<string | null>(null);
  /** Untuk paket yang dipilih: addon mana yang di-check (indeks). Hanya addon dengan price > 0 yang opsional. */
  const [selectedAddonIndices, setSelectedAddonIndices] = useState<Record<string, number[]>>({});
  const [activeSwipeIndex, setActiveSwipeIndex] = useState(0);
  const [openAddonPkgId, setOpenAddonPkgId] = useState<string | null>(null);

  const toggleAddon = (pkgId: string, addonIndex: number) => {
    setSelectedAddonIndices((prev) => {
      const current = prev[pkgId] ?? [];
      const has = current.includes(addonIndex);
      const next = has ? current.filter((i) => i !== addonIndex) : [...current, addonIndex].sort((a, b) => a - b);
      return { ...prev, [pkgId]: next };
    });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const index = Math.round(scrollLeft / (container.clientWidth * 0.85));
    if (index !== activeSwipeIndex) {
      setActiveSwipeIndex(index);
    }
  };

  const [jumlahSiswa, setJumlahSiswa] = useState(100);
  const [jumlahKelas, setJumlahKelas] = useState(3);
  const [tebalBuku, setTebalBuku] = useState(102);
  const [cover, setCover] = useState<(typeof COVER_OPTIONS)[number]["id"]>("standard");
  const [packaging, setPackaging] = useState<(typeof PACKAGING_OPTIONS)[number]["id"]>("tas");
  const [videoCinematic, setVideoCinematic] = useState(false);
  const [fotografer, setFotografer] = useState<(typeof FOTOGRAFER_OPTIONS)[number]["id"]>("tidak");
  const [showFisikEstimator, setShowFisikEstimator] = useState(false);
  const [fisikIntro, setFisikIntro] = useState({
    schoolName: "",
    whatsapp: "",
    contactName: "",
  });
  const [fisikIntroError, setFisikIntroError] = useState<string | null>(null);

  const handleLanjutFisik = () => {
    const schoolName = fisikIntro.schoolName.trim();
    const whatsapp = fisikIntro.whatsapp.trim();
    const contactName = fisikIntro.contactName.trim();

    if (!schoolName || !whatsapp || !contactName) {
      setFisikIntroError("Semua field wajib diisi sebelum lanjut ke perhitungan.");
      return;
    }

    const normalizedWhatsapp = whatsapp.replace(/[\s\-().]/g, "");
    const dedupeWhatsappKey = normalizeWhatsappForDedupe(normalizedWhatsapp);
    const isValidWhatsapp = /^\+?[0-9]{9,20}$/.test(normalizedWhatsapp);
    if (!isValidWhatsapp) {
      setFisikIntroError("Format nomor WhatsApp tidak valid. Contoh: 081234567890, 6281234567890, atau +447911123456.");
      return;
    }

    setFisikIntroError(null);
    try {
      const sentKey = `landing:fisik:intro:sent:wa:${dedupeWhatsappKey || normalizedWhatsapp}`;
      const alreadySent = localStorage.getItem(sentKey) === "1";
      if (!alreadySent) {
        localStorage.setItem(sentKey, "1");
        void fetch(apiUrl("/api/landing/physical-intro-notify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schoolName, whatsapp: normalizedWhatsapp, contactName }),
          keepalive: true,
        }).catch(() => {
          localStorage.removeItem(sentKey);
        });
      }
    } catch {
      // If storage is unavailable, continue UX and still try sending once.
      void fetch(apiUrl("/api/landing/physical-intro-notify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolName, whatsapp: normalizedWhatsapp, contactName }),
        keepalive: true,
      }).catch(() => {});
    }
    
    setShowFisikEstimator(true);
  };

  const handleAmbilPenawaran = async () => {
    try {
      // Get cover and packaging labels
      const coverLabel = COVER_OPTIONS.find((c) => c.id === cover)?.label || cover;
      const packagingLabel = PACKAGING_OPTIONS.find((p) => p.id === packaging)?.label || packaging;
      const fotograferLabel = FOTOGRAFER_OPTIONS.find((f) => f.id === fotografer)?.label || fotografer;

      // Build message
      const messageLines = [
        "Halo, saya mau tanya tentang phygital untuk angkatan.",
        "",
        "*Data Pengirim*",
        `Sekolah: ${fisikIntro.schoolName}`,
        `Nama Panitia: ${fisikIntro.contactName}`,
        `WhatsApp: ${fisikIntro.whatsapp}`,
        "",
        "*Estimasi Budget Angkatan*",
        "",
        `Siswa: ${jumlahSiswa}`,
        `Kelas: ${jumlahKelas}`,
        `Tebal Buku: ${tebalBuku} Halaman`,
        "",
        `Tipe Cover: ${coverLabel}`,
        `Packaging: ${packagingLabel}`,
        "",
        "*Add-ons & Services*",
        videoCinematic ? "- Video Cinematic: Ya (Start from Rp 5.000.000)" : "- Video Cinematic: Tidak",
        `- Fotografer: ${fotograferLabel}`,
        "",
        `Estimasi Per Siswa: ${formatRupiah(estimasi.perSiswa)}`,
        `Estimasi Total: ${formatRupiah(estimasi.perSiswa * jumlahSiswa)}`,
        "",
        "Bisa bantu saya dengan penawaran lengkapnya?",
      ];
      const message = messageLines.join("\n");

      const configRes = await fetch(apiUrl("/api/landing/config"));
      if (configRes.ok) {
        const config = (await configRes.json().catch(() => ({}))) as { target?: string };
        const target = config.target?.trim();
        if (target) {
          // Open WhatsApp with pre-filled message
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/${target}?text=${encodedMessage}`, "_blank");
        }
      }
    } catch {
      // Silently fail if config fetch fails
    }
  };

  useEffect(() => {
    fetch(apiUrl("/api/pricing"))
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data.map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ""),
            name: String(p.name ?? ""),
            pricePerStudent: Number(p.price_per_student ?? p.pricePerStudent ?? 0),
            minStudents: Number(p.min_students ?? p.minStudents ?? 100),
            features: Array.isArray(p.features) ? p.features.map(String) : [],
            flipbook_enabled: !!p.flipbook_enabled,
            ai_labs_features: Array.isArray(p.ai_labs_features) ? p.ai_labs_features.map(String) : [],
            is_popular: !!p.is_popular,
          }));
          normalized.sort((a, b) => a.pricePerStudent - b.pricePerStudent);
          setDigitalPackages(normalized);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDigital(false));
  }, []);

  const estimasi = useMemo(() => {
    const coverOpt = COVER_OPTIONS.find((c) => c.id === cover)!;
    const packOpt = PACKAGING_OPTIONS.find((p) => p.id === packaging)!;
    const fotograferOpt = FOTOGRAFER_OPTIONS.find((f) => f.id === fotografer)!;
    
    // Base cost per book
    const basePrice = 254000;
    const coverPackSubtotal = coverOpt.add + packOpt.add;
    
    // Thickness adjustment (tebalBuku affects print cost)
    // Assuming base is ~102 pages, adjust from there
    const thicknessAdjustment = Math.max(0, (tebalBuku - 102) * 1000); // Rp1000 per page difference
    
    // Shared costs (per siswa, divided by number of students)
    let sharedCost = 0;
    if (videoCinematic) sharedCost += 5000000;
    sharedCost += fotograferOpt.add; // Fotografer cost shared by all students
    const sharedPerStudent = sharedCost / Math.max(1, jumlahSiswa);
    
    // Cashback
    const cashback = 29000;
    
    // Per student calculation
    const perSiswa = Math.round(
      basePrice + 
      thicknessAdjustment + 
      (coverPackSubtotal / Math.max(1, jumlahSiswa)) + 
      sharedPerStudent - 
      cashback
    );
    
    return {
      printBinding: basePrice,
      thicknessAdjustment: Math.round(thicknessAdjustment),
      coverPack: Math.round(coverPackSubtotal / Math.max(1, jumlahSiswa)),
      sharedCost: Math.round(sharedPerStudent),
      cashback,
      perSiswa: Math.max(0, perSiswa),
    };
  }, [cover, packaging, videoCinematic, fotografer, tebalBuku, jumlahSiswa]);

  return (
    <section id="pricing" className="w-full bg-slate-100 dark:bg-[#0a0c37] py-16 md:py-24 transition-colors duration-500">
      <div className="container mx-auto px-4 md:px-8">
        <div className="text-center sm:text-left mb-12 sm:mb-16">
          <p className="font-general text-[10px] sm:text-xs uppercase tracking-[0.2em] text-lime-600 dark:text-lime-400 font-black mb-3">
            Pricing
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
            Harga Jujur <br className="hidden sm:block" /><span className="text-cyan-500">Sejak Awal.</span>
          </h2>
          <p className="mt-4 sm:mt-6 text-sm sm:text-base font-medium text-slate-600 dark:text-slate-400 max-w-2xl mx-auto sm:mx-0">
            Investasi transparan untuk kenangan abadi, tanpa biaya siluman.
          </p>
        </div>

        {/* Tab: Digital | Fisik */}
        <div className="flex justify-center mb-10">
          <div className="relative flex items-center rounded-xl border border-slate-900 bg-white dark:bg-[#0d1148]/80 p-1 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow">
            <button
              type="button"
              onClick={() => setTab("digital")}
              className={`relative px-4 sm:px-8 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-black uppercase tracking-wider transition-colors duration-200 z-10 ${
                tab === "digital"
                  ? "text-slate-900"
                  : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab === "digital" && (
                <motion.div
                  layoutId="pricing-active-tab"
                  className="absolute inset-0 bg-lime-500 rounded-lg border border-slate-900 dark:border-white"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-20">Smart Digital</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("fisik")}
              className={`relative px-4 sm:px-8 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-black uppercase tracking-wider transition-colors duration-200 z-10 ${
                tab === "fisik"
                  ? "text-slate-900"
                  : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab === "fisik" && (
                <motion.div
                  layoutId="pricing-active-tab"
                  className="absolute inset-0 bg-lime-500 rounded-lg border border-slate-900 dark:border-white"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-20">Phygital</span>
            </button>
          </div>
        </div>

        {/* Digital: paket dari API */}
        {tab === "digital" && (
          <div className="mx-auto max-w-6xl">
            {loadingDigital ? (
              <div className="flex justify-center py-16">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
              </div>
            ) : digitalPackages.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#141414] p-12 text-center text-white/70">
                Belum ada paket Smart Digital. Cek lagi nanti.
              </div>
            ) : (
              <>
              <div 
                onScroll={handleScroll}
                className="flex items-stretch overflow-x-auto gap-6 pt-6 pb-8 snap-x no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pt-0 sm:pb-0 sm:snap-none px-4 sm:px-0"
              >
                {digitalPackages.map((pkg) => {
                  const parsedFeatures = pkg.features.map((f) => {
                    try {
                      const j = JSON.parse(f);
                      return { name: j.name || f, price: Number(j.price) || 0 };
                    } catch {
                      return { name: f, price: 0 };
                    }
                  });
                  const n = pkg.minStudents;
                  const isSelected = selectedDigitalId === pkg.id;
                  const chosenAddons = selectedAddonIndices[pkg.id] ?? [];
                  const addonsTotal = chosenAddons.reduce((sum, idx) => sum + (parsedFeatures[idx]?.price ?? 0), 0);
                  const totalPerStudent = pkg.pricePerStudent + addonsTotal;
                  return (
                    <div key={pkg.id} className="flex min-w-[85%] sm:min-w-0 sm:w-full flex-col snap-center sm:snap-align-none">
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDigitalId(isSelected ? null : pkg.id);
                          }
                        }}
                        onClick={() => setSelectedDigitalId(isSelected ? null : pkg.id)}
                        className={`relative w-full h-full rounded-[1.5rem] sm:rounded-[2rem] border-2 p-6 sm:p-8 text-left transition-all duration-300 focus:outline-none flex flex-col ${
                          isSelected
                            ? "border-slate-900 dark:border-white bg-lime-400/10 shadow-none translate-x-[3px] translate-y-[3px]"
                            : "border-slate-900 dark:border-[#5cecff]/20 bg-white dark:bg-[#0d1148]/80 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1"
                        }`}
                      >
                      {isSelected && (
                        <span className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border-2 border-lime-400 bg-lime-400/20">
                          <Check className="h-5 w-5 text-lime-400" strokeWidth={3} />
                        </span>
                      )}
                      {pkg.is_popular && !isSelected && (
                        <span className="absolute -top-3 right-4 flex items-center gap-1 rounded-full border border-lime-400/60 bg-slate-950 px-3 py-1 text-xs font-bold uppercase text-lime-400">
                          <Star className="h-3.5 w-3.5 fill-lime-400" />
                          Popular
                        </span>
                      )}
                      <div className="flex-grow flex flex-col">
                        <div className="mb-4 pr-10">
                          <h4 className="font-general text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                            {pkg.name}
                          </h4>
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-white/50 uppercase tracking-wider">Harga dasar</p>
                        <p className="text-3xl font-black text-slate-900 dark:text-white">
                          {formatRupiah(pkg.pricePerStudent)}
                          <span className="text-sm font-bold text-slate-500 dark:text-white/60">
                            /siswa
                          </span>
                        </p>
                        <ul className="mt-6 space-y-2 pt-1">
                          {parsedFeatures.filter((p) => p.price === 0).map((parsed, idx) => (
                            <li key={idx} className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-white/80">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-900 bg-lime-400 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm">
                                <Check className="h-3 w-3 text-slate-900" strokeWidth={4} />
                              </div>
                              <span>{parsed.name}</span>
                            </li>
                          ))}
                        </ul>
                        {(pkg.flipbook_enabled || pkg.ai_labs_features.length > 0) && (
                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                            <p className="text-[11px] font-black text-slate-500 dark:text-white/50 uppercase tracking-widest mb-3">Termasuk</p>
                            <div className="flex flex-wrap gap-2">
                              {pkg.flipbook_enabled &&
                                !pkg.ai_labs_features.includes("flipbook_unlock") && (
                                  <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 dark:border-amber-300 bg-amber-300 dark:bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-950 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm">
                                    <Book className="h-3 w-3" /> Flipbook
                                  </span>
                                )}
                              {pkg.ai_labs_features.map((slug) => (
                                <span
                                  key={slug}
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0_0_#334155] ${
                                    slug === "flipbook_unlock"
                                      ? "border border-amber-700 dark:border-amber-300 bg-amber-300 dark:bg-amber-400 text-amber-950 dark:shadow-neo-glow-sm"
                                      : "border border-slate-900 dark:border-white bg-cyan-400 text-slate-900 dark:shadow-neo-glow-sm"
                                  }`}
                                >
                                  {slug === "flipbook_unlock" ? (
                                    <Book className="h-3 w-3" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  {AI_FEATURE_LABELS[slug] ?? slug}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {parsedFeatures.some((p) => p.price > 0) && (
                          <div className="mt-auto pt-4 border-t border-slate-100 dark:border-white/10 group/addon">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[11px] font-black text-slate-500 dark:text-white/50 uppercase tracking-widest">Addon</p>
                              {chosenAddons.length > 0 && (
                                <span className="bg-lime-500 text-black text-[9px] px-2 py-0.5 rounded-full font-black shadow-[1px_1px_0_0_#000]">
                                  {chosenAddons.length} Dipilih
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenAddonPkgId(pkg.id);
                              }}
                              className="w-full py-2.5 px-4 rounded-xl border border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-700/50 text-[11px] font-black uppercase text-slate-900 dark:text-white transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm active:translate-x-0 active:translate-y-0 active:shadow-none"
                            >
                              {chosenAddons.length > 0 ? "Ubah Add-on" : "Pilih Add-on"}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-white/10 pt-4 text-sm">
                        <span className="text-slate-500 dark:text-white/60">Harga total per siswa</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatRupiah(totalPerStudent)}
                        </span>
                      </div>
                      <span
                        className={`mt-6 block w-full rounded-xl py-3 border border-slate-900 dark:border-white text-center text-sm font-black uppercase transition-all duration-300 ${
                          isSelected
                            ? "bg-lime-500 text-white dark:text-black shadow-none"
                            : "bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm group-hover:bg-lime-400"
                        }`}
                      >
                        {isSelected ? "Paket dipilih" : "Pilih Paket"}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Mobile Swipe Indicators - Neo Brutalist & Dynamic */}
              <div className="flex justify-center items-center gap-3 mt-4 mb-10 sm:hidden">
                {digitalPackages.map((_, idx) => (
                  <div 
                    key={idx}
                    className={`transition-all duration-300 border border-slate-900 rounded-full ${
                      activeSwipeIndex === idx 
                        ? "h-3 w-10 bg-lime-400 shadow-[2px_2px_0_0_#000]" 
                        : "h-3 w-3 bg-white shadow-[1px_1px_0_0_#000]"
                    }`}
                  />
                ))}
              </div>

              {selectedDigitalId && (
                <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md sm:max-w-none sm:w-max z-[100] flex flex-col sm:flex-row items-center justify-between sm:justify-center gap-3 sm:gap-6 rounded-[2rem] sm:rounded-[2.5rem] border-2 border-slate-900 dark:border-white bg-lime-400 p-5 sm:px-8 sm:py-5 text-center shadow-[2px_2px_0_0_#334155] sm:shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow dark:sm:shadow-neo-glow animate-in slide-in-from-bottom-full duration-300">
                  <button 
                    onClick={() => setSelectedDigitalId(null)}
                    className="absolute top-3 right-3 sm:top-1/2 sm:-translate-y-1/2 sm:right-3 text-slate-900 hover:bg-slate-900/10 rounded-full p-1.5 transition-colors"
                  >
                    <X className="w-5 h-5 sm:w-5 sm:h-5" />
                  </button>
                  <div className="flex-1 text-center pr-6 sm:pr-0">
                    <p className="text-[13px] sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                      🔥 Paket Smart Digital <span className="underline decoration-2">{digitalPackages.find((p) => p.id === selectedDigitalId)?.name}</span> dipilih.
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1">Siap untuk diproses sekarang juga.</p>
                  </div>
                  <button
                    onClick={() => {
                       setIsLanjutLoading(true);
                       router.push("/login?next=/user/showroom");
                    }}
                    disabled={isLanjutLoading}
                    className="group inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl sm:rounded-3xl border-2 sm:border border-slate-900 bg-white px-5 sm:px-8 py-3 sm:py-3.5 text-[11px] sm:text-base font-black text-slate-900 transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[2px_2px_0_0_#334155] active:translate-x-0 active:translate-y-0 active:shadow-none whitespace-nowrap sm:mr-6 disabled:opacity-75 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    {isLanjutLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" strokeWidth={3} /> Memproses...
                      </>
                    ) : (
                      <>
                        Lanjut Sekarang <TiLocationArrow className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                      </>
                    )}
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* Fisik: form awal lalu estimasi budget angkatan */}
        {tab === "fisik" && (
        <>
        {!showFisikEstimator ? (
          <div className="mx-auto max-w-3xl rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-900 dark:border-[#5cecff]/25 bg-white dark:bg-[#0d1148]/90 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow p-5 sm:p-8 md:p-12">
            <h3 className="font-sans text-lg sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2 sm:mb-3 flex items-stretch gap-3">
              <span className="w-2 bg-lime-500 shrink-0 rounded-sm" />
              <div className="flex flex-col py-0.5">
                <span>Data Awal Phygital</span>
                <span className="text-[13px] sm:text-base text-slate-500 dark:text-slate-400 font-bold mt-0.5">(Buku Fisik &amp; Digital)</span>
              </div>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-white/70 mb-6 sm:mb-8">
              Lengkapi data berikut terlebih dulu untuk melanjutkan ke perhitungan estimasi.
            </p>

            <div className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-1.5 sm:mb-2">
                  Nama Sekolah / Organisasi
                </label>
                <input
                  type="text"
                  value={fisikIntro.schoolName}
                  onChange={(e) => {
                    setFisikIntro((prev) => ({ ...prev, schoolName: e.target.value }));
                    if (fisikIntroError) setFisikIntroError(null);
                  }}
                  placeholder="Contoh: SMA Negeri 1 Jakarta"
                  className="w-full rounded-xl border border-slate-900 bg-slate-50 dark:bg-[#131a68] px-3 sm:px-4 py-2.5 sm:py-3 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:shadow-[2px_2px_0_0_#334155] dark:focus-shadow-neo-glow-sm focus:outline-none transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-1.5 sm:mb-2">
                  Nomor WhatsApp
                </label>
                <input
                  type="tel"
                  value={fisikIntro.whatsapp}
                  onChange={(e) => {
                    setFisikIntro((prev) => ({ ...prev, whatsapp: e.target.value }));
                    if (fisikIntroError) setFisikIntroError(null);
                  }}
                  placeholder="Contoh: 081234567890"
                  className="w-full rounded-xl border border-slate-900 bg-slate-50 dark:bg-[#131a68] px-3 sm:px-4 py-2.5 sm:py-3 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:shadow-[2px_2px_0_0_#334155] dark:focus-shadow-neo-glow-sm focus:outline-none transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-1.5 sm:mb-2">
                  Nama Panitia
                </label>
                <input
                  type="text"
                  value={fisikIntro.contactName}
                  onChange={(e) => {
                    setFisikIntro((prev) => ({ ...prev, contactName: e.target.value }));
                    if (fisikIntroError) setFisikIntroError(null);
                  }}
                  placeholder="Contoh: Budi Prasetyo"
                  className="w-full rounded-xl border border-slate-900 dark:border-[#5cecff]/20 bg-slate-50 dark:bg-[#131a68] px-3 sm:px-4 py-2.5 sm:py-3 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:shadow-[2px_2px_0_0_#334155] dark:focus-shadow-neo-glow-sm focus:outline-none transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                />
              </div>

              {fisikIntroError && (
                <p className="text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400">{fisikIntroError}</p>
              )}

              <button
                type="button"
                onClick={handleLanjutFisik}
                className="group w-full rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-900 bg-lime-400 px-5 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-black text-slate-900 transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[2px_2px_0_0_#334155] active:translate-x-0 active:translate-y-0 active:shadow-none"
              >
                Lanjutkan <TiLocationArrow className="inline-block ml-1 sm:ml-2 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        ) : (
        <div className="mx-auto max-w-6xl rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-900 dark:border-[#ff61c6]/25 bg-white dark:bg-[#0d1148]/90 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow p-5 sm:p-8 md:p-12">
          <div className="mb-5 sm:mb-6 rounded-xl border border-cyan-300 dark:border-cyan-500/50 bg-cyan-50 dark:bg-cyan-900/20 p-3 sm:p-4 text-xs sm:text-sm text-cyan-900 dark:text-cyan-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>
              <strong>{fisikIntro.schoolName}</strong> • {fisikIntro.contactName} ({fisikIntro.whatsapp})
            </span>
            <button
              type="button"
              onClick={() => setShowFisikEstimator(false)}
              className="w-fit rounded-lg border border-cyan-700 dark:border-cyan-300 px-2.5 py-1 font-bold hover:bg-cyan-100 dark:hover:bg-cyan-800/40"
            >
              Ubah Data
            </button>
          </div>
          <h3 className="font-sans text-lg sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-6 sm:mb-10 flex items-center gap-3">
            <span className="h-6 sm:h-8 w-2 bg-lime-500" /> Estimasi Budget Angkatan
          </h3>

          <div className="grid gap-6 md:gap-8 lg:grid-cols-[1fr,340px]">
            {/* Left: Input controls */}
            <div className="space-y-4 sm:space-y-6">
              <div className="grid gap-4 sm:gap-6 grid-cols-2">
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1.5 sm:mb-2">
                    <label className="text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90">
                      Siswa
                    </label>
                    <input
                      type="number"
                      value={jumlahSiswa}
                      onChange={(e) => setJumlahSiswa(Number(e.target.value))}
                      className="w-16 bg-transparent border-none text-right focus:outline-none text-[11px] sm:text-sm font-semibold text-lime-600 dark:text-lime-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={500}
                    value={jumlahSiswa}
                    onChange={(e) => setJumlahSiswa(Number(e.target.value))}
                    className="pricing-slider-brutalist w-full h-4 rounded-none appearance-none cursor-pointer bg-slate-200 dark:bg-white/20 border border-slate-900 dark:border-white"
                  />
                </div>
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1.5 sm:mb-2">
                    <label className="text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90">Kelas</label>
                    <input
                      type="number"
                      value={jumlahKelas}
                      onChange={(e) => setJumlahKelas(Number(e.target.value))}
                      className="w-12 bg-transparent border-none text-right focus:outline-none text-[11px] sm:text-sm font-semibold text-lime-600 dark:text-lime-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={jumlahKelas}
                    onChange={(e) => setJumlahKelas(Number(e.target.value))}
                    className="pricing-slider-brutalist w-full h-4 rounded-none appearance-none cursor-pointer bg-slate-200 dark:bg-white/20 border border-slate-900 dark:border-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1.5 sm:mb-2">
                  <label className="text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90">
                    Tebal Buku
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tebalBuku}
                      onChange={(e) => setTebalBuku(Number(e.target.value))}
                      className="w-12 bg-transparent border-none text-right focus:outline-none text-[11px] sm:text-sm font-semibold text-lime-600 dark:text-lime-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] sm:text-sm font-semibold text-lime-600 dark:text-lime-400">
                      Hal
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={4}
                  value={tebalBuku}
                  onChange={(e) => setTebalBuku(Number(e.target.value))}
                  className="pricing-slider-brutalist w-full h-4 rounded-none appearance-none cursor-pointer bg-slate-200 dark:bg-white/20 border border-slate-900 dark:border-white"
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-white/50">*Kelipatan 4 halaman</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-1.5 sm:mb-2">
                    Tipe Cover
                  </label>
                  <select
                    value={cover}
                    onChange={(e) => setCover(e.target.value as typeof cover)}
                    className="w-full rounded-xl border border-slate-900 dark:border-slate-800 bg-slate-50 dark:bg-slate-700/50 px-3 sm:px-4 py-2 sm:py-2.5 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:shadow-[2px_2px_0_0_#334155] dark:focus-shadow-neo-glow-sm focus:outline-none transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                  >
                    {COVER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-1.5 sm:mb-2">
                    Packaging
                  </label>
                  <select
                    value={packaging}
                    onChange={(e) => setPackaging(e.target.value as typeof packaging)}
                    className="w-full rounded-xl border border-slate-900 dark:border-slate-800 bg-slate-50 dark:bg-slate-700/50 px-3 sm:px-4 py-2 sm:py-2.5 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:shadow-[2px_2px_0_0_#334155] dark:focus-shadow-neo-glow-sm focus:outline-none transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                  >
                    {PACKAGING_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-2.5 sm:mb-3">Add-ons &amp; Services</p>
                <div className="space-y-2 sm:space-y-3">
                  <label className="flex items-center justify-between gap-4 cursor-pointer py-0.5 sm:py-1">
                    <span className="flex items-center gap-2 sm:gap-3">
                      <input
                        type="checkbox"
                        checked={videoCinematic}
                        onChange={(e) => setVideoCinematic(e.target.checked)}
                          className="h-5 w-5 sm:h-6 sm:w-6 rounded-none border border-slate-900 dark:border-[#5cecff]/50 bg-white dark:bg-[#131a68] text-lime-500 focus:ring-0 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm checked:bg-lime-500"
                      />
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-white/90">
                        Video Cinematic
                      </span>
                    </span>
                    <span className="text-xs sm:text-sm text-cyan-600 dark:text-cyan-400 font-bold">start from 5jt</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] sm:text-sm font-medium text-slate-700 dark:text-white/90 mb-1.5 sm:mb-2">
                  Fotografer
                </label>
                <select
                  value={fotografer}
                  onChange={(e) => setFotografer(e.target.value as typeof fotografer)}
                  className="w-full rounded-xl border border-slate-900 bg-slate-50 dark:bg-[#131a68] px-3 sm:px-4 py-2 sm:py-2.5 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:shadow-[2px_2px_0_0_#334155] dark:focus-shadow-neo-glow-sm focus:outline-none transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                >
                  {FOTOGRAFER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: Cost summary */}
            <div className="lg:border-l border-slate-100 dark:border-white/10 lg:pl-8 space-y-4 sm:space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[11px] sm:text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-white/90">
                  Estimasi Per Siswa
                </h4>
                <span className="rounded-md border border-slate-900 dark:border-white/30 bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-white">
                  Live
                </span>
              </div>

              <p className="text-xl sm:text-4xl font-bold text-lime-600 dark:text-lime-400">
                {formatRupiah(estimasi.perSiswa)}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-white/50">
                *Harga final bisa berubah sesuai negosiasi.
              </p>

              <div className="space-y-1.5 sm:space-y-2 text-[12px] sm:text-sm">
                <div className="flex justify-between text-slate-600 dark:text-white/80">
                  <span>Print &amp; Binding:</span>
                  <span>{formatRupiah(estimasi.printBinding)}</span>
                </div>
                {estimasi.thicknessAdjustment > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-white/80">
                    <span>Adj. Tebal Buku:</span>
                    <span>+{formatRupiah(estimasi.thicknessAdjustment)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-white/80">
                  <span>Cover &amp; Pack:</span>
                  <span>{formatRupiah(estimasi.coverPack)}</span>
                </div>
                <div className="flex justify-between text-cyan-600 dark:text-cyan-400/90 font-medium">
                  <span>Add-ons (Video + Fotografer):</span>
                  <span>{formatRupiah(estimasi.sharedCost)}</span>
                </div>
                <div className="flex justify-between text-lime-600 dark:text-lime-400 font-bold">
                  <span>Cashback:</span>
                  <span>-{formatRupiah(estimasi.cashback)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-lime-300 dark:border-lime-500/30 bg-lime-100 dark:bg-lime-950/30 p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-lime-800 dark:text-lime-400 font-bold flex items-start gap-2">
                  <Check className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" strokeWidth={3} />
                  <span>
                    Paket ini <strong>sudah mencakup AR LivePhoto</strong> secara gratis! 😎
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={handleAmbilPenawaran}
                className="group w-full rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-900 bg-lime-400 px-5 sm:px-8 py-3.5 sm:py-5 text-base sm:text-xl font-black text-slate-900 transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[2px_2px_0_0_#334155] active:translate-x-0 active:translate-y-0 active:shadow-none"
              >
                Ambil Penawaran <TiLocationArrow className="inline-block ml-1 sm:ml-2 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
        )}
        </>
        )}
      </div>
      {/* Modal Add-on Digital */}
      <AnimatePresence>
        {openAddonPkgId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenAddonPkgId(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-[#0d1148] border-2 border-slate-900 dark:border-[#5cecff]/50 p-6 sm:p-8 rounded-[2rem] shadow-[8px_8px_0_0_#000] dark:shadow-neo-glow"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-general text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Pilih Add-on
                </h3>
                <button
                  onClick={() => setOpenAddonPkgId(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-900 dark:text-white"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-3 pb-6 custom-scrollbar">
                {(() => {
                  const pkg = digitalPackages.find(p => p.id === openAddonPkgId);
                  if (!pkg) return null;
                  const parsedFeatures = pkg.features.map((f) => {
                    try {
                      const j = JSON.parse(f);
                      return { name: j.name || f, price: Number(j.price) || 0 };
                    } catch {
                      return { name: f, price: 0 };
                    }
                  });
                  const chosenAddons = selectedAddonIndices[pkg.id] ?? [];

                  return parsedFeatures.map((parsed, i) => {
                    if (parsed.price === 0) return null;
                    const checked = chosenAddons.includes(i);
                    return (
                      <label
                        key={i}
                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                          checked
                            ? "border-slate-900 dark:border-white bg-lime-400/10 shadow-none translate-x-[2px] translate-y-[2px]"
                            : "border-slate-900 dark:border-[#ff61c6]/20 bg-slate-50 dark:bg-[#131a68]/50 hover:border-slate-400 shadow-[2px_2px_0_0_#334155] dark:shadow-neo-glow-sm"
                        }`}
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAddon(pkg.id, i)}
                            className="sr-only"
                          />
                          <div className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                            checked ? "bg-lime-500 border-slate-900 dark:border-white" : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600"
                          }`}>
                            {checked && <Check className="h-4 w-4 text-slate-900" strokeWidth={4} />}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-slate-900 dark:text-white uppercase leading-tight">{parsed.name}</p>
                          <p className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 mt-1">+{formatRupiah(parsed.price)}</p>
                        </div>
                      </label>
                    );
                  });
                })()}
              </div>

              <button
                onClick={() => setOpenAddonPkgId(null)}
                className="mt-8 w-full py-4 rounded-2xl border-2 border-slate-900 bg-lime-400 text-slate-900 font-black uppercase tracking-widest shadow-[2px_2px_0_0_#000] dark:shadow-neo-glow-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                Selesai
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}







