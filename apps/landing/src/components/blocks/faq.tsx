'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@workspace/ui/components/ui/accordion'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import AtmosPreview from '@/assets/img/atmos_preview.png'
import { Badge } from '@workspace/ui/components/ui/badge'


export type FAQs = {
  question: string
  answer: string
}[]

const FAQ = () => {
  const t = useTranslations('faq')
  const faqItems = t.raw('items') as FAQs
  const [activeItem, setActiveItem] = useState<string>('item-1')
  const [rotationKey, setRotationKey] = useState(0)

  const handleValueChange = (value: string) => {
    setActiveItem(value)
    setRotationKey(prev => prev + 1)
  }

  return (
    <section id='faq'>
      <div className='mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 bg-background px-4 py-10 min-[1147px]:border-x sm:gap-12 sm:px-6 sm:py-16 lg:gap-16 lg:px-8 lg:py-24'>
        {/* FAQ Header */}
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

        <div className='grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2'>
          <Accordion value={activeItem} onValueChange={handleValueChange} type='single' collapsible className='w-full min-w-0'>
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index + 1}`}>
                <AccordionTrigger className='py-4 text-left text-sm sm:py-5 sm:text-base'>{item.question}</AccordionTrigger>
                <AccordionContent className='pb-4 text-sm text-muted-foreground sm:pb-5 sm:text-base'>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Right content */}
          <div className='group relative mx-auto flex aspect-[4/3] max-h-72 w-full max-w-148 items-end justify-center overflow-hidden rounded-xl border bg-muted sm:aspect-auto sm:h-full sm:max-h-116 lg:max-xl:max-h-95'>
            <Image
              src={AtmosPreview}
              alt={t('previewAlt')}
              className='h-full w-full origin-bottom scale-90 rounded-t-md object-cover object-top shadow-md transition-transform duration-500 group-hover:scale-100'
            />

            {['top-4.5 left-4.5', 'top-4.5 right-4.5', 'bottom-4.5 left-4.5', 'bottom-4.5 right-4.5'].map(
              (position, idx) => (
                <motion.svg
                  key={`${idx}-${rotationKey}`}
                  xmlns='http://www.w3.org/2000/svg'
                  width='10'
                  height='12'
                  viewBox='0 0 10 12'
                  fill='none'
                  className={cn(
                    'absolute transition-opacity duration-500 group-hover:opacity-0 max-md:hidden',
                    position
                  )}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                >
                  <path d='M5 0L10 6L5 12L0 6L5 0Z' fill='var(--primary)' />
                </motion.svg>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default FAQ
