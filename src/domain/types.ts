// Modelo de dados do sistema. Valores monetários são sempre inteiros em centavos
// e datas são strings ISO "AAAA-MM-DD" para evitar problemas de fuso horário.

export type ID = string;
export type Cents = number;
export type ISODate = string; // AAAA-MM-DD
export type MonthKey = string; // AAAA-MM

export type TxType = 'despesa' | 'receita';

export type PaymentMethod =
  | 'pix'
  | 'dinheiro'
  | 'debito'
  | 'credito'
  | 'boleto'
  | 'transferencia'
  | 'outro';

export type TxStatus = 'pago' | 'parcial' | 'aberto';

export interface Category {
  id: ID;
  name: string;
  type: TxType;
  color: string;
  /** Gasto essencial (moradia, saúde...) ou passível de redução. */
  essential: boolean;
  order: number;
}

export interface Subcategory {
  id: ID;
  categoryId: ID;
  name: string;
}

export interface Merchant {
  id: ID;
  name: string;
  lastCategoryId?: ID;
  lastSubcategoryId?: ID;
  lastPaymentMethod?: PaymentMethod;
  lastAccountId?: ID;
  lastCardId?: ID;
  usageCount: number;
  lastUsedAt: string;
}

export interface Person {
  id: ID;
  name: string;
}

export type AccountType = 'banco' | 'dinheiro' | 'carteira';

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  initialBalance: Cents;
  color: string;
  archived?: boolean;
}

export interface Card {
  id: ID;
  name: string;
  holderId?: ID;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  color: string;
  defaultAccountId?: ID;
  archived?: boolean;
}

/** Baixa (total ou parcial) de um lançamento. */
export interface Payment {
  id: ID;
  date: ISODate;
  amount: Cents;
  accountId?: ID;
}

export interface Installment {
  groupId: ID;
  number: number;
  total: number;
  totalAmount: Cents;
}

export interface Transaction {
  id: ID;
  type: TxType;
  description: string;
  amount: Cents;
  /** Data de competência / vencimento. */
  date: ISODate;
  categoryId?: ID;
  subcategoryId?: ID;
  merchant?: string;
  paymentMethod: PaymentMethod;
  accountId?: ID;
  cardId?: ID;
  /** Fatura em que a compra no cartão entra (mês de vencimento da fatura). */
  invoiceMonth?: MonthKey;
  personId?: ID;
  payments: Payment[];
  notes?: string;
  recurrenceId?: ID;
  /** Valor estimado (recorrência de valor variável ainda não confirmada). */
  estimated?: boolean;
  installment?: Installment;
  createdAt: string;
}

export interface InvoicePayment {
  id: ID;
  cardId: ID;
  invoiceMonth: MonthKey;
  amount: Cents;
  date: ISODate;
  accountId?: ID;
}

export interface Transfer {
  id: ID;
  fromAccountId: ID;
  toAccountId: ID;
  amount: Cents;
  date: ISODate;
  notes?: string;
}

export type Frequency = 'semanal' | 'mensal' | 'anual';
export type RecurrenceState = 'ativa' | 'pausada' | 'cancelada';

export interface Recurrence {
  id: ID;
  type: TxType;
  description: string;
  amount: Cents;
  variableAmount: boolean;
  frequency: Frequency;
  startDate: ISODate;
  endDate?: ISODate;
  categoryId?: ID;
  subcategoryId?: ID;
  merchant?: string;
  paymentMethod: PaymentMethod;
  accountId?: ID;
  cardId?: ID;
  personId?: ID;
  state: RecurrenceState;
  /** Última data até onde as ocorrências já foram geradas. */
  generatedUntil?: ISODate;
  /** Lançamentos já gerados entram como pagos automaticamente (ex.: débito automático). */
  autoPay?: boolean;
}

export interface Budget {
  id: ID;
  categoryId: ID;
  amount: Cents;
}

/** Comprovante (foto ou PDF) vinculado a um lançamento ou a um pagamento de fatura. */
export interface Attachment {
  id: ID;
  transactionId?: ID;
  paymentId?: ID;
  invoicePaymentId?: ID;
  name: string;
  type: string;
  size: number;
  /** Conteúdo do arquivo (ArrayBuffer é aceito em qualquer navegador e no backup). */
  data: ArrayBuffer;
  createdAt: string;
}

export interface Settings {
  id: 'app';
  theme: 'claro' | 'escuro' | 'sistema';
  familyName?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  banco: 'Conta bancária',
  dinheiro: 'Dinheiro',
  carteira: 'Carteira digital',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  anual: 'Anual',
};
