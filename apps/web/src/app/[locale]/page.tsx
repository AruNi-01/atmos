import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Header from "@/components/layout/Header";
import LeftSidebar from "@/components/layout/LeftSidebar";
import CenterStage from "@/components/layout/CenterStage";
import RightSidebar from "@/components/layout/RightSidebar";
import { PROJECTS } from "@/constants";
import { TERMINAL_LOGS } from "@/constants";
import { FILE_CHANGES } from "@/constants";
import Footer from "@/components/layout/Footer";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("home");

  return (
    <div className="flex flex-col h-screen">
      <Header />

      <div className="flex-1 flex">
        <LeftSidebar projects={PROJECTS} />
        <CenterStage logs={TERMINAL_LOGS} />
        <RightSidebar changes={FILE_CHANGES} />
      </div>

      <Footer />
    </div>
  );
}
