export interface AppStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class WebStorage implements AppStorage {
  private prefix = "vibe:";

  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.prefix + key);
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.prefix + key, value);
  }

  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.prefix + key);
  }
}

export const appStorage: AppStorage = new WebStorage();
