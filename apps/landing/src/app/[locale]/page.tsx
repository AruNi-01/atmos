import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import HeroSection from "@/components/blocks/hero-section";
import Portfolio from "@/components/blocks/portfolio";
import Services from "@/components/blocks/services";
import Footer from "@/components/sections/footer";
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
    title: 'Fast and Efficient',
    description: "Atmos is built for speed, ensuring your workflow remains uninterrupted and fluid.",
    image: AtmosPreview
  },
  {
    icon: <ChartSplineIcon className='text-primary' />,
    title: 'Insightful Analytics',
    description: "Gain deep insights into your coding habits and project metrics with built-in analytics.",
    image: AtmosPreview
  },
  {
    icon: <FilesIcon className='text-primary' />,
    title: 'Seamless File Management',
    description: "Manage your files across multiple workspaces with ease and precision.",
    image: AtmosPreview
  }
]

const faqItems = [
  {
    question: "What is Atmos?",
    answer: "Atmos is a visual terminal workspace designed to enhance your personal productivity habitat, allowing you to build with any agent."
  },
  {
    question: "Is it open source?",
    answer: "Yes, Atmos is an open-source platform built for developers."
  },
  {
    question: "How do I get started?",
    answer: "Simply click the 'Get Started' button to download the application and follow the setup instructions."
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
