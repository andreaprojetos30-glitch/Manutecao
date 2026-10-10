export type PerfilConta = 'admin' | 'prestador' | null

export type ContaEmail = {
  id: string
  perfil: PerfilConta
  ativo: boolean
  vinculadoAOutro: boolean
}

export type DecisaoAcesso =
  | { tipo: 'sem-login' }
  | { tipo: 'desvincular'; usuarioId: string; podeDesativar: boolean }
  | { tipo: 'manter'; usuarioId: string; reativar: boolean }
  | { tipo: 'vincular'; usuarioId: string }
  | { tipo: 'criar' }
  | { tipo: 'erro'; mensagem: string }

export function credenciaisPrestador(nome: string, whatsapp: string, email: string, senha: string) {
  return {
    email,
    password: senha,
    email_confirm: true as const,
    app_metadata: { perfil: 'prestador' as const },
    user_metadata: { nome, telefone: whatsapp },
  }
}

export function decidirAcessoPrestador(input: {
  acesso: 'sim' | 'nao'
  email: string | null
  usuarioAtual: string | null
  contaEmail: ContaEmail | null
  perfilAtual: PerfilConta | null
}): DecisaoAcesso {
  if (input.acesso === 'nao') {
    if (!input.usuarioAtual) return { tipo: 'sem-login' }
    return {
      tipo: 'desvincular',
      usuarioId: input.usuarioAtual,
      podeDesativar: input.perfilAtual === 'prestador',
    }
  }

  if (!input.email) {
    return { tipo: 'erro', mensagem: 'Informe o e-mail para liberar o acesso ao aplicativo.' }
  }

  const conta = input.contaEmail
  if (conta && conta.perfil !== 'prestador') {
    return { tipo: 'erro', mensagem: 'Este e-mail já está em uso.' }
  }
  if (conta?.vinculadoAOutro) {
    return { tipo: 'erro', mensagem: 'Este e-mail já está vinculado a outro prestador.' }
  }
  if (conta && input.usuarioAtual && conta.id !== input.usuarioAtual) {
    return { tipo: 'erro', mensagem: 'Este e-mail já está em uso.' }
  }
  if (input.usuarioAtual && (!conta || conta.id === input.usuarioAtual)) {
    return { tipo: 'manter', usuarioId: input.usuarioAtual, reativar: Boolean(conta && !conta.ativo) }
  }
  if (conta) return { tipo: 'vincular', usuarioId: conta.id }
  return { tipo: 'criar' }
}
