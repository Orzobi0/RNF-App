
import React, { useState } from 'react';
    import { Link, useNavigate, useLocation } from 'react-router-dom';
    import { useAuth } from '@/contexts/AuthContext';
    import { Button } from '@/components/ui/button';
    import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
    import { Menu, LogOut, Home, Archive, UserCircle, X } from 'lucide-react';
    import { motion, AnimatePresence } from 'framer-motion';
import AppHeader from '@/components/AppHeader';
import useBackClose from '@/hooks/useBackClose';

    const NavLink = ({ to, children, Icon, onClick }) => {
      const location = useLocation();
      const isActive = location.pathname === to;
      return (
        <SheetClose asChild>
          <Link
            to={to}
            onClick={onClick}
            className={`flex items-center px-4 py-3 text-lg rounded-md transition-colors duration-200 ease-in-out
                         ${isActive
                          ? 'bg-[#E27DBF] text-white shadow'
                          : 'text-[#393C65] hover:bg-[#E27DBF]/10 hover:text-[#E27DBF]'}
                        `}
          >
            <Icon className={`mr-3 h-6 w-6 ${isActive ? 'text-white' : 'text-[#E27DBF]'}`} />
            {children}
          </Link>
        </SheetClose>
      );
    };

    const MainLayout = ({ children }) => {
      const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useBackClose(isSheetOpen, () => setIsSheetOpen(false));

      const handleLogout = () => {
        logout();
        navigate('/auth');
      };

       return (
         <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-40 w-full bg-[#FFB1DD]/20 backdrop-blur-md text-[#393C65]">
            <div className="container mx-auto flex items-center justify-between h-20 px-4 sm:px-6">
              <Link to="/" className="flex items-center space-x-2">
                                <img
                  alt="FertiliApp Logo "
                  className="h-10 w-10 rounded-full"
                  src="https://i.postimg.cc/W3JHZ71t/Chat-GPT-Image-27-jun-2025-12-17-23.png"
                />
                <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-pink-400 to-fuchsia-500">
                  FertiliApp
                </span>
              </Link>
              
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[#393C65] hover:text-[#E27DBF] hover:bg-[#E27DBF]\/10">
                    <Menu className="h-8 w-8" />
                    <span className="sr-only">Abrir menú</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[350px] bg-[#FFEAF5] border-l-[#FFB1DD] p-0 flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b border-[#FFB1DD]">
                     <div className="flex items-center space-x-3">
                        <UserCircle className="h-10 w-10 text-[#FFB1DD]" />
                        <div>
                            <p className="text-lg font-semibold">Hola,</p>
                            <p className="text-sm text-[#FFB1DD] truncate max-w-[180px]">{user?.email}</p>
                        </div>
                    </div>
                    <SheetClose asChild>
                         <Button variant="ghost" size="icon" className="text-[#E27DBF] hover:bg-white/10">
                            <X className="h-6 w-6" />
                         </Button>
                    </SheetClose>
                  </div>
                  
                  <nav className="flex-grow p-6 space-y-3">
                    <NavLink to="/" Icon={Home} onClick={() => setIsSheetOpen(false)}>Ciclo Actual</NavLink>
                    <NavLink to="/archived-cycles" Icon={Archive} onClick={() => setIsSheetOpen(false)}>Mis Ciclos</NavLink>
                  </nav>

                  <div className="p-6 border-t border-[#FFB1DD]">
                    <Button
                      onClick={() => { handleLogout(); setIsSheetOpen(false); }}
                      variant="outline"
                      className="w-full border-[#FFB1DD] text-[#393C65] hover:bg-[#E27DBF]/10 hover:text-[#E27DBF] font-semibold py-3 text-lg flex items-center"
                    >
                      <LogOut className="mr-2 h-5 w-5" /> Salir
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </header>
          
          <div className="flex-grow container mx-auto px-4 sm:px-6 py-8">
            {children}
          </div>

          <footer className="w-full py-8 text-center text-[#6B7280] text-sm border-t border-[#FFB1DD]/50 mt-12">
            <p>&copy; {new Date().getFullYear()} Seguimiento de Fertilidad. Todos los derechos reservados.</p>
            <p>Creado con Hostinger Horizons.</p>
          </footer>
        </div>
      );
    };

    export default MainLayout;
  