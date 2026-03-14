import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import HeroSection from "@/components/blocks/hero-section";
import Portfolio from "@/components/blocks/portfolio";
import Services from "@/components/blocks/services";
import Footer from "@/components/layout/footer";
import FAQ from "@/components/blocks/faq";
import FeatureShowcase from "@/components/blocks/feature-showcase";
import Benefits from "@/components/blocks/benefits";
import { ZapIcon, ChartSplineIcon, FilesIcon } from 'lucide-react';
import AtmosPreview from '@/assets/img/atmos_preview.png';

type Props = {
  params: Promise<{ locale: string }>;
};

// Hero Avatar
const avatars = [
  {
    src: 'https://github.com/shadcn.png',
    fallback: 'OS',
    name: 'Olivia Sparks'
  },
  {
    src: 'https://github.com/shadcn.png',
    fallback: 'HL',
    name: 'Howard Lloyd'
  },
  {
    src: 'https://github.com/shadcn.png',
    fallback: 'HR',
    name: 'Hallie Richards'
  },
  {
    src: 'https://github.com/shadcn.png',
    fallback: 'JW',
    name: 'Jenny Wilson'
  }
]

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <LandingContent />;
}

// ... existing imports

const featuresList = [
  {
    icon: <ZapIcon className='text-primary' />,
    title: 'Unified Operating Surface',
    description: "Manage multiple projects, branches, and workspaces with built-in context, without switching tools.",
    image: AtmosPreview
  },
  {
    icon: <ChartSplineIcon className='text-primary' />,
    title: 'Persistent Terminal Sessions',
    description: "Keep long-lived, tmux-backed terminal sessions that survive refreshes, reconnects, and app restarts.",
    image: AtmosPreview
  },
  {
    icon: <FilesIcon className='text-primary' />,
    title: 'Deep GitHub Integration',
    description: "Manage the full PR lifecycle, AI-assisted commits, and CI operations from the same interface.",
    image: AtmosPreview
  }
]

const faqItems = [
  {
    question: "What is Atmos?",
    answer: "Atmos is an AI-native coding workspace combining a Rust backend, a Next.js web app, and a Tauri desktop shell to keep your full development loop in one place."
  },
  {
    question: "What LLMs or Agents are supported?",
    answer: "Atmos supports custom ACP agents, lightweight LLM providers (OpenAI, Anthropic compatible), and local BYOK config for automation tasks."
  },
  {
    question: "How does terminal orchestration work?",
    answer: "Terminals run on a WebSocket transport backed by tmux. They detach cleanly on close and can be reattached to existing sessions without losing underlying context."
  }
]

function LandingContent() {
  const t = useTranslations("landing");

  return (
    <div className="min-h-screen font-sans transition-colors duration-300">
      <main className='relative flex flex-col overflow-x-clip *:scroll-mt-15.5'>
        <HeroSection />
        <FeatureShowcase />
        <Services />
        <Benefits featuresList={featuresList} />
        <FAQ faqItems={faqItems} />
      </main>
      <Footer />
    </div>
  );
}
