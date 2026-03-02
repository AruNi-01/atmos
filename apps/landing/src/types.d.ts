type StaticImageData = {
  src: string
  height: number
  width: number
  blurDataURL?: string
  blurWidth?: number
  blurHeight?: number
}

declare module '*.png' {
  const src: StaticImageData
  export default src
}

declare module '*.jpg' {
  const src: StaticImageData
  export default src
}

declare module '*.jpeg' {
  const src: StaticImageData
  export default src
}

declare module '*.gif' {
  const src: StaticImageData
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.ico' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: StaticImageData
  export default src
}
