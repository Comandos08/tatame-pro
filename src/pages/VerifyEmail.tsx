import { useLocation, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft } from "lucide-react";
import iconLogo from "@/assets/iconLogo.png";

export default function VerifyEmail() {
  const location = useLocation();
  const email = location.state?.email;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4 pb-2">
          <div className="mx-auto">
            <img src={iconLogo} alt="TATAME" className="h-10 w-10 rounded-xl object-contain mx-auto mb-4" />
          </div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verifique seu e-mail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Enviamos um link de verificação para:
          </p>
          {email && (
            <p className="font-medium text-foreground break-all">{email}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Clique no link enviado para verificar sua conta e começar a usar a plataforma.
          </p>
          <div className="pt-4">
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para Login
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
