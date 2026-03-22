import { Marquee } from '@workspace/ui/components/ui/marquee'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { BlinkingGrid } from '@/components/ui/blinking-grid'

export const AgentShow = () => {
  return (
    <MotionPreset
      fade
      blur
      transition={{ duration: 0.5 }}
      delay={0.15}
      className='relative flex border-y max-[1196px]:mx-auto max-[1196px]:max-w-6xl'
    >
      <BlinkingGrid className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden' />

      <div className='bg-background flex max-w-6xl grow gap-2.5 px-4 py-2.5 max-md:flex-col min-[1147px]:border-x sm:px-6 lg:px-8'>
        <MotionPreset
          fade
          slide
          blur
          transition={{ duration: 0.5 }}
          delay={0.6}
          className='flex shrink-0 items-center gap-1.75 max-md:justify-center max-sm:flex-col max-sm:text-center'
        >
          <div>
            <p className='text-lg font-medium text-nowrap pr-4'>Build with any agent</p>
          </div>
        </MotionPreset>
        <MotionPreset fade blur delay={0.7} transition={{ duration: 0.5 }} className='relative overflow-hidden w-full'>
          <div className='from-background pointer-events-none absolute inset-y-0 left-0 z-1 w-10 bg-linear-to-r via-85% to-transparent' />
          <div className='from-background pointer-events-none absolute inset-y-0 right-0 z-1 w-10 bg-linear-to-l via-85% to-transparent' />
          <Marquee pauseOnHover duration={30} gap={5} className='*:items-center'>
            <div className='flex items-center gap-2'>
              <img src="/agents/claude.svg" alt="Claude Code" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>Claude Code</span>
            </div>
            <div className='flex items-center gap-2'>
              <img src="/agents/codex.svg" alt="Codex" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>Codex</span>
            </div>
            <div className='flex items-center gap-2'>
              <img src="/agents/amp.svg" alt="Amp" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>Amp</span>
            </div>
            <div className='flex items-center gap-2'>
              <img src="/agents/droid.svg" alt="Droid" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>Droid</span>
            </div>
            <div className='flex items-center gap-2'>
              <img src="/agents/kilo.svg" alt="Kilo" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>Kilo</span>
            </div>
            <div className='flex items-center gap-2'>
              <img src="/agents/opencode.svg" alt="OpenCode" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>OpenCode</span>
            </div>
            <div className='flex items-center gap-2'>
              <img src="/agents/gemini.svg" alt="Gemini" className="size-6" />
              <span className='text-lg font-semibold opacity-70'>Gemini</span>
            </div>
          </Marquee>
        </MotionPreset>
      </div>
      <BlinkingGrid className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden' />
    </MotionPreset>
  )
}

export default AgentShow
