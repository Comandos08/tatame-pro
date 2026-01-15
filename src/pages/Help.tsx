import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Users, Award, CreditCard, FileText, ArrowLeft, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

export default function Help() {
  const { t } = useI18n();

  const sections = [
    {
      icon: Users,
      title: t('help.membership'),
      description: 'Como funciona o processo de filiação de atletas',
      content: [
        'Acesse a página de filiação pelo portal da sua organização',
        'Escolha se é atleta adulto ou menor de idade',
        'Preencha os dados pessoais e documentos necessários',
        'Realize o pagamento via cartão de crédito ou PIX',
        'Aguarde a aprovação da organização',
      ],
    },
    {
      icon: Award,
      title: t('help.gradings'),
      description: 'Sistema de graduações e promoções',
      content: [
        'Graduações são registradas pela academia ou professor responsável',
        'Cada modalidade possui seu próprio sistema de faixas/níveis',
        'Histórico completo disponível no seu perfil',
        'Requisitos mínimos de tempo e idade são verificados automaticamente',
      ],
    },
    {
      icon: CreditCard,
      title: t('help.digitalCard'),
      description: 'Sua carteira digital de atleta',
      content: [
        'Após aprovação, sua carteira digital é gerada automaticamente',
        'Contém QR Code para verificação de autenticidade',
        'Disponível para download em PDF',
        'Validade vinculada ao período de filiação',
      ],
    },
    {
      icon: FileText,
      title: t('help.diplomas'),
      description: 'Certificados de graduação',
      content: [
        'Diplomas são emitidos a cada promoção de graduação',
        'Contém número serial único para verificação',
        'Disponível para download em PDF',
        'QR Code para verificação pública',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold">IPPON</span>
            </Link>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
              <HelpCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              {t('help.title')}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Guia completo sobre como utilizar o sistema IPPON para gestão de federações esportivas.
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
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <section.icon className="h-6 w-6 text-primary" />
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
                    <ul className="space-y-2 ml-16">
                      {section.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-muted-foreground">
                          <span className="text-primary mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">
              Ainda tem dúvidas? Entre em contato com sua organização esportiva.
            </p>
            <Button asChild>
              <Link to="/">Voltar para a página inicial</Link>
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
