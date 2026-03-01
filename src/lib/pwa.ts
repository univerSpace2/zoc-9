import { registerSW } from 'virtual:pwa-register'

let registrationHandler: (() => void) | null = null

export function initPwa(): void {
  if (registrationHandler) {
    return
  }

  registrationHandler = registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('ZOC9: 오프라인 캐시 준비 완료')
    },
    onNeedRefresh() {
      console.info('ZOC9: 새 버전이 준비되었습니다. 새로고침하세요.')
    },
  })
}
