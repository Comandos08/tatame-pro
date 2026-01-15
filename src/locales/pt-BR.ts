export const ptBR = {
  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.athletes': 'Atletas',
  'nav.memberships': 'Filiações',
  'nav.academies': 'Academias',
  'nav.coaches': 'Professores',
  'nav.gradings': 'Graduações',
  'nav.approvals': 'Aprovações',
  'nav.settings': 'Configurações',
  'nav.help': 'Ajuda',
  'nav.auditLog': 'Auditoria',
  'nav.accessPortal': 'Acessar Portal',
  'nav.createAccount': 'Criar Conta',
  'nav.myAccount': 'Minha Conta',
  'nav.logout': 'Sair',
  'nav.globalAdmin': 'Admin Global',

  // Common
  'common.loading': 'Carregando...',
  'common.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Excluir',
  'common.edit': 'Editar',
  'common.view': 'Ver',
  'common.search': 'Buscar',
  'common.filter': 'Filtrar',
  'common.noResults': 'Nenhum resultado encontrado',
  'common.actions': 'Ações',
  'common.status': 'Status',
  'common.date': 'Data',
  'common.name': 'Nome',
  'common.email': 'E-mail',
  'common.phone': 'Telefone',
  'common.address': 'Endereço',

  // Theme
  'theme.light': 'Tema Claro',
  'theme.dark': 'Tema Escuro',
  'theme.system': 'Sistema',

  // Language
  'language.select': 'Idioma',
  'language.ptBR': 'Português (BR)',
  'language.en': 'English',
  'language.es': 'Español',

  // Membership Form
  'membership.title': 'Nova Filiação',
  'membership.adult': 'Adulto',
  'membership.youth': 'Menor de Idade',
  'membership.fullName': 'Nome Completo',
  'membership.birthDate': 'Data de Nascimento',
  'membership.nationalId': 'CPF',
  'membership.gender': 'Gênero',
  'membership.male': 'Masculino',
  'membership.female': 'Feminino',
  'membership.other': 'Outro',
  'membership.addressLine1': 'Endereço',
  'membership.addressLine2': 'Complemento',
  'membership.city': 'Cidade',
  'membership.state': 'Estado',
  'membership.postalCode': 'CEP',
  'membership.country': 'País',
  'membership.proceed': 'Continuar',
  'membership.payment': 'Pagamento',
  'membership.success': 'Filiação Realizada!',

  // Tenant Landing
  'tenant.welcome': 'Bem-vindo à',
  'tenant.about': 'Sobre a Organização',
  'tenant.joinNow': 'Filie-se Agora',
  'tenant.accreditedAcademies': 'Academias Credenciadas',
  'tenant.portalDesc': 'Portal oficial para atletas, academias e professores.',

  // Help
  'help.title': 'Central de Ajuda',
  'help.overview': 'Visão Geral',
  'help.membership': 'Filiação',
  'help.gradings': 'Graduações',
  'help.digitalCard': 'Carteira Digital',
  'help.diplomas': 'Diplomas',

  // Audit
  'audit.title': 'Log de Auditoria',
  'audit.eventType': 'Tipo de Evento',
  'audit.timestamp': 'Data/Hora',
  'audit.details': 'Detalhes',
  'audit.noEvents': 'Nenhum evento registrado',

  // Statuses
  'status.active': 'Ativa',
  'status.pending': 'Pendente',
  'status.approved': 'Aprovada',
  'status.rejected': 'Rejeitada',
  'status.expired': 'Expirada',
  'status.cancelled': 'Cancelada',
} as const;

export type TranslationKey = keyof typeof ptBR;
