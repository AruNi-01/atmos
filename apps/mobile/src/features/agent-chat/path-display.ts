export type PathDisplay = {
  text: string;
  route: null;
};

export function pathDisplay(path: string): PathDisplay {
  return { text: path.trim(), route: null };
}
