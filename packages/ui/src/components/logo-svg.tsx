import type { SVGAttributes } from 'react'

/**
 * Compact, monochrome rendering of the Atmos orbital command-port mark.
 * App-launcher artwork adds material and colour; this keeps navigation contexts crisp.
 */
const LogoSvg = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <rect x='1.5' y='1.5' width='29' height='29' rx='9' fill='currentColor' opacity='0.12' />
      <rect x='1.5' y='1.5' width='29' height='29' rx='9' stroke='currentColor' strokeWidth='1' opacity='0.22' />
      <circle cx='16' cy='16' r='10' stroke='currentColor' strokeWidth='1.25' opacity='0.5' />
      <circle cx='16' cy='16' r='6.5' stroke='currentColor' strokeWidth='1.75' opacity='0.82' />
      <circle cx='16' cy='16' r='3.5' fill='currentColor' />
      <circle cx='23.25' cy='10.25' r='1.25' fill='currentColor' opacity='0.76' />
    </svg>
  )
}

export default LogoSvg
