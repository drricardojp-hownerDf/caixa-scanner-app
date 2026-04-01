import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Heart, Building2, TrendingUp, RefreshCw, Smartphone, ArrowRightLeft } from "lucide-react";

const navItems = [
  { label: "Painel", href: "/", icon: LayoutDashboard },
  { label: "Favoritos", href: "/?favoritos=true", icon: Heart },
  { label: "Comparar", href: "/compare", icon: ArrowRightLeft },
  { label: "Sincronizar", href: "/sync", icon: RefreshCw },
];

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="Caixa Scanner Logo">
      <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M10 16L14 20L22 12" stroke="hsl(160, 84%, 28%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12H30" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Caixa Scanner</h1>
            <p className="text-xs text-muted-foreground">Imóveis & Análise</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href || (item.href === "/" && location === "/")}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Estratégias</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/?orderBy=score">
                    <TrendingUp className="h-4 w-4" />
                    <span>Melhor Score</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/?orderBy=desconto">
                    <Building2 className="h-4 w-4" />
                    <span>Maior Desconto</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Ferramentas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/shortcut"}
                >
                  <Link href="/shortcut">
                    <Smartphone className="h-4 w-4" />
                    <span>Atalho iOS</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Sobre</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              Encontre imóveis da Caixa Econômica Federal com desconto. Analise a viabilidade para FLIP, reforma ou aluguel.
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
