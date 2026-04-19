import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import HeroSection from "@/components/blocks/hero-section";
import Portfolio from "@/components/blocks/portfolio";
import LatestChanges from "@/components/blocks/latest-changes";
import Footer from "@/components/layout/footer";
import FAQ from "@/components/blocks/faq";
import FeatureShowcase from "@/components/blocks/feature-showcase";
import ReadyDownload from "@/components/blocks/ready-download";

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


const faqItems = [
  {
    question: "Is Atmos free and open source?",
    answer: "Yes. Atmos is fully open source under the MIT license. You can download it for free, self-host it, or build from source."
  },
  {
    question: "Will I lose my terminal sessions if Atmos crashes?",
    answer: "No. All terminal sessions are backed by tmux and persist independently of Atmos. If the app crashes or you close it, your sessions keep running and can be reattached when you return."
  },
  {
    question: "Can multiple agents work in parallel?",
    answer: "Yes. Atmos uses Git worktree isolation to give each agent its own independent workspace. Multiple agents can run side-by-side without interfering with each other's file changes."
  }
]

function LandingContent() {
  const t = useTranslations("landing");

  return (
    <div className="min-h-screen font-sans transition-colors duration-300">
      <main className='relative flex flex-col overflow-x-clip *:scroll-mt-15.5'>
        <HeroSection />
        <FeatureShowcase />
        <LatestChanges />
        <FAQ faqItems={faqItems} />
        <ReadyDownload />
      </main>
      <Footer />
    </div>
  );
}
