import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowRight, Users, Award, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';

export default function TenantLanding() {
  const { tenant } = useTenant();

  if (!tenant) return null;

  const features = [
    { icon: Users, title: 'Filiação de Atletas', description: 'Cadastre-se e mantenha sua filiação em dia' },
    { icon: Award, title: 'Graduações', description: 'Acompanhe seu histórico de graduações' },
    { icon: Calendar, title: 'Eventos', description: 'Inscreva-se em competições e seminários' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div 
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <Shield className="h-6 w-6 text-white" />
              </div>
            )}
            <span className="font-display text-lg font-bold">{tenant.name}</span>
          </div>
          <Button asChild>
            <Link to={`/${tenant.slug}/app`}>
              Acessar Portal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm mb-6" style={{ color: tenant.primaryColor }}>
              {tenant.sportTypes.join(' • ')}
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Bem-vindo à{' '}
              <span style={{ color: tenant.primaryColor }}>{tenant.name}</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Portal oficial para atletas, academias e professores. 
              Gerencie sua filiação, graduações e inscrições em eventos.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="h-12 px-8" style={{ backgroundColor: tenant.primaryColor }} asChild>
                <Link to={`/${tenant.slug}/app`}>
                  Acessar Minha Conta
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8" asChild>
                <Link to="/login">Criar Conta</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="text-center"
              >
                <div 
                  className="h-14 w-14 rounded-xl mx-auto flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${tenant.primaryColor}20` }}
                >
                  <feature.icon className="h-7 w-7" style={{ color: tenant.primaryColor }} />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Powered by{' '}
            <Link to="/" className="text-primary hover:underline">IPPON</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
