import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Building2, Users, Settings, LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/contexts/AuthContext';

export default function AdminDashboard() {
  const { currentUser, signOut, isGlobalSuperadmin } = useCurrentUser();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isGlobalSuperadmin && currentUser) {
      navigate('/');
    }
  }, [isGlobalSuperadmin, currentUser, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const stats = [
    { label: 'Organizações Ativas', value: '12', icon: Building2, color: 'text-primary' },
    { label: 'Usuários Totais', value: '1,234', icon: Users, color: 'text-info' },
    { label: 'Atletas Filiados', value: '8,567', icon: Activity, color: 'text-success' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold">IPPON Admin</h1>
              <p className="text-xs text-muted-foreground">Painel Global</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{currentUser?.email}</span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold mb-2">
              Admin Global da Plataforma
            </h2>
            <p className="text-muted-foreground">
              Gerencie todas as organizações de esportes de combate da plataforma IPPON.
            </p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card className="card-hover">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </CardTitle>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-display font-bold">{stat.value}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Placeholder content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Área Administrativa
              </CardTitle>
              <CardDescription>
                Esta é a área de administração global da plataforma de esportes de combate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground">
                  Funcionalidades de gestão de tenants, usuários globais e configurações 
                  serão implementadas nas próximas fases.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
