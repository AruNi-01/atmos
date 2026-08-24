import { setRequestLocale } from "next-intl/server";
import HeroSection from "@/components/blocks/hero-section";
import LatestChanges from "@/components/blocks/latest-changes";
import Footer from "@/components/layout/footer";
import FAQ from "@/components/blocks/faq";
import FeatureShowcase from "@/components/blocks/feature-showcase";
import ReadyDownload from "@/components/blocks/ready-download";
import { resolveDesktopDownloadLinks } from "@/lib/desktop-download-links";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const downloadLinks = await resolveDesktopDownloadLinks();

  return (
    <div className="min-h-screen font-sans">
      <main className='relative flex flex-col overflow-x-clip *:scroll-mt-16 sm:*:scroll-mt-15.5'>
        <HeroSection />
        <FeatureShowcase />
        <LatestChanges />
        <FAQ />
        <ReadyDownload
          downloadLinks={{
            macAppleSilicon: downloadLinks.macAppleSilicon,
            macIntel: downloadLinks.macIntel,
            windows: downloadLinks.windows,
            linux: downloadLinks.linux,
          }}
        />
      </main>
      <Footer />
    </div>
  );
}
