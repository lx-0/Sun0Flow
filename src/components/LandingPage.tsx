import Link from "next/link";
import {
  SparklesIcon,
  MusicalNoteIcon,
  BookOpenIcon,
  LightBulbIcon,
  ShareIcon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

// ─────────────────────────────────────────────────────────
// Features data
// ─────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: MusicalNoteIcon,
    title: "AI Music Generation",
    description:
      "Generate full songs, instrumentals, and stems from a text prompt in seconds using the Suno AI engine.",
  },
  {
    icon: BookOpenIcon,
    title: "Library Management",
    description:
      "Organise all your generated tracks into playlists, tag by genre or mood, and find anything instantly.",
  },
  {
    icon: LightBulbIcon,
    title: "Inspiration Feeds",
    description:
      "Browse curated feeds of community tracks to spark new ideas and discover fresh styles.",
  },
  {
    icon: ShareIcon,
    title: "One-click Sharing",
    description:
      "Share any song via a public link or embed player. Control visibility with a single toggle.",
  },
  {
    icon: AdjustmentsHorizontalIcon,
    title: "Presets & Templates",
    description:
      "Save your favourite prompt recipes as reusable presets and templates to speed up your creative workflow.",
  },
  {
    icon: ChartBarIcon,
    title: "Analytics",
    description:
      "Track play counts, listener trends, and top-performing tracks with built-in analytics dashboards.",
  },
];

const BETA_INCLUDES = [
  "AI music generation with Suno",
  "Full library & playlist management",
  "Public sharing & collaboration",
  "Inspiration feeds",
  "Analytics dashboards",
  "No credit card required",
];

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white">
          <SparklesIcon className="w-5 h-5 text-violet-600" />
          SunoFlow
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:inline-flex text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-2"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      {/* Background gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto px-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 mb-6">
          <SparklesIcon className="w-3.5 h-3.5" />
          Free early access — all features included
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6 leading-tight">
          Your personal{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-500">
            AI music
          </span>{" "}
          studio
        </h1>

        <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Generate, manage, and share your AI-crafted music. SunoFlow brings your library,
          inspiration feeds, and creative tools into one seamless workspace.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-lg shadow-violet-600/25"
          >
            Get Started — it&apos;s free
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            Log in
          </Link>
        </div>

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-500">
          Free during beta · No credit card required
        </p>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
            Everything you need to create
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            From generation to sharing, SunoFlow handles every step of your creative workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FreeBetaBanner() {
  return (
    <section id="beta" className="py-20">
      <div className="max-w-3xl mx-auto px-4">
        <div className="rounded-3xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 mb-6">
            <SparklesIcon className="w-3.5 h-3.5" />
            Early Access
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
            Free during beta
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-xl mx-auto">
            SunoFlow is free for all early users. Get full access to every feature — no tiers, no
            limits, no credit card needed.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-md mx-auto mb-10">
            {BETA_INCLUDES.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-lg shadow-violet-600/20"
          >
            Join for free
          </Link>
        </div>
      </div>
    </section>
  );
}

interface SocialProofSectionProps {
  stats: { songs: number; users: number };
}

function SocialProofSection({ stats }: SocialProofSectionProps) {
  return (
    <section className="py-16 bg-gradient-to-r from-violet-600 to-indigo-600">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-10">
          Trusted by creators worldwide
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-12">
          <div>
            <div className="text-5xl font-extrabold text-white mb-2">
              {stats.songs.toLocaleString()}+
            </div>
            <div className="text-violet-200 text-base font-medium">Songs generated</div>
          </div>
          <div>
            <div className="text-5xl font-extrabold text-white mb-2">
              {stats.users.toLocaleString()}+
            </div>
            <div className="text-violet-200 text-base font-medium">Early creators</div>
          </div>
        </div>

        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold bg-white text-violet-700 hover:bg-gray-50 transition-colors shadow-lg"
        >
          Join {stats.users.toLocaleString()}+ early users — it&apos;s free
        </Link>
      </div>
    </section>
  );
}

function FooterSection() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <SparklesIcon className="w-5 h-5 text-violet-600" />
            SunoFlow
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              Privacy
            </Link>
            <a href="mailto:hello@sunoflow.app" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              Contact
            </a>
          </nav>

          <p className="text-xs text-gray-400 dark:text-gray-600">
            © {new Date().getFullYear()} SunoFlow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

interface LandingPageProps {
  stats?: { songs: number; users: number };
}

export function LandingPage({ stats = { songs: 10000, users: 2500 } }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      <NavBar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <FreeBetaBanner />
        <SocialProofSection stats={stats} />
      </main>
      <FooterSection />
    </div>
  );
}
