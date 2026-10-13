import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Logout01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useLogout } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { ROL_ETIKET } from "@prime/shared/types/domain"

export function UserMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useLogout()
  const navigate = useNavigate()
  const { isMobile } = useSidebar()

  if (!user) return null

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" aria-label="Kullanıcı menüsü" />
            }
          >
            <PersonelAvatar personel={user} size="sm" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {user.ad} {user.soyad}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {ROL_ETIKET[user.rol]}
              </span>
            </div>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="ml-auto size-4"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            className="min-w-56"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="grid text-sm leading-tight">
                  <span className="font-medium">
                    {user.ad} {user.soyad}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user.eposta}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/ayarlar")}>
              <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
              Ayarlar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              Çıkış yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
