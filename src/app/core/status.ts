export const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta', inspecao: 'Em inspeção', aguardando_aprovacao: 'Aguardando aprovação',
  execucao: 'Em execução', concluida: 'Concluída', encerrada: 'Encerrada', cancelada: 'Cancelada',
  aprovado: 'Aprovado', recusado: 'Recusado', pendente: 'Pendente', publicado: 'Disponível',
  rascunho: 'Rascunho', expirado: 'Expirado', respondido: 'Respondido', agendado: 'Agendado',
  confirmado: 'Confirmado', cancelado: 'Cancelado', deferido: 'Deferido', indeferido: 'Indeferido',
  em_analise: 'Em análise', resolvido: 'Resolvido', garantia: 'Garantia', normal: 'Normal',
};
export const ROLE_LABELS: Record<string, string> = { gerente: 'Gerente', atendente: 'Atendente', mecanico: 'Mecânico', consultor: 'Consultor técnico', cliente: 'Cliente' };
export function statusLabel(value: string) { return STATUS_LABELS[value] || value; }
