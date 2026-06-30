type AppPageOptions = {
  title: string;
};

export function createAppPage({ title }: AppPageOptions) {
  const metadata = { title: `${title} – ATMOS` };

  function Page() {
    return null;
  }

  return { metadata, Page };
}
