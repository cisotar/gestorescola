export const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

export const COLOR_PALETTE = [
  { bg:'#EFF6FF', bd:'#93C5FD', tx:'#1E3A8A', dt:'#2563EB', tg:'#DBEAFE' },
  { bg:'#F5F3FF', bd:'#C4B5FD', tx:'#4C1D95', dt:'#7C3AED', tg:'#EDE9FE' },
  { bg:'#F0FDF4', bd:'#86EFAC', tx:'#14532D', dt:'#16A34A', tg:'#DCFCE7' },
  { bg:'#FFFBEB', bd:'#FCD34D', tx:'#78350F', dt:'#D97706', tg:'#FEF3C7' },
  { bg:'#FFF1F2', bd:'#FDA4AF', tx:'#881337', dt:'#E11D48', tg:'#FFE4E6' },
  { bg:'#F0FDFA', bd:'#5EEAD4', tx:'#134E4A', dt:'#0D9488', tg:'#CCFBF1' },
  { bg:'#ECFEFF', bd:'#67E8F9', tx:'#164E63', dt:'#0891B2', tg:'#CFFAFE' },
  { bg:'#FFF7ED', bd:'#FDba74', tx:'#7C2D12', dt:'#EA580C', tg:'#FFEDD5' },
  { bg:'#FDF4FF', bd:'#E879F9', tx:'#701A75', dt:'#C026D3', tg:'#FAE8FF' },
  { bg:'#F1F5F9', bd:'#94A3B8', tx:'#1E293B', dt:'#475569', tg:'#E2E8F0' },
]

export const COLOR_NEUTRAL = { bg:'#F9FAFB', bd:'#D1D5DB', tx:'#374151', dt:'#6B7280', tg:'#F3F4F6' }

// ─── Schema de `pending_teachers/{uid}` ───────────────────────────────────
// Documento único por user.uid do Firebase Auth.
// Representa uma solicitação de acesso pendente de aprovação do admin.
//
// {
//   id:          string,              // Firebase user.uid
//   uid:         string,              // Duplicado de id (compatibilidade)
//   email:       string,              // E-mail em minúsculas
//   name:        string,              // Nome do usuário
//   photoURL:    string,              // Avatar (opcional)
//   requestedAt: Timestamp,           // Data de solicitação
//   status:      "pending",           // "pending" | "approved"
//   celular:     string,              // Telefone (opcional, preenchido em PendingPage)
//   apelido:     string,              // Apelido (opcional)
//   subjectIds:  string[],            // IDs de matérias (FK → subjects[].id)
//   profile:     null | "teacher" | "coordinator" | "teacher-coordinator",
//                                     // Perfil atribuído ANTES de aprovação
//                                     // null = admin ainda não selecionou perfil
//   horariosSemana: object,           // Horários presença por dia (opcional)
// }
//
// Valores válidos para `profile`:
// - null (padrão) — admin ainda não atribuiu perfil
// - "teacher"  — Professor regular
// - "coordinator"  — Coordenador pedagógico puro
// - "teacher-coordinator"  — Professor que também coordena
//
// Nota: campo é OPCIONAL e BACKWARD COMPATIBLE. Documentos antigos sem
// `profile` continuam funcionando (approveTeacher() usa default 'teacher').
