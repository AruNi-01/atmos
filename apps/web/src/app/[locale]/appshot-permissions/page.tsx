import { setRequestLocale } from "next-intl/server";
import { AppshotPermissionsWindow } from "@/features/appshot/components/AppshotPermissionsWindow";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AppshotPermissionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AppshotPermissionsWindow />;
}
