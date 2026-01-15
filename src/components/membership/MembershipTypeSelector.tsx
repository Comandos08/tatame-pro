import React from 'react';
import { motion } from 'framer-motion';
import { User, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';

export function MembershipTypeSelector() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();

  const options = [
    {
      id: 'adult',
      title: 'Atleta Adulto',
      description: 'Para atletas com 18 anos ou mais que farão a filiação em nome próprio.',
      icon: User,
      path: `/${tenantSlug}/membership/adult`,
    },
    {
      id: 'youth',
      title: 'Atleta Menor de Idade',
      description: 'Para atletas menores de 18 anos. A filiação será feita por um responsável legal.',
      icon: Users,
      path: `/${tenantSlug}/membership/youth`,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Filiação de Atleta
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Escolha o tipo de filiação para se juntar à {tenant?.name || 'organização'}.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {options.map((option, index) => (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="h-full card-hover cursor-pointer group" onClick={() => navigate(option.path)}>
                <CardHeader>
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <option.icon className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{option.title}</CardTitle>
                  <CardDescription className="text-base">
                    {option.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" variant="outline">
                    Selecionar
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          Ao continuar, você concorda com os termos de uso e política de privacidade.
        </motion.p>
      </div>
    </div>
  );
}
