import { setRequestLocale } from "next-intl/server";

type AppPageOptions = {
  title: string;
};

export function createAppPage({ title }: AppPageOptions) {
  const metadata = { title: `${title} – ATMOS` };

  async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return null;
  }

  return { metadata, Page };
}
