/**
 * 👤 HeaderUserMenu — User avatar dropdown for header
 * 
 * Contains: Profile info, Global Admin access (if superadmin), Logout
 * P-MENU-01: UX Cleanup
 */
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import iconLogo from '@/assets/iconLogo.png';

export function HeaderUserMenu() {
  const { currentUser, signOut, isGlobalSuperadmin } = useCurrentUser();
  const { t } = useI18n();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/portal');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const firstName = currentUser?.name?.split(' ')[0] || '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-9 px-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={currentUser?.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(currentUser?.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm font-medium max-w-[80px] truncate">
            {firstName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{currentUser?.name || 'Usuário'}</p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {currentUser?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isGlobalSuperadmin && (
          <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer">
            <img src={iconLogo} alt="" className="mr-2 h-4 w-4 rounded object-contain" />
            {t('nav.globalAdmin')}
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem 
          onClick={handleSignOut} 
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('nav.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
