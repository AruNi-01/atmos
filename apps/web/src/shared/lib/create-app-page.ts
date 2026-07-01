type AppPageOptions = {
  title: string;
};

export function createAppPage({ title }: AppPageOptions) {
  const metadata = { title: `${title} – ATMOS` };

  function Page() {
    return null;
  }
  Page.displayName = `${title.replace(/\s+/g, "")}Page`;

  return { metadata, Page };
}
