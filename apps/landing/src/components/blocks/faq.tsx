'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@workspace/ui/components/ui/accordion'
import { MotionPreset } from '@workspace/ui/components/ui/motion-preset'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import AtmosPreview from '@/assets/img/atmos_preview.png'
import { BlinkingGrid } from '@/components/ui/blinking-grid'

export type FAQs = {
  question: string
  answer: string
}[]

const FAQ = ({ faqItems }: { faqItems: FAQs }) => {
  const [activeItem, setActiveItem] = useState<string>('item-1')
  const [rotationKey, setRotationKey] = useState(0)

  const handleValueChange = (value: string) => {
    setActiveItem(value)
    setRotationKey(prev => prev + 1)
  }

  return (
    <section id='faq'>
      <MotionPreset className='relative flex border-y max-[1196px]:mx-auto max-[1196px]:max-w-6xl'>
        <BlinkingGrid className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden' />

        <div className='bg-background flex w-full max-w-6xl shrink-0 flex-col gap-8 px-4 py-12 min-[1147px]:border-x sm:gap-16 sm:px-6 sm:py-16 lg:px-8 lg:py-24'>
          {/* FAQ Header */}
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 50 }}
            blur
            transition={{ duration: 0.5 }}
            className='mb-12 space-y-4 text-center sm:mb-16 lg:mb-24'
          >
            <p className='text-primary text-sm font-medium uppercase'>FAQ</p>

            <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>Frequently asked questions</h2>

            <p className='text-muted-foreground mx-auto max-w-2xl text-xl'>
              Here are some quick answers to help you understand how Atmos powers your productivity.
            </p>
          </MotionPreset>

          <div className='grid grid-cols-1 gap-8 lg:grid-cols-2'>
            <Accordion value={activeItem} onValueChange={handleValueChange} type='single' collapsible className='w-full'>
              {faqItems.map((item, index) => (
                <AccordionItem key={index} value={`item-${index + 1}`}>
                  <AccordionTrigger className='py-5 text-base'>{item.question}</AccordionTrigger>
                  <AccordionContent className='text-muted-foreground pb-5 text-base'>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Right content */}
            <div className='group bg-muted relative mx-auto flex h-full max-h-116 w-full max-w-148 items-end justify-center overflow-hidden rounded-xl border lg:max-xl:max-h-95'>
              <Image
                src={AtmosPreview}
                alt='Atmos Dashboard'
                className='h-full w-full origin-bottom scale-90 rounded-t-md shadow-md transition-transform duration-500 group-hover:scale-100 object-cover object-top'
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

        <BlinkingGrid className='m-1.75 w-full shrink-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent)_2px,transparent_2px)] bg-size-[18px_18px] max-[1196px]:hidden' />
      </MotionPreset>
    </section>
  )
}

export default FAQ
