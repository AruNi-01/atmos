import * as THREE from 'three'

const RADIUS = 190
const PLANE_SIZE = 56
const AUTO_ROT_Y = 0.0005
const AUTO_ROT_X = 0.0002
const DRAG_EASE = 0.2
const HOVER_SCALE = 1.2
const SCALE_EASE = 0.1
const OPACITY_EASE = 0.12
const INERTIA_DECAY = 0.94
const FLICK_SCALE = 0.9

const CLICK_SLOP = 6
const FOCUS_EASE = 0.14
const FOCUS_DISTANCE = 260
/** Focused plane fills nearly the entire section canvas. */
const FOCUS_FILL = 0.96
const BACKDROP_DIM = 0.12

export interface ImageSphereOptions {
  distance?: number
  fov?: number
  onFocusChange?: (id: string | null, index: number | null) => void
  onVideoEnded?: (id: string, index: number) => void
  onProgress?: (progress01: number) => void
}

export interface SphereItem {
  id: string
  coverUrl: string
  videoUrl?: string
}

type PlaneMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

type PlaneUserData = {
  id: string
  index: number
  isHovered: boolean
  opacity: number
  focus: number
  aspect: number
  home: THREE.Vector3
  coverMap: THREE.Texture
  videoUrl?: string
  video?: HTMLVideoElement
  videoMap?: THREE.VideoTexture
  onEnded?: () => void
}

export class ImageSphere {
  private host: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private group = new THREE.Group()
  private planes: PlaneMesh[] = []

  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2(-2, -2)
  private hovered: PlaneMesh | null = null
  private focused: PlaneMesh | null = null

  private rotationX = 0
  private rotationY = 0
  private currentRotationX = 0
  private currentRotationY = 0
  private baseRotationX = 0
  private baseRotationY = 0

  private dragging = false
  private startX = 0
  private startY = 0

  private velX = 0
  private velY = 0
  private lastDX = 0
  private lastDY = 0

  private invQuat = new THREE.Quaternion()
  private worldPos = new THREE.Vector3()
  private centerPos = new THREE.Vector3()
  private tmpPos = new THREE.Vector3()

  private raf = 0
  private running = false
  private disposed = false

  private ro?: ResizeObserver
  private cleanup: (() => void)[] = []
  private onFocusChange?: ImageSphereOptions['onFocusChange']
  private onVideoEnded?: ImageSphereOptions['onVideoEnded']
  private onProgress?: ImageSphereOptions['onProgress']

