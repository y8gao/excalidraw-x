import { getUiStrings } from './desktopUiStrings'

describe('desktop UI strings', () => {
  it('labels auto appearance as System in English', () => {
    expect(getUiStrings('en').menuAppearanceAuto).toBe('System')
  })
})
