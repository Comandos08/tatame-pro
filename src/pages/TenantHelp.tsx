import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Award, CreditCard, FileText, HelpCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { AppShell } from '@/layouts/AppShell';

export default function TenantHelp() {
  const { tenant } = useTenant();
  const { t } = useI18n();

  const sections = [
    {
      icon: Users,
      title: t('help.membership'),
      description: 'Como funciona o processo de filiação',
      steps: [
        { text: 'Preencha o formulário de filiação', done: true },
        { text: 'Envie os documentos necessários', done: true },
        { text: 'Realize o pagamento', done: true },
        { text: 'Aguarde aprovação da organização', done: false },
        { text: 'Receba sua carteira digital', done: false },
      ],
    },
    {
      icon: Award,
      title: t('help.gradings'),
      description: 'Sistema de graduações',
      steps: [
        { text: 'Graduações são registradas pelo seu professor', done: true },
        { text: 'Requisitos de tempo mínimo são verificados', done: true },
        { text: 'Diploma é gerado automaticamente', done: false },
        { text: 'QR Code para verificação de autenticidade', done: false },
      ],
    },
    {
      icon: CreditCard,
      title: t('help.digitalCard'),
      description: 'Sua identificação digital',
      steps: [
        { text: 'Gerada após aprovação da filiação', done: true },
        { text: 'Contém QR Code verificável', done: true },
        { text: 'Disponível em formato PDF', done: false },
        { text: 'Válida durante o período de filiação', done: false },
      ],
    },
    {
      icon: FileText,
      title: t('help.diplomas'),
      description: 'Certificados de graduação',
      steps: [
        { text: 'Emitidos a cada promoção', done: true },
        { text: 'Número serial único', done: true },
        { text: 'Verificação pública via QR Code', done: false },
      ],
    },
  ];

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <HelpCircle className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">
                {t('help.title')}
              </h1>
              <p className="text-muted-foreground">
                {tenant?.name}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground">
            Guia de uso do portal para atletas, professores e gestores.
          </p>
        </div>

        <div className="grid gap-6">
          {sections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div 
                      className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${tenant?.primaryColor}20` }}
                    >
                      <section.icon className="h-6 w-6" style={{ color: tenant?.primaryColor }} />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {section.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 ml-16">
                    {section.steps.map((step, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <CheckCircle 
                          className={`h-5 w-5 shrink-0 ${step.done ? 'text-success' : 'text-muted-foreground/30'}`} 
                        />
                        <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>
                          {step.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 p-6 rounded-xl bg-muted/50 text-center">
          <p className="text-muted-foreground mb-2">
            Precisa de mais ajuda? Entre em contato com a {tenant?.name}.
          </p>
          <p className="text-sm text-muted-foreground">
            Modalidades: {tenant?.sportTypes.join(', ')}
          </p>
        </div>
      </motion.div>
    </AppShell>
  );
}
