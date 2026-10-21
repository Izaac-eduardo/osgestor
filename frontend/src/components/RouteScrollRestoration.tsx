import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

const routeScrollContainers = '[data-route-scroll-container], .app-shell__main, .page-content'

function isScrollDebugEnabled() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('debugScroll') === '1'
}

function scrollSnapshot() {
  const root = document.scrollingElement
  const content = document.querySelector<HTMLElement>('[data-route-scroll-container]')
  const shell = document.querySelector<HTMLElement>('.app-shell__main')
  return {
    windowY: window.scrollY,
    documentY: root?.scrollTop ?? 0,
    bodyY: document.body.scrollTop,
    shellY: shell?.scrollTop ?? 0,
    contentY: content?.scrollTop ?? 0,
  }
}

function debugScroll(pathname: string, phase: string) {
  if (isScrollDebugEnabled()) console.debug(`[osgestor-scroll] ${phase}`, pathname, scrollSnapshot())
}

function resetScroll(element: HTMLElement | null) {
  if (!element) return
  element.scrollTo({ top: 0, left: element.scrollLeft, behavior: 'auto' })
  element.scrollTop = 0
}

function resetRouteScroll() {
  const containers = new Set<HTMLElement>([
    ...Array.from(document.querySelectorAll<HTMLElement>(routeScrollContainers)),
    document.scrollingElement as HTMLElement | null,
    document.body,
  ].filter((element): element is HTMLElement => element !== null))

  containers.forEach(resetScroll)
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

/** Restores the route scroll without touching nested tables, dialogs, or menus. */
export function RouteScrollRestoration() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previousRestoration
    }
  }, [])

  useLayoutEffect(() => {
    debugScroll(pathname, 'before-reset')
    resetRouteScroll()
    debugScroll(pathname, 'after-reset')
    const frame = window.requestAnimationFrame(() => {
      resetRouteScroll()
      debugScroll(pathname, 'after-frame')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  return null
}
