// Mounts the "My details" card in a plain page, with a store the test can read.
import { createRoot } from 'react-dom/client';
import { MyDetailsCard } from '@/guide/panel/MyDetailsCard';
import type { StorePort } from '@/shared/ports';

const store: StorePort = {
  async get<T>(key: string) {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  },
  async set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
};

createRoot(document.getElementById('root')!).render(<MyDetailsCard store={store} />);