  constructor(host: HTMLElement, items: SphereItem[], opts: ImageSphereOptions = {}) {
    this.host = host
    this.onFocusChange = opts.onFocusChange
    this.onVideoEnded = opts.onVideoEnded
    this.onProgress = opts.onProgress
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    this.renderer.setPixelRatio(dpr)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setSize(w, h)
    const canvas = this.renderer.domElement
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      cursor: 'grab',
      touchAction: 'none',
    })
    host.appendChild(canvas)

    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 25, w / h, 0.1, 2000)
    this.camera.position.z = opts.distance ?? 520
    this.scene.add(this.group)

    this.loadPlanes(items)
    this.bindEvents()
  }

  private loadPlanes(items: SphereItem[]) {
    const loader = new THREE.TextureLoader()
    loader.crossOrigin = 'anonymous'

    items.forEach((item, index) => {
      loader.load(
        item.coverUrl,
        (tex) => {
          if (this.disposed) {
            tex.dispose()
            return
          }
          tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
          tex.minFilter = THREE.LinearMipmapLinearFilter
          tex.magFilter = THREE.LinearFilter
          tex.colorSpace = THREE.SRGBColorSpace

          const aspect = (tex.image?.width || 16) / (tex.image?.height || 10)
          const geo = new THREE.PlaneGeometry(PLANE_SIZE * aspect, PLANE_SIZE)
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
          mat.depthWrite = false
          const plane = new THREE.Mesh(geo, mat) as PlaneMesh

          // Fibonacci sphere distribution (stable, even)
          const golden = Math.PI * (3 - Math.sqrt(5))
          const y = 1 - (index / Math.max(items.length - 1, 1)) * 2
          const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y))
          const theta = golden * index + index * 0.17
          const r = RADIUS + ((index * 37) % 17) - 8
          plane.position.set(
            Math.cos(theta) * radiusAtY * r,
            y * r * 0.92,
            Math.sin(theta) * radiusAtY * r
          )

          const userData: PlaneUserData = {
            id: item.id,
            index,
            isHovered: false,
            opacity: 0,
            focus: 0,
            aspect,
            home: plane.position.clone(),
            coverMap: tex,
            videoUrl: item.videoUrl,
          }
          plane.userData = userData
          mat.opacity = 0

          this.group.add(plane)
          this.planes.push(plane)

          if (!this.running) this.renderStill()
        },
        undefined,
        () => {
          // skip failed covers
        }
      )
    })
  }

  private bindEvents() {
    const host = this.host
    const localMouse = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect()
      this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -(((clientY - rect.top) / rect.height) * 2 - 1)
    }

    let downX = 0
    let downY = 0
    const onDown = (e: PointerEvent) => {
      // Don't start drag when UI chrome handles the event (buttons live outside canvas host usually)
      this.dragging = true
      this.startX = e.clientX
      this.startY = e.clientY
      downX = e.clientX
      downY = e.clientY
      this.velX = this.velY = 0
      this.lastDX = this.lastDY = 0
      this.renderer.domElement.style.cursor = 'grabbing'
      try {
        host.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    const onMove = (e: PointerEvent) => {
      localMouse(e.clientX, e.clientY)
      if (this.dragging) {
        const dx = e.clientX - this.startX
        const dy = e.clientY - this.startY
        this.rotationY += dx * 1.0
        this.rotationX -= dy * 1.0
        this.lastDX = dx
        this.lastDY = dy
        this.startX = e.clientX
        this.startY = e.clientY
      }
    }
    const release = () => {
      if (!this.dragging) return
      this.dragging = false
      this.velY = this.lastDX * FLICK_SCALE
      this.velX = -this.lastDY * FLICK_SCALE
      this.renderer.domElement.style.cursor = this.hovered ? 'pointer' : 'grab'
    }
    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
      release()

      if (moved <= CLICK_SLOP && this.running) {
        this.velX = this.velY = 0
        localMouse(e.clientX, e.clientY)
        const hit = this.pick()
        if (this.focused) {
          // Same card or empty space → unfocus (flies home). Another card → switch.
          if (!hit || hit === this.focused) this.setFocused(null)
          else this.setFocused(hit)
        } else if (hit) {
          this.setFocused(hit)
        }
      }
    }
    const onLeave = () => {
      release()
      this.mouse.set(-2, -2)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.focused) this.setFocused(null)
    }
    window.addEventListener('keydown', onKey)
    this.cleanup.push(() => window.removeEventListener('keydown', onKey))

    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    host.addEventListener('pointerleave', onLeave)
    this.cleanup.push(() => {
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointerleave', onLeave)
    })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
  }

  private setFocused(plane: PlaneMesh | null) {
    if (this.focused === plane) return

    if (this.focused) {
      this.detachVideo(this.focused)
    }

    this.focused = plane

    if (plane) {
      this.attachVideo(plane)
      const data = plane.userData as PlaneUserData
      this.onFocusChange?.(data.id, data.index)
    } else {
      this.onProgress?.(0)
      this.onFocusChange?.(null, null)
    }
  }

  private attachVideo(plane: PlaneMesh) {
    const data = plane.userData as PlaneUserData
    if (!data.videoUrl) return

    if (!data.video) {
      const video = document.createElement('video')
      video.src = data.videoUrl
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.loop = false
      video.playsInline = true
      video.preload = 'auto'
      data.video = video
    }

    const video = data.video
    if (data.onEnded) {
      video.removeEventListener('ended', data.onEnded)
    }
    data.onEnded = () => {
      const d = plane.userData as PlaneUserData
      this.onVideoEnded?.(d.id, d.index)
    }
    video.addEventListener('ended', data.onEnded)

    if (!data.videoMap) {
      const map = new THREE.VideoTexture(video)
      map.colorSpace = THREE.SRGBColorSpace
      map.minFilter = THREE.LinearFilter
      map.magFilter = THREE.LinearFilter
      map.generateMipmaps = false
      data.videoMap = map
    }

    plane.material.map = data.videoMap
    plane.material.needsUpdate = true
    try {
      video.currentTime = 0
    } catch {
      // ignore
    }
    video.play().catch(() => {})
  }

  private detachVideo(plane: PlaneMesh) {
    const data = plane.userData as PlaneUserData
    if (data.video) {
      if (data.onEnded) {
        data.video.removeEventListener('ended', data.onEnded)
        data.onEnded = undefined
      }
      data.video.pause()
      try {
        data.video.currentTime = 0
      } catch {
        // ignore
      }
    }
    plane.material.map = data.coverMap
    plane.material.needsUpdate = true
  }

  private resize() {
    if (this.disposed) return
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private pick(): PlaneMesh | null {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const hits = this.raycaster.intersectObjects(this.planes, false)
    return (hits.length > 0 ? hits[0].object : null) as PlaneMesh | null
  }

  private hoverDetection() {
    const next = this.pick()
    if (next !== this.hovered) {
      if (this.hovered) (this.hovered.userData as PlaneUserData).isHovered = false
      this.hovered = next
      if (this.hovered) (this.hovered.userData as PlaneUserData).isHovered = true
      if (!this.dragging) {
        this.renderer.domElement.style.cursor = next ? 'pointer' : 'grab'
      }
    }
  }

  start() {
    if (this.running || this.disposed) return
    this.running = true
    this.raf = requestAnimationFrame(this.loop)
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  clearFocus() {
    this.setFocused(null)
  }

  focusById(id: string) {
    const plane = this.planes.find((p) => (p.userData as PlaneUserData).id === id)
    if (plane) this.setFocused(plane)
  }

  getFocusedId(): string | null {
    return this.focused ? (this.focused.userData as PlaneUserData).id : null
  }

  private loop = () => {
    if (!this.running) return

    if (!this.dragging && (this.velX !== 0 || this.velY !== 0)) {
      this.rotationY += this.velY
      this.rotationX -= this.velX
      this.velX *= INERTIA_DECAY
      this.velY *= INERTIA_DECAY
      if (Math.abs(this.velX) < 0.01) this.velX = 0
      if (Math.abs(this.velY) < 0.01) this.velY = 0
    }

    // Keep orbiting even while a card is focused — focused plane stays
    // camera-locked via worldToLocal(centerPos) below.
    this.baseRotationY += AUTO_ROT_Y
    this.baseRotationX += AUTO_ROT_X
    this.currentRotationX += (this.rotationX - this.currentRotationX) * DRAG_EASE
    this.currentRotationY += (this.rotationY - this.currentRotationY) * DRAG_EASE
    this.group.rotation.x = this.baseRotationX + this.currentRotationX * 0.002
    this.group.rotation.y = this.baseRotationY + this.currentRotationY * 0.002

    if (!this.dragging && !this.focused) this.hoverDetection()
    else if (this.focused && this.hovered) {
      ;(this.hovered.userData as PlaneUserData).isHovered = false
      this.hovered = null
    }
    const anyFocused = this.focused !== null

    this.centerPos.set(0, 0, this.camera.position.z - FOCUS_DISTANCE)
    const viewH = 2 * FOCUS_DISTANCE * Math.tan((this.camera.fov * Math.PI) / 360)
    const viewW = viewH * this.camera.aspect

    this.invQuat.copy(this.group.quaternion).invert()
    for (const plane of this.planes) {
      const data = plane.userData as PlaneUserData
      plane.quaternion.copy(this.invQuat)

      const focusTarget = plane === this.focused ? 1 : 0
      const f = data.focus + (focusTarget - data.focus) * FOCUS_EASE
      data.focus = f

      // Fly between home (sphere slot) and camera-center focus — same as original prompt
      if (f > 0.0005) {
        this.tmpPos.copy(this.centerPos)
        this.group.worldToLocal(this.tmpPos)
        plane.position.copy(data.home).lerp(this.tmpPos, f)
      } else {
        plane.position.copy(data.home)
      }

      plane.getWorldPosition(this.worldPos)
      const depth = this.worldPos.z

      const zScale = 0.8 + depth / 2000
      const planeW = PLANE_SIZE * (data.aspect || 16 / 10)
      const planeH = PLANE_SIZE
      const focusScale = Math.min((viewH * FOCUS_FILL) / planeH, (viewW * FOCUS_FILL) / planeW)
      let target = data.isHovered ? zScale * HOVER_SCALE : zScale
      target = target + (focusScale - target) * f
      const s = plane.scale.x + (target - plane.scale.x) * SCALE_EASE
      plane.scale.set(s, s, s)

      let wantOpacity = 1
      if (anyFocused) wantOpacity = BACKDROP_DIM + (1 - BACKDROP_DIM) * f
      const o = data.opacity + (wantOpacity - data.opacity) * OPACITY_EASE
      data.opacity = o
      plane.material.opacity = o

      if (plane === this.focused && data.videoMap) {
        data.videoMap.needsUpdate = true
        const video = data.video
        if (video && video.duration > 0 && Number.isFinite(video.duration)) {
          this.onProgress?.(Math.min(1, Math.max(0, video.currentTime / video.duration)))
        }
      }

      plane.renderOrder = f > 0.5 ? 1 : 0
    }

    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.loop)
  }

  renderStill() {
    this.invQuat.copy(this.group.quaternion).invert()
    for (const plane of this.planes) {
      const data = plane.userData as PlaneUserData
      plane.quaternion.copy(this.invQuat)
      plane.getWorldPosition(this.worldPos)
      const zScale = 0.8 + this.worldPos.z / 2000
      plane.scale.set(zScale, zScale, zScale)
      data.opacity = 1
      plane.material.opacity = 1
    }
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.disposed = true
    this.stop()
    this.cleanup.forEach((fn) => fn())
    this.ro?.disconnect()
    for (const plane of this.planes) {
      const data = plane.userData as PlaneUserData
      plane.geometry.dispose()
      data.coverMap.dispose()
      if (data.videoMap) data.videoMap.dispose()
      if (data.video) {
        if (data.onEnded) data.video.removeEventListener('ended', data.onEnded)
        data.video.pause()
        data.video.src = ''
        data.video.load()
      }
      plane.material.dispose()
    }
    this.renderer.dispose()
    this.renderer.forceContextLoss?.()
    const canvas = this.renderer.domElement
    canvas.parentNode?.removeChild(canvas)
  }
}
