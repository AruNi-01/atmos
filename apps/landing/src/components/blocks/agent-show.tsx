import { Marquee } from '@workspace/ui/components/ui/marquee'
import { useTranslations } from 'next-intl'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { BlinkingGrid } from '@/components/ui/blinking-grid'

const agents = [
  { name: 'Claude Code', icon: '/agents/claude.svg' },
  { name: 'Codex', icon: '/agents/codex.svg' },
  { name: 'Amp', icon: '/agents/amp.svg' },
  { name: 'Droid', icon: '/agents/droid.svg' },
  { name: 'Kilo', icon: '/agents/kilo.svg' },
  { name: 'OpenCode', icon: '/agents/opencode.svg' },
  { name: 'Pi', icon: '/agents/pi.svg', nativeTheme: true },
  { name: 'OpenClaw', icon: '/agents/openclaw.jpg', nativeTheme: true },
  { name: 'Hermes Agent', icon: '/agents/hermes-agent.png', nativeTheme: true },
  { name: 'Gemini', icon: '/agents/gemini.svg' },
  { name: 'Devin', icon: '/agents/devin.svg' },
] as const

export const AgentShow = () => {
  const t = useTranslations('agentShow')

  return (
    <MotionPreset
      fade
      blur
      transition={{ duration: 0.5 }}
      delay={0.15}
      className='relative flex w-full min-w-0 overflow-hidden border-y max-[1196px]:mx-auto max-[1196px]:max-w-6xl'
    >
      <BlinkingGrid className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden' />

      <div className='flex w-full min-w-0 max-w-6xl grow flex-col gap-2.5 bg-background px-4 py-3 min-[1147px]:border-x sm:px-6 sm:py-2.5 md:flex-row md:items-center lg:px-8'>
        <MotionPreset
          fade
          slide
          blur
          transition={{ duration: 0.5 }}
          delay={0.6}
          className='flex shrink-0 items-center justify-center gap-1.75 text-center md:justify-start md:text-left'
        >
          <div>
            <p className='pr-0 text-sm font-medium sm:text-base md:pr-4 md:text-lg md:text-nowrap'>
              {t('title')}
            </p>
          </div>
        </MotionPreset>
        <MotionPreset fade blur delay={0.7} transition={{ duration: 0.5 }} className='relative w-full min-w-0 overflow-hidden'>
          <div className='pointer-events-none absolute inset-y-0 left-0 z-1 w-6 bg-linear-to-r from-background via-85% to-transparent sm:w-10' />
          <div className='pointer-events-none absolute inset-y-0 right-0 z-1 w-6 bg-linear-to-l from-background via-85% to-transparent sm:w-10' />
          <Marquee pauseOnHover duration={30} gap={5} className='*:items-center'>
            {agents.map((agent) => (
              <div key={agent.name} className='flex items-center gap-1.5 sm:gap-2'>
                <img
                  src={agent.icon}
                  alt={agent.name}
                  className={`size-5 sm:size-6 ${getAgentIconClassName(agent)}`}
                />
                <span className='text-sm font-semibold opacity-70 sm:text-base md:text-lg'>{agent.name}</span>
              </div>
            ))}
          </Marquee>
        </MotionPreset>
      </div>
      <BlinkingGrid className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden' />
    </MotionPreset>
  )
}

export default AgentShow

function getAgentIconClassName(agent: (typeof agents)[number]) {
  if ('nativeTheme' in agent && agent.nativeTheme) return 'invert-0'
  if (agent.name === 'Devin') return 'dark:invert invert-0'
  return 'invert dark:invert-0'
}
