import LogoSvg from '@/assets/svg/logo-svg'

// Util Imports
import { cn } from '@/lib/utils'

const Logo = ({ className }: { className?: string }) => {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoSvg className='size-8.5 text-primary' />
      <span className='text-primary text-[20px] font-medium uppercase'>Atmos</span>
    </div>
  )
}

export default Logo
