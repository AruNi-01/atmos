import type { SVGAttributes } from 'react'

const LogoSvg = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <circle cx='16' cy='16' r='6' stroke='currentColor' strokeWidth='2.5' />
      <circle cx='16' cy='16' r='10' stroke='currentColor' strokeWidth='1.5' opacity='0.6' />
      <circle cx='16' cy='16' r='14' stroke='currentColor' strokeWidth='0.5' opacity='0.3' strokeDasharray='4 4' />
    </svg>
  )
}

export default LogoSvg
