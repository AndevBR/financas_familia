import { db as defaultDb, TABLES, type FinanceDB, type TableName } from '../db/database';

export const BACKUP_FORMAT = 'financas-familia-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export async function exportBackup(db: FinanceDB = defaultDb): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) data[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo de backup inválido.');
  const b = raw as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) throw new Error('Este arquivo não é um backup do Finanças da Família.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('Versão de backup não suportada.');
  if (!b.data || typeof b.data !== 'object') throw new Error('Backup sem dados.');
  for (const t of TABLES) {
    const rows = (b.data as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Tabela "${t}" inválida no backup.`);
    if (Array.isArray(rows) && rows.some((r) => !r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string'))
      throw new Error(`Registros inválidos na tabela "${t}".`);
  }
  return b as BackupFile;
}

/** Substitui todos os dados atuais pelos do backup (operação atômica). */
export async function restoreBackup(raw: unknown, db: FinanceDB = defaultDb): Promise<Record<TableName, number>> {
  const backup = validateBackup(raw);
  const counts = {} as Record<TableName, number>;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = (backup.data[t] ?? []) as object[];
      if (rows.length) await db.table(t).bulkAdd(rows);
      counts[t] = rows.length;
    }
  });
  return counts;
}

/** Apaga absolutamente todos os dados. */
export async function wipeAll(db: FinanceDB = defaultDb): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
}
