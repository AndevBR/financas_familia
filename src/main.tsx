import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ensureSeed, syncRecurrences } from './services/finance';
import { db } from './db/database';
import { pruneOrphanAttachments } from './services/attachments';
import './ui/styles.css';

async function boot() {
  await ensureSeed();
  await syncRecurrences();
  await pruneOrphanAttachments().catch(() => undefined);
  // pede ao navegador para não apagar os dados em caso de pouco espaço
  navigator.storage?.persist?.().catch(() => undefined);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('root')!.innerHTML = `<div style="padding:24px;font-family:sans-serif">Não foi possível abrir o banco de dados local: ${String(e?.message ?? e)}</div>`;
});

// exposto para depuração no console do navegador
(window as unknown as { financeDb: typeof db }).financeDb = db;
