'use client'

import { useTranslations } from 'next-intl'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@workspace/ui/components/ui/accordion'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { Badge } from '@workspace/ui/components/ui/badge'
import { LandingFrame } from '@/components/layout/landing-frame'

export type FAQs = {
  question: string
  answer: string
}[]

const FAQ = () => {
  const t = useTranslations('faq')
  const faqItems = t.raw('items') as FAQs

  return (
    <section id='faq'>
      <LandingFrame contentClassName='bg-background'>
      <div className='flex w-full min-w-0 flex-col gap-8 px-4 py-10 sm:gap-12 sm:px-6 sm:py-16 lg:gap-16 lg:px-8 lg:py-24'>
        <MotionPreset
          fade
          slide={{ direction: 'down', offset: 50 }}
          blur
          transition={{ duration: 0.5 }}
          className='space-y-3 text-center sm:space-y-4'
        >
          <MotionPreset fade blur slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.5 }}>
            <Badge variant='outline' className='rounded-none'>
              {t('badge')}
            </Badge>
          </MotionPreset>

          <h2 className='text-balance text-2xl font-semibold sm:text-3xl lg:text-4xl'>{t('title')}</h2>

          <p className='mx-auto max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg md:text-xl'>
            {t('description')}
          </p>
        </MotionPreset>

        <Accordion
          type='single'
          collapsible
          defaultValue='item-1'
          className='mx-auto w-full min-w-0 max-w-3xl'
        >
          {faqItems.map((item, index) => (
            <AccordionItem key={index} value={`item-${index + 1}`}>
              <AccordionTrigger className='py-4 text-left text-sm sm:py-5 sm:text-base'>{item.question}</AccordionTrigger>
              <AccordionContent className='pb-4 text-sm text-muted-foreground sm:pb-5 sm:text-base'>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      </LandingFrame>
    </section>
  )
}

export default FAQ
