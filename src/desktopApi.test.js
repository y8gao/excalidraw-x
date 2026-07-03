describe('desktopApi', () => {
  beforeEach(() => {
    jest.resetModules()
    document.body.innerHTML = ''
  })

  it('opens library anchors through the allowed desktop URL command', async () => {
    const invoke = jest.fn(async () => {})
    const listen = jest.fn(async () => () => {})

    jest.doMock('@tauri-apps/api/core', () => ({
      invoke,
      isTauri: () => true,
    }))
    jest.doMock('@tauri-apps/api/event', () => ({ listen }))

    const { prepareDesktopApi } = await import('./desktopApi.js')
    await prepareDesktopApi()

    const anchor = document.createElement('a')
    anchor.href = 'https://libraries.excalidraw.com/?theme=light'
    anchor.target = '_excalidraw_libraries'
    document.body.appendChild(anchor)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    const wasNotPrevented = anchor.dispatchEvent(click)

    expect(wasNotPrevented).toBe(false)
    expect(invoke).toHaveBeenCalledWith('open_allowed_url', { url: anchor.href })
  })
})