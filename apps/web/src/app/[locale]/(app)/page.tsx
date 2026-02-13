import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function WelcomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
