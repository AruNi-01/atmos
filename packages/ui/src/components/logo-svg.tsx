import { useId, type SVGAttributes } from 'react'

/** Planet + ring + horizon mark. viewBox matches `app/icon.svg`. */
const RING_D =
  'M11.096 15.767a3.973 19.587 0 1 0 7.946 0a3.973 19.587 0 1 0-7.946 0zM11.582 15.767a3.487 17.193 0 1 0 6.974 0a3.487 17.193 0 1 0-6.974 0z'

const HORIZON_D = 'M0 16Q16 14.6 32 16Q16 17.4 0 16Z'

const LogoSvg = (props: SVGAttributes<SVGElement>) => {
  const clipId = `atmos-logo-front-${useId().replace(/:/g, '')}`

  return (
    <svg
      width='32'
      height='32'
      viewBox='0 0 32 32'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx='0.785' cy='27.345' r='8.5' />
          <circle cx='29.353' cy='4.189' r='8.5' />
        </clipPath>
      </defs>
      <g fill='currentColor'>
        <path d={HORIZON_D} />
        <g transform='rotate(51 15.069 15.767)'>
          <path fillRule='evenodd' d={RING_D} />
        </g>
        <circle cx='16' cy='16' r='7.215' />
        <g clipPath={`url(#${clipId})`}>
          <g transform='rotate(51 15.069 15.767)'>
            <path fillRule='evenodd' d={RING_D} />
          </g>
        </g>
      </g>
    </svg>
  )
}

export default LogoSvg
