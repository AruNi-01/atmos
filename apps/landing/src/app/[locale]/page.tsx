import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import HeroSection from "@/components/blocks/hero-section";
import Portfolio from "@/components/blocks/portfolio";
import Services from "@/components/blocks/services";
import Footer from "@/components/sections/footer";

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

function LandingContent() {
  const t = useTranslations("landing");

  return (
    <div className="min-h-screen bg-background font-sans transition-colors duration-300">
      {/* 
         TODO: Refactor Header to match shadcn template if needed (Craft, Portfolio, Services...) 
         For now, keeping the page structure clean with new blocks.
      */}

      {/* Main Content */}
      <main className='relative flex flex-col overflow-x-clip *:scroll-mt-15.5'>
        <HeroSection avatars={avatars} />
        <Portfolio />
        <Services />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
